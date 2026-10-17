import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "resource_collections.py"


class CollectionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.calls = []
        self.failure = None
        owner = self

        class Client:
            async def __aenter__(self):
                owner.calls.append(("open",))
                return self

            async def __aexit__(self, *_args):
                owner.calls.append(("close",))

        class Resource:
            def __init__(self, target, _client):
                self.id = target

            async def items(self, action, **kwargs):
                owner.calls.append((action, self.id, kwargs))
                if owner.failure:
                    raise owner.failure
                if action == "comments":
                    yield types.SimpleNamespace(id=456, author=types.SimpleNamespace(username="author"), content="Hello", created_at=None)
                elif action == "activity":
                    yield types.SimpleNamespace(action=types.SimpleNamespace(value="addproject"), actor=types.SimpleNamespace(username="author"),
                                                target=types.SimpleNamespace(title="Project"), other="today")
                else:
                    yield types.SimpleNamespace(id=456, title="Item", url=f"https://scratch.mit.edu/{'studios' if action == 'studios' else 'projects'}/456/")

            def get_comments(self, **kwargs):
                return self.items("comments", **kwargs)

            def get_remixes(self, **kwargs):
                return self.items("remixes", **kwargs)

            def get_studios(self, **kwargs):
                return self.items("studios", **kwargs)

            def get_projects(self, **kwargs):
                return self.items("projects", **kwargs)

            def get_activities(self, **kwargs):
                return self.items("activity", **kwargs)

        async def get_project(target, *, _client):
            owner.calls.append(("metadata", target))
            return Resource(target, _client)

        scapi = types.ModuleType("scapi")
        scapi.HTTPClient, scapi.Project, scapi.Studio, scapi.get_project = Client, Resource, Resource, get_project
        errors = types.ModuleType("scapi.utils.error")
        for name in ("NotFound", "TooManyRequests", "Unauthorized"):
            setattr(errors, name, type(name, (Exception,), {}))
        with patch.dict(sys.modules, {"scapi": scapi, "scapi.utils": types.ModuleType("scapi.utils"), "scapi.utils.error": errors}):
            spec = importlib.util.spec_from_file_location("scc_collections_test", SCRIPT)
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    async def run_main(self, entity, action, target=123, limit=20, offset=0):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), entity, action, str(target), str(limit), str(offset)]), contextlib.redirect_stdout(output):
            code = await self.module.main()
        return code, json.loads(output.getvalue())

    async def test_all_public_lists_are_bounded_and_metadata_is_loaded_only_when_needed(self):
        for entity, action in (("project", "comments"), ("project", "remixes"), ("project", "studios"), ("studio", "projects"), ("studio", "activity")):
            self.calls = []
            offset = 0 if action == "activity" else 40
            code, result = await self.run_main(entity, action, limit=40, offset=offset)
            self.assertEqual(code, 0)
            self.assertEqual(result["id"], 123)
            self.assertEqual(len(result["items"]), 1)
            expected = [("open",)]
            if action in {"comments", "studios"}:
                expected.append(("metadata", 123))
            expected += [(action, 123, {"limit": 40, **({"offset": offset} if action != "activity" else {})}), ("close",)]
            self.assertEqual(self.calls, expected)
            if action == "comments":
                self.assertEqual(result["items"][0]["id"], 456)
                self.assertEqual(result["items"][0]["content"], "Hello")

    async def test_invalid_options_open_no_client(self):
        for arguments in (("user", "projects"), ("project", "activity"), ("studio", "projects", 0),
                          ("studio", "projects", 123, 41), ("studio", "projects", 123, 20, -1), ("studio", "activity", 123, 20, 1)):
            code, _ = await self.run_main(*arguments)
            self.assertEqual(code, 1)
        self.assertEqual(self.calls, [])

    async def test_network_not_found_and_rate_limits_stop_without_retries(self):
        for failure in (RuntimeError("private-session"), self.module.NotFound("private-session"), self.module.TooManyRequests("private-session")):
            self.failure, self.calls = failure, []
            code, result = await self.run_main("studio", "projects")
            self.assertEqual(code, 1)
            self.assertNotIn("private-session", result["error"])
            self.assertEqual(len([call for call in self.calls if call[0] == "projects"]), 1)
            self.assertEqual(self.calls[-1], ("close",))
