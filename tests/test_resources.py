import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "resources.py"


class FakeClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


class ResourceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        fake_scapi = types.ModuleType("scapi")
        fake_scapi.HTTPClient = FakeClient

        async def get_project(project_id, **_kwargs):
            return types.SimpleNamespace(
                id=project_id, title="Project", author=types.SimpleNamespace(username="author"),
                remix_parent_id=1, remix_root_id=1, instructions="Use it",
                description="Credits", love_count=2, favorite_count=3, view_count=4,
                remix_count=5, public=True,
                url=f"https://scratch.mit.edu/projects/{project_id}/",
                thumbnail_url="https://uploads.scratch.mit.edu/project.png",
            )

        async def get_studio(studio_id, **_kwargs):
            return types.SimpleNamespace(
                id=studio_id, title="Studio", description="Description", host_id=1,
                open_to_all=True, comments_allowed=True, follower_count=2,
                manager_count=3, curator_count=4, project_count=5,
                url=f"https://scratch.mit.edu/studios/{studio_id}",
                thumbnail_url="https://uploads.scratch.mit.edu/studio.png",
            )

        fake_scapi.get_project = get_project
        fake_scapi.get_studio = get_studio
        with patch.dict(sys.modules, {"scapi": fake_scapi}):
            spec = importlib.util.spec_from_file_location("scc_resources_test", SCRIPT)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        self.module = module

    async def run_main(self, *arguments):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), *arguments]), \
                contextlib.redirect_stdout(output):
            code = await self.module.main()
        return code, json.loads(output.getvalue())

    async def test_project_details_include_requested_statistics(self):
        code, response = await self.run_main("project", "123")
        self.assertEqual(code, 0)
        self.assertEqual(response["remix_parent_id"], 1)
        self.assertEqual(response["instructions"], "Use it")
        self.assertEqual(response["description"], "Credits")
        self.assertEqual(response["love_count"], 2)
        self.assertEqual(response["favorite_count"], 3)
        self.assertEqual(response["view_count"], 4)
        self.assertEqual(response["remix_count"], 5)

    async def test_studio_details_are_serialized(self):
        code, response = await self.run_main("studio", "456")
        self.assertEqual(code, 0)
        self.assertEqual(response["title"], "Studio")
        self.assertEqual(response["project_count"], 5)


if __name__ == "__main__":
    unittest.main()
