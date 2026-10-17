import importlib.util
import types
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "following.py"
spec = importlib.util.spec_from_file_location("scc_following_test", SCRIPT)
following = importlib.util.module_from_spec(spec)
spec.loader.exec_module(following)


class FollowingTests(unittest.IsolatedAsyncioTestCase):
    def user(self, names, error=None):
        calls = []
        state = {"closed": False, "yielded": 0}

        async def get_followings(**options):
            calls.append(options)
            try:
                if error:
                    raise error
                for name in names:
                    state["yielded"] += 1
                    yield types.SimpleNamespace(username=name)
            finally:
                state["closed"] = True

        return types.SimpleNamespace(username="myself", get_followings=get_followings), calls, state

    async def test_matches_self_case_insensitively_and_stops(self):
        user, calls, state = self.user(["other", "MySeLf", "later"])
        self.assertIs(await following.self_following_status(user), True)
        self.assertEqual(calls, [{"limit": 40, "offset": 0}])
        self.assertEqual(state, {"closed": True, "yielded": 2})

    async def test_no_requires_a_complete_valid_page(self):
        for names, expected in (([], False), (["other"], False), ([None], None), ([""], None)):
            with self.subTest(names=names):
                user, calls, state = self.user(names)
                self.assertIs(await following.self_following_status(user), expected)
                self.assertEqual(calls, [{"limit": 40, "offset": 0}])
                self.assertTrue(state["closed"])

    async def test_full_page_does_not_prove_not_following_or_start_another_page(self):
        user, calls, state = self.user([f"other_{index}" for index in range(40)] + ["myself"])
        self.assertIsNone(await following.self_following_status(user))
        self.assertEqual(calls, [{"limit": 40, "offset": 0}])
        self.assertEqual(state, {"closed": True, "yielded": 40})

    async def test_self_on_page_boundary_is_detected(self):
        user, _, state = self.user([f"other_{index}" for index in range(39)] + ["myself"])
        self.assertIs(await following.self_following_status(user), True)
        self.assertTrue(state["closed"])

    async def test_errors_are_not_treated_as_no_or_retried(self):
        user, calls, state = self.user([], error=RuntimeError("request failed"))
        with self.assertRaises(RuntimeError):
            await following.self_following_status(user)
        self.assertEqual(len(calls), 1)
        self.assertTrue(state["closed"])


if __name__ == "__main__":
    unittest.main()
