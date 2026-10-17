import asyncio
import contextlib
import importlib.util
import io
import json
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "runtime.py"
spec = importlib.util.spec_from_file_location("scc_runtime_test", SCRIPT)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_cancels_once_and_warns_about_unknown_mutation_result(self):
        for mutation in (False, True):
            calls = []

            async def operation():
                calls.append("start")
                try:
                    await asyncio.sleep(10)
                finally:
                    calls.append("closed")

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                code = await runtime.run_with_timeout(operation, timeout=0.01, mutation=mutation)
            self.assertEqual(code, 1)
            self.assertEqual(calls, ["start", "closed"])
            message = json.loads(output.getvalue())["error"]
            self.assertIn("timed out", message)
            self.assertEqual("check its result before retrying" in message, mutation)

    async def test_success_preserves_exit_code(self):
        async def operation():
            return 0

        self.assertEqual(await runtime.run_with_timeout(operation), 0)
