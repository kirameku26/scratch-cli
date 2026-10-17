import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "interactions.py"


class FakeCommentFailure(Exception):
    pass


class FakeProject:
    calls = []

    def __init__(self, project_id, session):
        self.id = project_id
        self.session = session

    async def add_love(self):
        self.calls.append(("love", self.id))
        return True

    async def remove_love(self):
        self.calls.append(("unlove", self.id))
        return False

    async def add_favorite(self):
        self.calls.append(("favorite", self.id))
        return True

    async def remove_favorite(self):
        self.calls.append(("unfavorite", self.id))
        return True

    async def post_comment(self, text, parent=None):
        self.calls.append(("reply" if parent else "comment", self.id, text, parent))
        return types.SimpleNamespace(id=101)


class FakeUser:
    calls = []

    def __init__(self, username, session, is_real=False):
        self.username = username
        self.session = session
        self.is_real = is_real

    async def follow(self):
        self.calls.append(("follow", self.username))

    async def unfollow(self):
        self.calls.append(("unfollow", self.username))

    async def post_comment(self, text, parent=None):
        self.calls.append(("reply" if parent else "comment", self.username, text, parent))
        return types.SimpleNamespace(id=202)


class FakeStudio:
    calls = []

    def __init__(self, studio_id, _session):
        self.id = studio_id

    async def follow(self):
        self.calls.append(("follow", self.id))

    async def unfollow(self):
        self.calls.append(("unfollow", self.id))

    async def post_comment(self, text, parent=None):
        self.calls.append(("reply" if parent else "comment", self.id, text, parent))
        return types.SimpleNamespace(id=303)


class FakeSession:
    username = "active_user"


class FakeLogin:
    async def __aenter__(self):
        return FakeSession()

    async def __aexit__(self, *_args):
        return None


class InteractionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeProject.calls = []
        FakeUser.calls = []
        FakeStudio.calls = []
        self.session_ids = []
        fake_scapi = types.ModuleType("scapi")
        fake_scapi.Project = FakeProject
        fake_scapi.User = FakeUser
        fake_scapi.Studio = FakeStudio

        def session_login(session_id):
            self.session_ids.append(session_id)
            return FakeLogin()

        fake_scapi.session_login = session_login
        fake_utils = types.ModuleType("scapi.utils")
        fake_error = types.ModuleType("scapi.utils.error")
        fake_error.CommentFailure = FakeCommentFailure

        with patch.dict(sys.modules, {
            "scapi": fake_scapi,
            "scapi.utils": fake_utils,
            "scapi.utils.error": fake_error,
        }):
            spec = importlib.util.spec_from_file_location(
                "scc_interactions_test", SCRIPT
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

        self.module = module

    async def run_main(self, *arguments, payload=None):
        output = io.StringIO()
        input_data = io.StringIO(json.dumps(payload or {}))
        with patch.object(sys, "argv", [str(SCRIPT), *arguments]), \
                patch.object(sys, "stdin", input_data), \
                contextlib.redirect_stdout(output):
            code = await self.module.main()
        return code, json.loads(output.getvalue())

    async def test_project_reactions_use_scapi_once(self):
        for action in ("love", "unlove", "favorite", "unfavorite"):
            with self.subTest(action=action):
                FakeProject.calls = []
                code, response = await self.run_main(
                    "project", action, "123",
                    payload={"session_id": "private-session", "expected_account": "active_user"},
                )

                self.assertEqual(code, 0)
                self.assertEqual(FakeProject.calls, [(action, 123)])
                self.assertEqual(response["account"], "active_user")
                self.assertEqual(response["target"], 123)

    async def test_project_and_user_comments_use_scapi(self):
        project_code, project_response = await self.run_main(
            "project", "comment", "123",
            payload={"session_id": "private-session", "expected_account": "active_user", "text": "Nice project!"},
        )
        user_code, user_response = await self.run_main(
            "user", "comment", "griffpatch",
            payload={"session_id": "private-session", "expected_account": "active_user", "text": "Hello!"},
        )

        self.assertEqual((project_code, user_code), (0, 0))
        self.assertEqual(FakeProject.calls, [("comment", 123, "Nice project!", None)])
        self.assertEqual(FakeUser.calls, [("comment", "griffpatch", "Hello!", None)])
        self.assertEqual(project_response["comment_id"], 101)
        self.assertEqual(user_response["comment_id"], 202)

    async def test_project_and_user_replies_pass_the_parent_id(self):
        project_code, _ = await self.run_main(
            "project", "reply", "123",
            payload={"session_id": "private-session", "expected_account": "active_user", "text": "Reply", "comment_id": 9},
        )
        user_code, _ = await self.run_main(
            "user", "reply", "griffpatch",
            payload={"session_id": "private-session", "expected_account": "active_user", "text": "Reply", "comment_id": 10},
        )

        self.assertEqual((project_code, user_code), (0, 0))
        self.assertEqual(FakeProject.calls, [("reply", 123, "Reply", 9)])
        self.assertEqual(FakeUser.calls, [("reply", "griffpatch", "Reply", 10)])

    async def test_user_follow_and_unfollow_use_scapi(self):
        for action in ("follow", "unfollow"):
            with self.subTest(action=action):
                FakeUser.calls = []
                code, response = await self.run_main(
                    "user", action, "griffpatch",
                    payload={"session_id": "private-session", "expected_account": "active_user"},
                )

                self.assertEqual(code, 0)
                self.assertEqual(FakeUser.calls, [(action, "griffpatch")])
                self.assertEqual(response["target"], "griffpatch")

    async def test_studio_follow_and_comments_use_scapi(self):
        follow_code, _ = await self.run_main(
            "studio", "follow", "12", payload={"session_id": "private-session", "expected_account": "active_user"},
        )
        comment_code, comment_response = await self.run_main(
            "studio", "comment", "12",
            payload={"session_id": "private-session", "expected_account": "active_user", "text": "Hello studio!"},
        )
        self.assertEqual((follow_code, comment_code), (0, 0))
        self.assertEqual(FakeStudio.calls, [
            ("follow", 12), ("comment", 12, "Hello studio!", None),
        ])
        self.assertEqual(comment_response["comment_id"], 303)

    async def test_invalid_input_makes_no_session_request(self):
        missing_code, missing = await self.run_main("project", "love", "123")
        id_code, invalid_id = await self.run_main(
            "project", "love", "0", payload={"session_id": "private-session", "expected_account": "active_user"}
        )
        text_code, missing_text = await self.run_main(
            "user", "comment", "griffpatch",
            payload={"session_id": "private-session", "expected_account": "active_user"},
        )

        self.assertEqual((missing_code, id_code, text_code), (1, 1, 1))
        self.assertEqual(missing["error"], "A valid Scratch session is required.")
        self.assertEqual(invalid_id["error"], "Project ID must be a positive integer.")
        self.assertEqual(missing_text["error"], "Comment text is required.")
        self.assertEqual(self.session_ids, [])

    async def test_missing_confirmation_prevents_even_session_login(self):
        code, response = await self.run_main(
            "project", "love", "123", payload={"session_id": "private-session"},
        )
        self.assertEqual(code, 1)
        self.assertIn("confirmed account", response["error"])
        self.assertEqual(self.session_ids, [])
        self.assertEqual(FakeProject.calls, [])

    async def test_account_change_prevents_every_interaction(self):
        for entity, action, target in (("project", "love", "123"), ("user", "follow", "other_user"),
                                       ("studio", "comment", "12")):
            code, response = await self.run_main(
                entity, action, target,
                payload={"session_id": "private-session", "expected_account": "another_user", "text": "Hello"},
            )
            self.assertEqual(code, 1)
            self.assertIn("account changed", response["error"])
        self.assertEqual(FakeProject.calls + FakeUser.calls + FakeStudio.calls, [])

    async def test_failure_is_reported_without_retry(self):
        calls = 0

        async def fail_once(_self):
            nonlocal calls
            calls += 1
            raise RuntimeError("Rate limited")

        with patch.object(FakeProject, "add_love", fail_once):
            code, response = await self.run_main(
                "project", "love", "123",
                payload={"session_id": "private-session", "expected_account": "active_user"},
            )

        self.assertEqual(code, 1)
        self.assertEqual(
            response["error"], "Scratch could not complete the requested action."
        )
        self.assertEqual(calls, 1)


if __name__ == "__main__":
    unittest.main()
