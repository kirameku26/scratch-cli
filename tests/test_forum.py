import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "forum.py"
CATEGORIES = '''<div class="blocktable"><div class="box"><h4>World</h4><table><tbody><tr>
<td><div class="tclcon"><a href="/discuss/18/">Japanese</a>日本語で話そう</div></td>
<td class="tc2">12</td><td class="tc3">1,234</td></tr></tbody></table></div></div>'''
TOPICS = '''<div id="vf"><div class="box-head"><span>Japanese</span></div><table><tbody>
<tr><td class="tcl"><div class="isticky iclosed"></div><h3><a href="/discuss/topic/123/">Topic title</a></h3>
<span class="byuser">by author</span></td><td class="tc2">30</td><td class="tc3">200</td></tr>
<tr><td class="tcl"><h3><a href="/discuss/topic/124/">Other topic</a></h3></td></tr></tbody></table></div>'''


def post_html(post_id, css):
    return f'''<div id="p{post_id}" class="blockpost {css}"><div class="box-head"><span>#{post_id - 455}</span>
<a>Today 12:00:00</a></div><div class="postleft"><a href="/users/author/">author</a></div>
<div class="postmsg">Hello <strong>Scratch</strong>!<br>Second line
<em class="posteditmessage">Edited by author</em><script>do not display</script></div></div>'''


TOPIC = '''<meta property="og:url" content="https://scratch.mit.edu/discuss/topic/123/">
<div class="linkst"><ul><li><a href="/discuss/">Discuss</a></li><li><a href="/discuss/18/">Japanese</a></li>
<li>» Topic title</li></ul></div>''' + post_html(456, "roweven firstpost") + post_html(457, "rowodd") + post_html(458, "roweven")


class ForumTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.requests, self.mutations, self.session_ids = [], [], []
        self.html, self.failure, self.account = TOPIC, None, "active_user"
        self.opened = self.closed = 0
        owner = self

        class Client:
            async def __aenter__(self):
                owner.opened += 1
                return self

            async def __aexit__(self, *_args):
                owner.closed += 1

            async def get(self, url, **kwargs):
                owner.requests.append((url, kwargs))
                if owner.failure:
                    raise owner.failure
                return types.SimpleNamespace(text=owner.html)

        class Post:
            def __init__(self, post_id, client):
                self.id, self.client = post_id, client

            async def get_source(self):
                return (await self.client.get(f"https://scratch.mit.edu/discuss/post/{self.id}/source/")).text

        class Topic:
            def __init__(self, topic_id, _session):
                self.id = topic_id

            async def follow(self):
                owner.mutations.append(("follow", self.id))

            async def unfollow(self):
                owner.mutations.append(("unfollow", self.id))

        class Login:
            async def __aenter__(self):
                if owner.failure:
                    raise owner.failure
                return types.SimpleNamespace(username=owner.account)

            async def __aexit__(self, *_args):
                pass

        def login(session_id):
            owner.session_ids.append(session_id)
            return Login()

        fake_scapi = types.ModuleType("scapi")
        fake_scapi.HTTPClient, fake_scapi.ForumPost, fake_scapi.ForumTopic = Client, Post, Topic
        fake_scapi.session_login = login
        fake_error = types.ModuleType("scapi.utils.error")
        for name in ("Forbidden", "NotFound", "TooManyRequests", "Unauthorized"):
            setattr(fake_error, name, type(name, (Exception,), {}))
        with patch.dict(sys.modules, {"scapi": fake_scapi, "scapi.utils": types.ModuleType("scapi.utils"), "scapi.utils.error": fake_error}):
            spec = importlib.util.spec_from_file_location("scc_forum_test", SCRIPT)
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    async def run_main(self, action, target=123, page=1, limit=20, payload=None):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), action, str(target), str(page), str(limit)]), \
                patch.object(sys, "stdin", io.StringIO(json.dumps(payload or {}))), contextlib.redirect_stdout(output):
            code = await self.module.main()
        return code, json.loads(output.getvalue())

    async def test_categories_are_public_and_use_one_request(self):
        self.html = CATEGORIES
        code, result = await self.run_main("categories", 0)
        self.assertEqual(code, 0)
        self.assertEqual(result["items"][0]["id"], 18)
        self.assertEqual(result["items"][0]["post_count"], 1234)
        self.assertEqual(result["items"][0]["group"], "World")
        self.assertEqual(self.requests, [("https://scratch.mit.edu/discuss/", {})])
        self.assertEqual(self.session_ids, [])
        self.assertEqual((self.opened, self.closed), (1, 1))

    async def test_topics_fetch_only_requested_page_and_limit_locally(self):
        self.html = TOPICS
        code, result = await self.run_main("topics", 18, page=2, limit=1)
        self.assertEqual(code, 0)
        self.assertEqual(len(result["items"]), 1)
        self.assertTrue(result["items"][0]["closed"])
        self.assertTrue(result["items"][0]["sticky"])
        self.assertEqual(result["items"][0]["author"], "author")
        self.assertEqual(self.requests, [("https://scratch.mit.edu/discuss/18/", {"params": {"page": 2}})])

    async def test_topic_without_pagination_and_posts_with_all_row_classes(self):
        code, result = await self.run_main("topic")
        self.assertEqual(code, 0)
        self.assertEqual(result["items"][0]["page_count"], 1)
        self.assertEqual(result["items"][0]["category_id"], 18)
        self.requests.clear()
        code, result = await self.run_main("posts", page=2)
        self.assertEqual(code, 0)
        self.assertEqual([p["id"] for p in result["items"]], [456, 457, 458])
        self.assertIn("Hello Scratch!\nSecond line", result["items"][0]["content"])
        self.assertNotIn("do not display", result["items"][0]["content"])
        self.assertEqual(result["items"][0]["edited"], "Edited by author")
        self.assertEqual(self.requests, [("https://scratch.mit.edu/discuss/topic/123/", {"params": {"page": 2}})])

    async def test_post_uses_document_metadata_not_post_subtree(self):
        code, result = await self.run_main("post", 457)
        self.assertEqual(code, 0)
        self.assertEqual(result["items"][0]["topic_id"], 123)
        self.assertEqual(result["items"][0]["author"], "author")
        self.assertEqual(len(self.requests), 1)

    async def test_source_uses_one_scapi_request_without_metadata(self):
        self.html = "[b]Hello[/b]\n[scratchblocks]move (10) steps[/scratchblocks]"
        code, result = await self.run_main("source", 456)
        self.assertEqual(code, 0)
        self.assertEqual(result["source"], self.html)
        self.assertEqual(self.requests, [("https://scratch.mit.edu/discuss/post/456/source/", {})])

    async def test_posts_preserve_paragraphs_and_preformatted_code(self):
        self.html = TOPIC.replace("Hello <strong>Scratch</strong>!<br>Second line", "<p>First</p><p>Second</p><pre>  move (10) steps\n  wait (1) seconds</pre>")
        code, result = await self.run_main("post", 456)
        self.assertEqual(code, 0)
        self.assertIn("First\n\nSecond", result["items"][0]["content"])
        self.assertIn("  move (10) steps\n  wait (1) seconds", result["items"][0]["content"])

    async def test_known_empty_page_is_not_an_error(self):
        self.html = '<div id="vf"><div class="box-head">Japanese</div><td class="djangobbcon1">Empty</td></div>'
        code, result = await self.run_main("topics", 18)
        self.assertEqual(code, 0)
        self.assertEqual(result["items"], [])

    async def test_invalid_html_and_mismatched_ids_fail_without_retry(self):
        for action, html in (("categories", "<html>Unavailable</html>"), ("topics", "<html>Login</html>"),
                             ("posts", "<html>Broken</html>"), ("post", "<html>Broken</html>"),
                             ("source", "<!DOCTYPE html><html>Login</html>"),
                             ("topic", TOPIC.replace("topic/123/", "topic/999/"))):
            self.html, self.requests = html, []
            code, result = await self.run_main(action, 0 if action == "categories" else 123)
            self.assertEqual(code, 1)
            self.assertIn("invalid", result["error"])
            self.assertEqual(len(self.requests), 1)

    async def test_errors_are_safe_and_not_retried(self):
        for failure, label in ((RuntimeError("private-session"), "network"), (self.module.NotFound("secret"), "not found"),
                               (self.module.TooManyRequests("secret"), "rate limit"), (self.module.Unauthorized("secret"), "not publicly accessible")):
            self.failure, self.requests = failure, []
            code, result = await self.run_main("topic")
            self.assertEqual(code, 1)
            self.assertIn(label, result["error"])
            self.assertNotIn("secret", result["error"])
            self.assertNotIn("private-session", result["error"])
            self.assertEqual(len(self.requests), 1)
            self.assertEqual(self.opened, self.closed)

    async def test_invalid_arguments_never_open_a_client(self):
        for args in (("unknown", 1, 1, 20), ("post", 0, 1, 20), ("categories", 1, 1, 20),
                     ("posts", 1, 0, 20), ("posts", 1, 1, 41), ("topic", 2**60, 1, 20)):
            code, _ = await self.run_main(*args)
            self.assertEqual(code, 1)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.opened, 0)

    async def test_rate_limit_reports_retry_after_without_retrying(self):
        self.failure = self.module.TooManyRequests("private-session")
        self.failure.response = types.SimpleNamespace(_response=types.SimpleNamespace(headers={"Retry-After": "120"}))
        code, result = await self.run_main("topic")
        self.assertEqual(code, 1)
        self.assertIn("after 120 seconds", result["error"])
        self.assertEqual(len(self.requests), 1)
        self.failure.response._response.headers["Retry-After"] = "Wed, 01 Jan 2100 00:00:00 GMT"
        self.assertIn("seconds", self.module.rate_limit_message(self.failure))
        self.failure.response._response.headers["Retry-After"] = "private-session"
        self.assertNotIn("private-session", self.module.rate_limit_message(self.failure))

    async def test_subscriptions_require_confirmation_and_account_match(self):
        for action in ("follow", "unfollow"):
            for expected in (None, "other_user", "active_user"):
                code, result = await self.run_main(action, payload={"session_id": "private-session", "expected_account": expected})
                self.assertEqual(code, 0 if expected == "active_user" else 1)
                if code == 0:
                    self.assertEqual(result["account"], "active_user")
        self.assertEqual(self.mutations, [("follow", 123), ("unfollow", 123)])
        self.assertEqual(len(self.session_ids), 4)
        self.assertEqual(self.requests, [])

    async def test_failed_subscription_is_not_retried(self):
        async def failed_follow(topic):
            self.mutations.append(("follow", topic.id))
            raise RuntimeError("private-session")

        with patch.object(self.module.scapi.ForumTopic, "follow", failed_follow):
            code, result = await self.run_main("follow", payload={"session_id": "private-session", "expected_account": "active_user"})
        self.assertEqual(code, 1)
        self.assertNotIn("private-session", result["error"])
        self.assertEqual(self.mutations, [("follow", 123)])

    async def test_expired_subscription_session_prompts_relogin(self):
        self.failure = ValueError("private-session")
        code, result = await self.run_main("follow", payload={"session_id": "private-session", "expected_account": "active_user"})
        self.assertEqual(code, 1)
        self.assertIn("scc login", result["error"])
        self.assertEqual(self.mutations, [])
