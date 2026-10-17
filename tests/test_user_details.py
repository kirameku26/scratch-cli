import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "user.py"


class FakeUser:
    bio = "About me"
    username = "target_user"
    url = "https://scratch.mit.edu/users/target_user/"

    async def load_website(self):
        return None

    async def get_activities(self, limit):
        self.activity_limit = limit
        yield types.SimpleNamespace(
            action=types.SimpleNamespace(value="project_share"),
            actor=types.SimpleNamespace(username="target_user"),
            target=types.SimpleNamespace(
                title="Shared project", url="https://scratch.mit.edu/projects/456/",
            ),
            other="yesterday",
        )

    async def get_followings(self, *, limit, offset):
        self.follow_requests.append((limit, offset))
        for username in self.following_names:
            yield types.SimpleNamespace(username=username)


class FakeSession:
    username = "active_user"

    def __init__(self):
        self.user = FakeUser()
        self.user.follow_requests = []
        self.user.following_names = [f"other_{index}" for index in range(40)]
        self.client = self
        self.requests = []
        self.profile_html = '<div id="follow-button"><a data-control="unfollow">Unfollow</a></div>'

    async def get(self, url):
        self.requests.append(url)
        if url.lower().endswith("/site-api/users/all/target_user/"):
            return types.SimpleNamespace(json=lambda: {
                "featured_project_data": {"id": "123", "title": "Featured"},
                "featured_project_label_name": "Why I Scratch",
                "featured_project_label_id": 4,
            })
        if url == self.user.url:
            return types.SimpleNamespace(text=self.profile_html)
        raise AssertionError(url)

    async def get_user(self, _username):
        self.user.is_myself = _username.lower() == self.username.lower()
        return self.user


class FakeLogin:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        return None


class UserDetailsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = FakeSession()
        fake_scapi = types.ModuleType("scapi")
        fake_scapi.session_login = lambda _session_id: FakeLogin(self.session)
        fake_error = types.ModuleType("scapi.utils.error")
        fake_error.NotFound = type("NotFound", (Exception,), {})
        fake_error.Unauthorized = type("Unauthorized", (Exception,), {})
        fake_utils = types.ModuleType("scapi.utils")
        with patch.object(sys, "path", [str(SCRIPT.parent), *sys.path]), patch.dict(sys.modules, {
            "scapi": fake_scapi,
            "scapi.utils": fake_utils,
            "scapi.utils.error": fake_error,
        }):
            spec = importlib.util.spec_from_file_location("scc_user_details_test", SCRIPT)
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    async def test_expired_auth_and_offline_errors_are_distinct_and_safe(self):
        for error in (ValueError("private-session"), self.module.Unauthorized("private-session"),
                      RuntimeError("private-session")):
            output = io.StringIO()
            with patch.object(self.module.scapi, "session_login", side_effect=error) as login, \
                    patch.object(sys, "argv", [str(SCRIPT)]), \
                    patch.object(sys, "stdin", io.StringIO('{"session_id":"private-session"}')), \
                    contextlib.redirect_stdout(output):
                code = await self.module.main()
            self.assertEqual(code, 1)
            self.assertNotIn("private-session", output.getvalue())
            self.assertIn("scc login" if not isinstance(error, RuntimeError) else "network", output.getvalue())
            login.assert_called_once()

    async def test_invalid_data_after_authentication_is_not_an_expired_session(self):
        async def invalid_data(_username):
            raise ValueError("private response")

        output = io.StringIO()
        with patch.object(self.session, "get_user", invalid_data), \
                patch.object(sys, "argv", [str(SCRIPT)]), \
                patch.object(sys, "stdin", io.StringIO('{"session_id":"private-session"}')), \
                contextlib.redirect_stdout(output):
            code = await self.module.main()
        self.assertEqual(code, 1)
        self.assertIn("invalid user data", output.getvalue())
        self.assertNotIn("scc login", output.getvalue())

    async def test_details_include_featured_project_and_recent_activities(self):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), "--user", "target_user"]), \
                patch.object(sys, "stdin", io.StringIO(json.dumps({"session_id": "private"}))), \
                contextlib.redirect_stdout(output):
            code = await self.module.main()

        self.assertEqual(code, 0, output.getvalue())
        response = json.loads(output.getvalue())
        self.assertEqual(response["featured_project"]["id"], 123)
        self.assertEqual(response["featured_project"]["label"], "Why I Scratch")
        self.assertTrue(response["following"])
        self.assertEqual(response["activities"][0]["target_title"], "Shared project")
        self.assertEqual(self.session.user.activity_limit, 10)

    async def test_custom_featured_label_and_not_following(self):
        self.session.get = lambda url: self._custom_response(url)
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), "--user", "target_user"]), \
                patch.object(sys, "stdin", io.StringIO(json.dumps({"session_id": "private"}))), \
                contextlib.redirect_stdout(output):
            code = await self.module.main()
        self.assertEqual(code, 0, output.getvalue())
        response = json.loads(output.getvalue())
        self.assertEqual(response["featured_project"]["label"], "My custom project")
        self.assertFalse(response["following"])

    async def test_self_uses_available_follow_state_instead_of_self_marker(self):
        self.session.username = "target_user"
        for arguments in ([], ["--user", "TaRgEt_UsEr"]):
            for control, expected in (("unfollow", True), ("follow", False), (None, None)):
                with self.subTest(arguments=arguments, control=control):
                    self.session.requests.clear()
                    self.session.user.follow_requests.clear()
                    self.session.profile_html = (
                        f'<div id="follow-button"><a data-control="{control}">Button</a></div>'
                        if control else '<div id="profile-data"></div>'
                    )
                    output = io.StringIO()
                    with patch.object(sys, "argv", [str(SCRIPT), *arguments]), \
                            patch.object(sys, "stdin", io.StringIO(json.dumps({"session_id": "private"}))), \
                            contextlib.redirect_stdout(output):
                        code = await self.module.main()
                    self.assertEqual(code, 0, output.getvalue())
                    response = json.loads(output.getvalue())
                    self.assertIs(response["is_myself"], True)
                    self.assertIs(response["following"], expected)
                    self.assertEqual(len(self.session.requests), 2)
                    self.assertEqual(self.session.requests[-1], self.session.user.url)
                    self.assertEqual(self.session.user.follow_requests, [(40, 0)] if control is None else [])

    async def test_self_without_follow_button_checks_one_following_page(self):
        self.session.username = "target_user"
        self.session.profile_html = '<div id="profile-data"></div>'
        for names, expected in ((["other", "TaRgEt_UsEr"], True), ([], False)):
            with self.subTest(names=names):
                self.session.user.following_names = names
                self.session.user.follow_requests.clear()
                output = io.StringIO()
                with patch.object(sys, "argv", [str(SCRIPT)]), \
                        patch.object(sys, "stdin", io.StringIO(json.dumps({"session_id": "private"}))), \
                        contextlib.redirect_stdout(output):
                    code = await self.module.main()
                self.assertEqual(code, 0, output.getvalue())
                self.assertIs(json.loads(output.getvalue())["following"], expected)
                self.assertEqual(self.session.user.follow_requests, [(40, 0)])

    async def _custom_response(self, url):
        if url.endswith("/site-api/users/all/target_user/"):
            return types.SimpleNamespace(json=lambda: {
                "featured_project_data": {"id": "123", "title": "Featured"},
                "featured_project_label_name": "My custom project",
                "featured_project_label_id": 999,
            })
        return types.SimpleNamespace(text=(
            '<div id="follow-button"><a data-control="follow">Follow</a></div>'
        ))


if __name__ == "__main__":
    unittest.main()
