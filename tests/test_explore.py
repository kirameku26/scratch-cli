import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "explore.py"


class FakeClient:
    calls = 0

    async def __aenter__(self):
        FakeClient.calls += 1
        return self

    async def __aexit__(self, *_args):
        return None


class ExploreTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeClient.calls = 0
        self.requests = []
        fake_scapi = types.ModuleType("scapi")
        fake_scapi.HTTPClient = FakeClient

        async def projects(client, **options):
            self.requests.append(("project", client, options))
            yield types.SimpleNamespace(
                id=123,
                title="Example project",
                author=types.SimpleNamespace(username="creator"),
                url="https://scratch.mit.edu/projects/123/",
            )

        async def studios(client, **options):
            self.requests.append(("studio", client, options))
            yield types.SimpleNamespace(
                id=456,
                title="Example studio",
                host_id=789,
                url="https://scratch.mit.edu/studios/456",
            )

        fake_scapi.explore_projects = projects
        fake_scapi.explore_studios = studios

        with patch.dict(sys.modules, {"scapi": fake_scapi}):
            spec = importlib.util.spec_from_file_location("scc_explore_test", SCRIPT)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

        self.module = module

    async def run_main(self, *arguments):
        output = io.StringIO()

        with patch.object(sys, "argv", [str(SCRIPT), *arguments]), \
                contextlib.redirect_stdout(output):
            code = await self.module.main()

        return code, json.loads(output.getvalue())

    async def test_trending_projects_use_one_request(self):
        code, response = await self.run_main(
            "project", "trending", "all", "10", "0", "ja"
        )

        self.assertEqual(code, 0)
        self.assertEqual(FakeClient.calls, 1)
        self.assertEqual(self.requests[0][0], "project")
        self.assertEqual(self.requests[0][2], {
            "query": "*", "mode": "trending", "language": "ja", "limit": 10, "offset": 0,
        })
        self.assertEqual(response["results"][0]["author"], "creator")

    async def test_each_project_category_uses_one_request(self):
        for category in ("animations", "art", "games", "music"):
            with self.subTest(category=category):
                self.requests.clear()
                FakeClient.calls = 0
                code, _response = await self.run_main(
                    "project", "popular", category, "5", "20", "en"
                )

                self.assertEqual(code, 0)
                self.assertEqual(FakeClient.calls, 1)
                self.assertEqual(len(self.requests), 1)
                self.assertEqual(self.requests[0][2], {
                    "query": category, "mode": "popular", "language": "en", "limit": 5, "offset": 20,
                })

    async def test_popular_studios_use_one_request(self):
        code, response = await self.run_main(
            "studio", "popular", "all", "5", "20", "ja"
        )

        self.assertEqual(code, 0)
        self.assertEqual(FakeClient.calls, 1)
        self.assertEqual(self.requests[0][0], "studio")
        self.assertEqual(self.requests[0][2], {
            "mode": "popular", "language": "ja", "limit": 5, "offset": 20,
        })
        self.assertEqual(response["results"][0]["host_id"], 789)

    async def test_invalid_limit_sends_no_request(self):
        code, response = await self.run_main(
            "project", "trending", "all", "41", "0", "en"
        )

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Invalid limit or offset.")
        self.assertEqual(FakeClient.calls, 0)

    async def test_studio_category_sends_no_request(self):
        code, response = await self.run_main(
            "studio", "popular", "games", "10", "0", "en"
        )

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Category is available only for projects.")
        self.assertEqual(FakeClient.calls, 0)

    async def test_api_failure_is_reported_without_retry(self):
        async def failing_projects(client, **options):
            self.requests.append(("project", client, options))
            raise RuntimeError("Rate limited")
            yield  # Keep this function an async generator.

        self.module.scapi.explore_projects = failing_projects

        code, response = await self.run_main(
            "project", "trending", "all", "10", "0", "en"
        )

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Rate limited")
        self.assertEqual(len(self.requests), 1)
