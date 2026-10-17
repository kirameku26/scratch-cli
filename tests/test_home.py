import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "home.py"


def project(project_id, title="Project"):
    return types.SimpleNamespace(
        id=project_id,
        title=title,
        author=types.SimpleNamespace(username="creator"),
        love_count=12,
    )


class FakeClient:
    enters = 0

    async def __aenter__(self):
        FakeClient.enters += 1
        return self

    async def __aexit__(self, *_args):
        return None


class FakeSession:
    username = "active_user"

    def __init__(self):
        self.feed_calls = []
        self.love_calls = []
        self.project_calls = []
        self.feed_failure = None
        self.closes = 0

    async def get_feed(self, **options):
        self.feed_calls.append(options)
        if self.feed_failure:
            raise self.feed_failure
        yield types.SimpleNamespace(
            action=types.SimpleNamespace(value="project_share"),
            actor=types.SimpleNamespace(username="friend"),
            target=types.SimpleNamespace(
                title="Shared project",
                url="https://scratch.mit.edu/projects/3/",
            ),
            place=None,
            created_at=None,
        )

    async def get_followings_loves(self, **options):
        self.love_calls.append(options)
        yield project(4, "Loved project")

    async def get_followings_project(self, **options):
        self.project_calls.append(("following-projects", options))
        yield project(5, "Friend's project")

    async def get_followings_studios_project(self, **options):
        self.project_calls.append(("following-studio-projects", options))
        yield project(6, "Studio project")

    async def get_viewed_projects(self, **options):
        self.project_calls.append(("viewed-projects", options))
        yield project(7, "Viewed project")


class FakeLogin:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        self.session.closes += 1
        return None


class HomeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeClient.enters = 0
        self.featured_calls = 0
        self.news_calls = []
        self.session_ids = []
        self.session = FakeSession()
        fake_scapi = types.ModuleType("scapi")
        fake_scapi.HTTPClient = FakeClient

        async def get_featured(_client):
            self.featured_calls += 1
            return {
                "featured_projects": [project(1), project(2)],
                "featured_studios": [
                    types.SimpleNamespace(id=10, title="Featured studio")
                ],
                "most_loved_projects": [project(11, "Most loved")],
                "most_remixed_projects": [project(12, "Most remixed")],
                "newest_projects": [project(13, "Newest")],
                "design_studio_projects": [project(20, "Design project")],
                "design_studio": types.SimpleNamespace(id=30, title="What If?"),
            }

        async def get_news(_client, **options):
            self.news_calls.append(options)
            yield types.SimpleNamespace(
                id=40,
                headline="Scratch News item",
                copy="News copy",
                url="https://scratch.mit.edu/",
                image="https://cdn.scratch.mit.edu/image.png",
                created_at=None,
            )

        def session_login(session_id):
            self.session_ids.append(session_id)
            return FakeLogin(self.session)

        fake_scapi.get_community_featured = get_featured
        fake_scapi.get_news = get_news
        fake_scapi.session_login = session_login
        fake_errors = types.ModuleType("scapi.utils.error")
        for name in ("Forbidden", "NotFound", "ServerError", "TooManyRequests", "Unauthorized"):
            setattr(fake_errors, name, type(name, (Exception,), {}))

        class ProcessingError(Exception):
            def __init__(self, exception):
                self.exception = exception

        fake_errors.ProcessingError = ProcessingError

        with patch.dict(sys.modules, {"scapi": fake_scapi, "scapi.utils": types.ModuleType("scapi.utils"), "scapi.utils.error": fake_errors}):
            spec = importlib.util.spec_from_file_location("scc_home_test", SCRIPT)
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

    async def test_featured_projects_use_one_request_and_local_pagination(self):
        code, response = await self.run_main("featured-projects", "1", "1")

        self.assertEqual(code, 0)
        self.assertEqual(FakeClient.enters, 1)
        self.assertEqual(self.featured_calls, 1)
        self.assertEqual([item["id"] for item in response["items"]], [2])
        self.assertEqual(self.session_ids, [])

    async def test_design_studio_includes_current_title(self):
        code, response = await self.run_main("design-studio", "10", "0")

        self.assertEqual(code, 0)
        self.assertEqual(response["studio"]["title"], "What If?")
        self.assertEqual(response["items"][0]["title"], "Design project")

    async def test_featured_studios_are_serialized(self):
        code, response = await self.run_main("featured-studios", "10", "0")

        self.assertEqual(code, 0)
        self.assertEqual(self.featured_calls, 1)
        self.assertEqual(response["items"][0], {
            "id": 10,
            "title": "Featured studio",
            "url": "https://scratch.mit.edu/studios/10/",
        })

    async def test_news_passes_pagination_to_one_request(self):
        code, response = await self.run_main("news", "5", "10")

        self.assertEqual(code, 0)
        self.assertEqual(FakeClient.enters, 1)
        self.assertEqual(self.news_calls, [{"limit": 5, "offset": 10}])
        self.assertEqual(response["items"][0]["headline"], "Scratch News item")
        self.assertEqual(response["items"][0]["id"], "40")

    async def test_additional_featured_rows_use_one_request_each(self):
        for section, expected_id in (
            ("most-loved", 11), ("most-remixed", 12),
            ("newest-projects", 13),
        ):
            with self.subTest(section=section):
                before = self.featured_calls
                code, response = await self.run_main(section, "10", "0")
                self.assertEqual(code, 0)
                self.assertEqual(self.featured_calls, before + 1)
                self.assertEqual(response["items"][0]["id"], expected_id)

    async def test_additional_private_rows_use_requested_page(self):
        for section, expected_id in (
            ("following-projects", 5),
            ("following-studio-projects", 6),
            ("viewed-projects", 7),
        ):
            with self.subTest(section=section):
                code, response = await self.run_main(
                    section, "5", "2", payload={"session_id": "private-session"}
                )
                self.assertEqual(code, 0)
                self.assertEqual(response["items"][0]["id"], expected_id)
                self.assertEqual(self.session.project_calls[-1], (
                    section, {"limit": 5, "offset": 2}
                ))

    async def test_private_sections_use_only_the_supplied_session(self):
        payload = {"session_id": "private-session"}
        feed_code, feed = await self.run_main(
            "whats-happening", "10", "2", payload=payload
        )
        loves_code, loves = await self.run_main(
            "following-loves", "5", "3", payload=payload
        )

        self.assertEqual((feed_code, loves_code), (0, 0))
        self.assertEqual(self.session_ids, ["private-session", "private-session"])
        self.assertEqual(self.session.feed_calls, [{"limit": 10, "offset": 2}])
        self.assertEqual(self.session.love_calls, [{"limit": 5, "offset": 3}])
        self.assertEqual(feed["username"], "active_user")
        self.assertEqual(loves["items"][0]["title"], "Loved project")

    async def test_missing_session_and_invalid_pagination_send_no_request(self):
        missing_code, missing = await self.run_main(
            "whats-happening", "10", "0"
        )
        invalid_code, invalid = await self.run_main("news", "41", "0")

        self.assertEqual((missing_code, invalid_code), (1, 1))
        self.assertEqual(missing["error"], "A valid Scratch session is required.")
        self.assertEqual(invalid["error"], "Invalid limit or offset.")
        self.assertEqual(FakeClient.enters, 0)
        self.assertEqual(self.session_ids, [])

    async def test_api_failure_is_reported_without_retry(self):
        calls = 0

        async def fail_once(_client):
            nonlocal calls
            calls += 1
            raise RuntimeError("Rate limited")

        self.module.scapi.get_community_featured = fail_once
        code, response = await self.run_main("featured-projects", "10", "0")

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Could not load the Scratch home section.")
        self.assertEqual(calls, 1)

    async def test_feed_failures_are_distinct_safe_and_never_retried(self):
        for failure, expected in (
            (self.module.ProcessingError(OSError("private-session")), "Check your internet connection"),
            (self.module.ProcessingError(TimeoutError("private-session")), "timed out"),
            (TimeoutError("private-session"), "timed out"),
            (self.module.TooManyRequests("private-session"), "rate limit reached"),
            (self.module.Unauthorized("private-session"), "scc login"),
            (self.module.Forbidden("private-session"), "denied access"),
            (self.module.ServerError("private-session"), "temporarily unavailable"),
            (self.module.NotFound("private-session"), "not found"),
            (KeyError("private-session"), "invalid Scratch home response"),
            (ValueError("private-session"), "invalid Scratch home response"),
        ):
            with self.subTest(failure=type(failure).__name__):
                self.session.feed_failure = failure
                self.session.feed_calls.clear()
                code, response = await self.run_main("whats-happening", "10", "2", payload={"session_id": "private-session"})
                self.assertEqual(code, 1)
                self.assertIn(expected, response["error"])
                self.assertNotIn("private-session", response["error"])
                self.assertNotIn("items", response)
                self.assertEqual(self.session.feed_calls, [{"limit": 10, "offset": 2}])
                self.assertEqual(FakeClient.enters, 0)
                if isinstance(failure, (KeyError, ValueError)):
                    self.assertNotIn("scc login", response["error"])
        self.assertEqual(self.session.closes, 10)

    async def test_invalid_auth_stops_before_feed_and_has_relogin_guidance(self):
        for failure in (ValueError("private-session"), self.module.Unauthorized("private-session")):
            with patch.object(self.module.scapi, "session_login", side_effect=failure) as login:
                code, response = await self.run_main("whats-happening", "10", "0", payload={"session_id": "private-session"})
            self.assertEqual(code, 1)
            self.assertIn("scc login", response["error"])
            self.assertNotIn("private-session", response["error"])
            login.assert_called_once()
        self.assertEqual(self.session.feed_calls, [])

    async def test_retry_after_is_reported_without_an_additional_request(self):
        failure = self.module.TooManyRequests("private-session")
        failure.response = types.SimpleNamespace(_response=types.SimpleNamespace(headers={"Retry-After": "120"}))
        self.session.feed_failure = failure
        code, response = await self.run_main("whats-happening", "10", "0", payload={"session_id": "private-session"})
        self.assertEqual(code, 1)
        self.assertIn("after 120 seconds", response["error"])
        self.assertEqual(len(self.session.feed_calls), 1)
        failure.response._response.headers["Retry-After"] = "Wed, 01 Jan 2100 00:00:00 GMT"
        self.assertIn("seconds", self.module.rate_limit_message(failure))
        failure.response._response.headers["Retry-After"] = "private-session"
        self.assertNotIn("private-session", self.module.rate_limit_message(failure))

    async def test_public_bad_json_does_not_request_relogin(self):
        async def malformed(_client):
            raise ValueError("private-response")
        self.module.scapi.get_community_featured = malformed
        code, response = await self.run_main("featured-projects", "10", "0")
        self.assertEqual(code, 1)
        self.assertIn("invalid Scratch home response", response["error"])
        self.assertNotIn("scc login", response["error"])


if __name__ == "__main__":
    unittest.main()
