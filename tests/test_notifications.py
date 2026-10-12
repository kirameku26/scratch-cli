import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "notifications.py"


class FakeSession:
    username = "target_account"

    def __init__(self):
        self.calls = []

    async def get_messages(self, **options):
        self.calls.append(options)
        project = types.SimpleNamespace(
            title="Example project",
            url="https://scratch.mit.edu/projects/123/",
        )
        yield types.SimpleNamespace(
            id=1,
            action=types.SimpleNamespace(value="project_love"),
            actor=types.SimpleNamespace(username="visitor"),
            place=project,
            target=project,
            created_at=None,
        )
        comment = types.SimpleNamespace(content="Nice project!")
        yield types.SimpleNamespace(
            id=2,
            action=types.SimpleNamespace(value="comment"),
            actor=types.SimpleNamespace(username="commenter"),
            place=project,
            target=comment,
            created_at=None,
        )


class FakeLogin:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        return None


class NotificationsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = FakeSession()
        self.session_ids = []
        fake_scapi = types.ModuleType("scapi")

        def session_login(session_id):
            self.session_ids.append(session_id)
            return FakeLogin(self.session)

        fake_scapi.session_login = session_login

        with patch.dict(sys.modules, {"scapi": fake_scapi}):
            spec = importlib.util.spec_from_file_location("scc_notifications_test", SCRIPT)
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

    async def test_lists_notifications_for_the_session_account(self):
        code, response = await self.run_main(
            "10", "20", payload={"session_id": "private-session"}
        )

        self.assertEqual(code, 0)
        self.assertEqual(self.session_ids, ["private-session"])
        self.assertEqual(self.session.calls, [{"limit": 10, "offset": 20}])
        self.assertEqual(response["username"], "target_account")
        self.assertEqual(len(response["notifications"]), 2)
        self.assertEqual(response["notifications"][1]["content"], "Nice project!")

    async def test_missing_session_makes_no_request(self):
        code, response = await self.run_main("10", "0")

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "A valid Scratch session is required.")
        self.assertEqual(self.session_ids, [])

    async def test_invalid_limit_makes_no_request(self):
        code, response = await self.run_main(
            "41", "0", payload={"session_id": "private-session"}
        )

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Invalid limit or offset.")
        self.assertEqual(self.session_ids, [])
