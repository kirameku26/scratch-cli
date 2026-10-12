import contextlib
import datetime
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "profile.py"


class FakeClient:
    def __init__(self, owner):
        self.owner = owner

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, url, **options):
        self.owner.requests.append((url, options))
        if self.owner.fail_request:
            raise self.owner.fail_request()
        if url.endswith("/studios_following/"):
            return types.SimpleNamespace(text="""
                <a href="/studios/123/"><img src="thumbnail.png"></a>
                <a href="/studios/123/">First studio</a>
                <a href="/studios/456/"><img alt="Second studio"></a>
                <a href="/studios/789/"></a>
                <a href="https://example.com/studios/999/">Ignore</a>
            """)
        if url.endswith("/griffpatch"):
            return types.SimpleNamespace(text=json.dumps({
                "id": 1234,
                "username": "griffpatch",
                "profile": {
                    "bio": "About me", "status": "Working on a game",
                    "country": "United Kingdom",
                    "images": {"90x90": "https://example.com/icon.png"},
                },
                "history": {"joined": "2012-10-24T12:59:31.000Z"},
            }))
        if url.endswith("/projects/") or url.endswith("/favorites/"):
            return types.SimpleNamespace(text=json.dumps([{
                "id": 100,
                "title": "Example project",
                "author": {},  # Scapi's object conversion fails on this shape.
            }]))
        if url.endswith("/studios/curate"):
            return types.SimpleNamespace(text=json.dumps([{
                "id": 200, "title": "Studio",
            }]))
        if url.endswith("/following/") or url.endswith("/followers/"):
            return types.SimpleNamespace(text=json.dumps([{
                "username": "other",
            }]))
        raise AssertionError(f"Unexpected URL: {url}")


class FakeUser:
    def __init__(self, username, client, *, is_real):
        self.username = username
        self.client = client
        self.is_real = is_real

    async def get_comments(self, start_page, end_page):
        self.client.owner.requests.append(("comments", (start_page, end_page)))
        yield self.client.owner.comment


class FakeLogin:
    def __init__(self, owner, session_id):
        owner.session_ids.append(session_id)
        self.session = types.SimpleNamespace(
            username="griffpatch", client=FakeClient(owner),
        )

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        return None


class ProfileTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.requests = []
        self.session_ids = []
        self.fail_request = None
        reply = types.SimpleNamespace(
            id=301, author=types.SimpleNamespace(username="replier"),
            content="Reply", created_at=datetime.datetime(2026, 1, 2),
        )
        self.comment = types.SimpleNamespace(
            id=300, author=types.SimpleNamespace(username="commenter"),
            content="Hello", created_at=datetime.datetime(2026, 1, 1),
        )

        async def cached_replies(*, use_cache):
            self.assertTrue(use_cache)
            yield reply

        self.comment.get_replies = cached_replies

        fake_scapi = types.ModuleType("scapi")
        fake_scapi.HTTPClient = lambda: FakeClient(self)
        fake_scapi.User = FakeUser
        fake_scapi.session_login = lambda session_id: FakeLogin(self, session_id)
        fake_errors = types.ModuleType("scapi.utils.error")
        fake_errors.NotFound = type("NotFound", (Exception,), {})
        fake_errors.TooManyRequests = type("TooManyRequests", (Exception,), {})
        fake_errors.Unauthorized = type("Unauthorized", (Exception,), {})

        with patch.dict(sys.modules, {
            "scapi": fake_scapi,
            "scapi.utils": types.ModuleType("scapi.utils"),
            "scapi.utils.error": fake_errors,
        }):
            spec = importlib.util.spec_from_file_location("scc_profile_test", SCRIPT)
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

    async def test_projects_and_favorites_handle_missing_author(self):
        for section in ("projects", "favorites"):
            with self.subTest(section=section):
                self.requests.clear()
                code, response = await self.run_main(
                    "griffpatch", section, "10", "20", "1"
                )
                self.assertEqual(code, 0)
                self.assertEqual(len(self.requests), 1)
                self.assertEqual(self.requests[0][1], {
                    "params": {"limit": 10, "offset": 20},
                })
                self.assertEqual(response["items"][0]["author"], None)
                self.assertEqual(response["items"][0]["title"], "Example project")

    async def test_studios_and_follow_lists_use_one_request(self):
        for section in ("studios", "following", "followers"):
            with self.subTest(section=section):
                self.requests.clear()
                code, response = await self.run_main(
                    "griffpatch", section, "5", "0", "1"
                )
                self.assertEqual(code, 0)
                self.assertEqual(len(self.requests), 1)
                self.assertEqual(response["section"], section)
                self.assertEqual(len(response["items"]), 1)

    async def test_about_uses_profile_fields(self):
        code, response = await self.run_main(
            "griffpatch", "about", "10", "0", "1"
        )
        self.assertEqual(code, 0)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(response["about"]["bio"], "About me")
        self.assertEqual(response["about"]["status"], "Working on a game")
        self.assertEqual(response["about"]["country"], "United Kingdom")

    async def test_followed_studios_uses_later_title_and_image_alt(self):
        code, response = await self.run_main(
            "griffpatch", "followed-studios", "3", "0", "1"
        )
        self.assertEqual(code, 0)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual([item["title"] for item in response["items"]], [
            "First studio", "Second studio", "Studio #789",
        ])

    async def test_comment_page_and_replies_use_one_request(self):
        code, response = await self.run_main(
            "griffpatch", "comments", "10", "0", "2"
        )
        self.assertEqual(code, 0)
        self.assertEqual(self.requests, [("comments", (2, 2))])
        self.assertEqual(response["items"][0]["replies"][0]["content"], "Reply")

    async def test_current_user_uses_session_only_when_user_is_omitted(self):
        code, response = await self.run_main(
            "", "projects", "10", "0", "1",
            payload={"session_id": "private-session"},
        )
        self.assertEqual(code, 0)
        self.assertEqual(response["username"], "griffpatch")
        self.assertEqual(self.session_ids, ["private-session"])
        self.assertEqual(len(self.requests), 1)

    async def test_missing_session_and_invalid_inputs_send_no_request(self):
        for arguments in (
            ("", "projects", "10", "0", "1"),
            ("griffpatch", "projects", "41", "0", "1"),
            ("../other", "projects", "10", "0", "1"),
        ):
            with self.subTest(arguments=arguments):
                code, _response = await self.run_main(*arguments)
                self.assertEqual(code, 1)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.session_ids, [])

    async def test_rate_limit_does_not_retry(self):
        self.fail_request = self.module.TooManyRequests
        code, response = await self.run_main(
            "griffpatch", "projects", "10", "0", "1"
        )
        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Scratch rate limit reached. Try again later.")
        self.assertEqual(len(self.requests), 1)
