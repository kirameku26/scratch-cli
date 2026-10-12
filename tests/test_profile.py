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
        if url.endswith("/users/griffpatch/"):
            return types.SimpleNamespace(text="""
                <div id="profile-data">
                  <form id="profile-avatar"><a href="/users/griffpatch/">
                    <img src="//cdn2.scratch.mit.edu/get_image/user/1882674_60x60.png">
                  </a></form>
                  <div class="header-text"><h2>griffpatch</h2>
                    <p class="profile-details"><span class="group">Scratcher</span>
                      <span title="2012-10-24">13 years ago</span>
                      <span class="location">United Kingdom</span>
                    </p>
                  </div>
                  <div id="bio-readonly"><p class="overview">About me &amp; coding</p></div>
                  <div id="status-readonly"><p class="overview">Working on a game<br>
                    Me: <a href="/users/other/">@other</a></p></div>
                  <div class="player"><a id="featured-project" href="/projects/12785898/">
                    <img src="//cdn2.scratch.mit.edu/get_image/project/12785898_282x210.png">
                    </a><a class="project-name" href="/projects/12785898/">Cloud Platformer</a>
                  </div>
                  <div id="activity-feed"><ul class="activity-stream">
                    <li><span class="icon-xs black project"></span>
                      <span class="actor">griffpatch</span>
                      <a href="/projects/1367046445/" data-tag="object">FAST EARTH</a>
                      <span data-tag="time">2 months ago</span></li>
                    <li><span class="icon-xs black love"></span>
                      <span class="actor">griffpatch</span>
                      <a href="/projects/862083370/">Appel Let's Play</a>
                      <span data-tag="time">4 months ago</span></li>
                  </ul></div>
                </div>
            """)
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

    async def get_featured(self):
        self.client.owner.requests.append((
            f"https://scratch.mit.edu/site-api/users/all/{self.username}/", {}
        ))
        if self.client.owner.featured_missing:
            return None
        return types.SimpleNamespace(
            project=types.SimpleNamespace(id=4242, title="Scapi project"),
            label=types.SimpleNamespace(name=self.client.owner.featured_label),
        )

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
        self.featured_missing = False
        self.featured_label = "ProjectFeatured"
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

    async def test_about_uses_public_page_and_scapi_featured(self):
        code, response = await self.run_main(
            "griffpatch", "about", "10", "0", "1"
        )
        self.assertEqual(code, 0)
        self.assertEqual(len(self.requests), 2)
        about = response["about"]
        self.assertEqual(self.requests[0][0], "https://scratch.mit.edu/users/griffpatch/")
        self.assertEqual(self.requests[1][0],
                         "https://scratch.mit.edu/site-api/users/all/griffpatch/")
        self.assertEqual(about["id"], 1882674)
        self.assertEqual(about["role"], "Scratcher")
        self.assertEqual(about["joined_at"], "2012-10-24")
        self.assertEqual(about["bio"], "About me & coding")
        self.assertEqual(about["status"], "Working on a game\nMe: @other")
        self.assertEqual(about["country"], "United Kingdom")
        self.assertEqual(about["featured_project"], {
            "id": 4242, "title": "Scapi project",
            "url": "https://scratch.mit.edu/projects/4242/",
            "label": "Featured Project",
        })
        self.assertEqual([item["action"] for item in about["activities"]],
                         ["project", "love"])
        self.assertEqual(about["activities"][0]["target_title"], "FAST EARTH")
        self.assertEqual(about["activities"][1]["target_url"],
                         "https://scratch.mit.edu/projects/862083370/")

    async def test_about_accepts_missing_optional_sections(self):
        about = self.module.parse_profile_page(
            '<div id="profile-data"><div class="header-text"><h2>example</h2>'
            '</div></div>', "example"
        )
        self.assertEqual(about["activities"], [])
        self.assertIsNone(about["bio"])

    async def test_featured_label_varies_and_project_can_be_missing(self):
        self.featured_label = "Tutorial"
        code, response = await self.run_main(
            "griffpatch", "about", "10", "0", "1"
        )
        self.assertEqual(code, 0)
        self.assertEqual(response["about"]["featured_project"]["label"], "Tutorial")

        self.featured_missing = True
        code, response = await self.run_main(
            "griffpatch", "about", "10", "0", "1"
        )
        self.assertEqual(code, 0)
        self.assertIsNone(response["about"]["featured_project"])

    async def test_about_rejects_non_profile_html(self):
        with self.assertRaises(self.module.InvalidProfileResponse):
            self.module.parse_profile_page("<html><body>Blocked</body></html>", "example")

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
