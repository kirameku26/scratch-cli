import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "search.py"


class FakeClient:
    calls = 0

    async def __aenter__(self):
        FakeClient.calls += 1
        return self

    async def __aexit__(self, *_args):
        return None


class SearchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeClient.calls = 0
        self.requests = []
        fake_scapi = types.ModuleType("scapi")
        fake_scapi.HTTPClient = FakeClient

        async def projects(client, query, **options):
            self.requests.append((client, query, options))
            yield types.SimpleNamespace(
                id=123,
                title="Popular project",
                author=types.SimpleNamespace(username="creator"),
                url="https://scratch.mit.edu/projects/123/",
            )

        fake_scapi.search_projects = projects

        async def studios(client, query, **options):
            self.requests.append((client, query, options))
            yield types.SimpleNamespace(
                id=77, title="Example studio", url="https://scratch.mit.edu/studios/77/",
            )

        fake_scapi.search_studios = studios

        with patch.dict(sys.modules, {"scapi": fake_scapi}):
            spec = importlib.util.spec_from_file_location("scc_search_test", SCRIPT)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

        self.module = module

    async def run_main(self, *arguments):
        output = io.StringIO()

        with patch.object(sys, "argv", [str(SCRIPT), *arguments]), \
                contextlib.redirect_stdout(output):
            code = await self.module.main()

        return code, json.loads(output.getvalue())

    async def test_popular_search_uses_one_request(self):
        code, response = await self.run_main(
            "project", "platformer", "popular", "10", "20", "ja"
        )

        self.assertEqual(code, 0)
        self.assertEqual(FakeClient.calls, 1)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.requests[0][1], "platformer")
        self.assertEqual(self.requests[0][2], {
            "mode": "popular", "language": "ja", "limit": 10, "offset": 20,
        })
        self.assertEqual(response["mode"], "popular")
        self.assertEqual(response["results"][0]["author"], "creator")

    async def test_invalid_mode_sends_no_request(self):
        code, response = await self.run_main(
            "project", "platformer", "newest", "10", "0", "en"
        )

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Mode must be trending or popular.")
        self.assertEqual(FakeClient.calls, 0)

    async def test_studio_search_uses_scapi_search_studios(self):
        code, response = await self.run_main(
            "studio", "animations", "popular", "5", "0", "ja"
        )
        self.assertEqual(code, 0)
        self.assertEqual(response["type"], "studio")
        self.assertEqual(response["results"][0]["id"], 77)
        self.assertEqual(self.requests[0][2], {
            "mode": "popular", "language": "ja", "limit": 5, "offset": 0,
        })


if __name__ == "__main__":
    unittest.main()
