import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "management.py"


def project(project_id, title, shared=False, trashed=False):
    return types.SimpleNamespace(
        id=project_id, title=title, public=shared, deleted=trashed
    )


class FakeStudio:
    accepted = []
    promoted = []
    deleted = []
    calls = []
    reports = []

    def __init__(self, studio_id, _session):
        self.id = studio_id
        self.comments_allowed = True
        self.open_to_all = False

    async def update(self):
        self.calls.append(("load", self.id))

    async def toggle_comment(self):
        self.calls.append(("toggle-comment", self.id))
        self.comments_allowed = not self.comments_allowed

    async def open_project(self):
        self.calls.append(("open-project", self.id))
        self.open_to_all = True

    async def close_project(self):
        self.calls.append(("close-project", self.id))
        self.open_to_all = False

    async def get_my_role(self):
        self.calls.append(("role", self.id))
        return types.SimpleNamespace(manager=True, curator=True, invited=False, following=False)

    async def accept_invite(self):
        self.accepted.append(self.id)

    async def promote(self, username):
        self.promoted.append((self.id, username))

    async def edit(self, **options):
        self.calls.append(("edit", self.id, options))
        if options.get("trash"):
            self.deleted.append(self.id)

    async def set_thumbnail(self, data):
        self.calls.append(("thumbnail", self.id, data))

    async def add_project(self, project_id):
        self.calls.append(("add-project", self.id, project_id))

    async def remove_project(self, project_id):
        self.calls.append(("remove-project", self.id, project_id))

    async def follow(self):
        self.calls.append(("follow", self.id))

    async def unfollow(self):
        self.calls.append(("unfollow", self.id))

    async def leave(self):
        self.calls.append(("leave", self.id))

    async def invite(self, username):
        self.calls.append(("invite", self.id, username))

    async def remove_curator(self, username):
        self.calls.append(("remove-curator", self.id, username))

    async def transfer_ownership(self, username, password):
        self.calls.append(("transfer", self.id, username, password))

    async def report(self, report_type):
        self.reports.append((self.id, report_type))
        return "reviewed"

    async def get_comments(self, **_options):
        yield types.SimpleNamespace(id=19, author=types.SimpleNamespace(username="author"), content="Comment")

    async def get_managers(self, **_options):
        yield types.SimpleNamespace(username="manager", url="https://scratch.mit.edu/users/manager/")

    async def get_curators(self, **_options):
        yield types.SimpleNamespace(username="curator", url="https://scratch.mit.edu/users/curator/")


class FakeProject:
    shared = []
    trashed = []
    calls = []
    reports = []

    def __init__(self, project_id, _session):
        self.id = project_id

    async def share(self):
        self.shared.append(self.id)

    async def unshare(self):
        self.calls.append(("unshare", self.id))

    async def is_loved(self):
        self.calls.append(("is-loved", self.id))
        return True

    async def is_favorited(self):
        self.calls.append(("is-favorited", self.id))
        return False

    async def old_edit(self, **options):
        self.calls.append(("old-edit", self.id, options))
        if options.get("trash"):
            self.trashed.append(self.id)

    async def edit(self, **options):
        self.calls.append(("edit", self.id, options))

    async def set_thumbnail(self, data):
        self.calls.append(("thumbnail", self.id, data))

    async def report(self, category, reason):
        self.calls.append(("report", self.id, category, reason))
        return "reviewed"


class FakeComment:
    reports = []
    deleted = []

    def __init__(self, comment_id, _session, *, place):
        self.id = comment_id
        self.place = place

    async def report(self):
        self.reports.append((self.place.__class__.__name__, self.id))

    async def delete(self, is_old=False):
        self.deleted.append((self.place.__class__.__name__, self.id, is_old))


class FakeUser:
    reports = []
    def __init__(self, username="active_user", *_args, **_kwargs):
        self.username = username
        self.edit_calls = []
        self.comments_allowed = True
        self.comment_loads = 0
        self.comment_toggles = 0

    async def load_website(self):
        self.comment_loads += 1

    async def toggle_comment(self):
        self.comment_toggles += 1
        self.comments_allowed = not self.comments_allowed

    async def edit(self, **options):
        self.edit_calls.append(options)

    async def report(self, report_type):
        self.reports.append((self.username, report_type))


class FakeClient:
    def __init__(self):
        self.urls = []
        self.puts = []

    async def put(self, url, **kwargs):
        self.puts.append((url, kwargs))
        return types.SimpleNamespace(json=lambda: {"id": int(url.rsplit("/", 1)[1]), **kwargs["json"]})

    async def get(self, url):
        self.urls.append(url)
        return types.SimpleNamespace(data=b'{"targets": []}')


class FakeClassroom:
    def __init__(self, class_id, title="Class"):
        self.id = class_id
        self.title = title
        self.description = "About class"
        self.status = "Working"
        self.closed = False
        self.student_count = 1
        self.studio_count = 1
        self.calls = []

    async def edit(self, **options):
        self.calls.append(("edit", options))
        if options["title"] is not None:
            self.title = options["title"]
        if options["open"] is not None:
            self.closed = not options["open"]

    async def get_students(self, **options):
        self.calls.append(("students", options))
        yield types.SimpleNamespace(
            username="student", url="https://scratch.mit.edu/users/student/"
        )

    async def get_class_studios(self, **options):
        self.calls.append(("studios", options))
        yield types.SimpleNamespace(id=44, title="Class studio")

    async def create_class_studio(self, title, description):
        self.calls.append(("create-studio", title, description))
        return types.SimpleNamespace(id=45, title=title)


class FakeSession:
    username = "active_user"

    def __init__(self):
        self.list_calls = []
        self.create_calls = []
        self.studio_calls = 0
        self.client = FakeClient()
        self.user = FakeUser()
        self.settings_calls = []
        self.account_calls = []
        self.classroom = FakeClassroom(25)

    async def get_mystuff_projects(self, **options):
        self.list_calls.append(options)
        yield project(1, "Shared", True)

    async def get_mystuff_studios(self, **options):
        self.list_calls.append(options)
        yield types.SimpleNamespace(id=9, title="Studio")

    async def get_mystuff_classes(self, **options):
        self.list_calls.append(options)
        yield self.classroom

    async def get_mystuff_class(self, class_id):
        self.account_calls.append(("get-class", class_id))
        return self.classroom

    async def create_class(self, title, description, status):
        self.account_calls.append(("create-class", title, description, status))
        return FakeClassroom(26, title)

    async def create_project(self, **options):
        self.create_calls.append(options)
        return project(2, options.get("title"), False)

    async def get_project(self, project_id):
        return types.SimpleNamespace(
            id=project_id,
            download_url=f"https://projects.scratch.mit.edu/{project_id}?token=test",
        )

    async def create_studio(self):
        self.studio_calls += 1
        return types.SimpleNamespace(id=3)

    async def change_account_settings(self, **options):
        self.settings_calls.append(options)

    async def clear_message(self):
        self.account_calls.append(("clear-messages",))

    async def get_invite_status(self):
        return {"eligible": True}

    async def become_scratcher(self):
        self.account_calls.append(("become-scratcher",))

    async def change_email(self, email, password):
        self.account_calls.append(("change-email", email, password))

    async def change_password(self, old_password, new_password):
        self.account_calls.append(("change-password", old_password, new_password))

    async def delete_account(self, password, delete_projects):
        self.account_calls.append(("delete-account", password, delete_projects))


class FakeLogin:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        return None


class ManagementTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeStudio.accepted = []
        FakeStudio.promoted = []
        FakeStudio.deleted = []
        FakeStudio.calls = []
        FakeStudio.reports = []
        FakeProject.shared = []
        FakeProject.trashed = []
        FakeProject.calls = []
        FakeComment.reports = []
        FakeComment.deleted = []
        FakeUser.reports = []
        self.session = FakeSession()
        self.session_ids = []
        fake_scapi = types.ModuleType("scapi")
        fake_scapi.Studio = FakeStudio
        fake_scapi.Project = FakeProject
        fake_scapi.User = FakeUser
        fake_scapi.Comment = FakeComment

        def session_login(session_id):
            self.session_ids.append(session_id)
            return FakeLogin(self.session)

        fake_scapi.session_login = session_login
        with patch.dict(sys.modules, {"scapi": fake_scapi}):
            spec = importlib.util.spec_from_file_location("scc_management_test", SCRIPT)
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

    async def test_lists_one_mystuff_page_with_visibility(self):
        code, response = await self.run_main(
            "project", "list",
            payload={
                "session_id": "private-session",
                "visibility": "shared",
                "page": 2,
            },
        )

        self.assertEqual(code, 0)
        self.assertEqual(self.session.list_calls, [{
            "start_page": 2, "end_page": 2, "type": "shared",
        }])
        self.assertEqual(response["projects"][0]["id"], 1)
        self.assertEqual(response["account"], "active_user")

    async def test_unshare_uses_scapi_once_after_confirmation(self):
        code, _ = await self.run_main("project", "unshare", payload={"session_id": "private", "expected_account": "active_user", "project_id": 7})
        self.assertEqual(code, 0)
        self.assertEqual(FakeProject.calls, [("unshare", 7)])

    async def test_reactions_and_role_are_read_only_and_need_no_confirmation(self):
        code, response = await self.run_main("project", "reactions", payload={"session_id": "private", "project_id": 7})
        self.assertEqual(code, 0)
        self.assertTrue(response["loved"])
        self.assertFalse(response["favorited"])
        self.assertEqual(FakeProject.calls, [("is-loved", 7), ("is-favorited", 7)])
        code, response = await self.run_main("studio", "role", payload={"session_id": "private", "studio_id": 8})
        self.assertEqual(code, 0)
        self.assertEqual(response["role"], {"manager": True, "curator": True, "invited": False, "following": False})
        self.assertEqual(FakeStudio.calls, [("role", 8)])

    async def test_project_comments_use_official_field_and_verify_response(self):
        for desired in (False, True):
            code, response = await self.run_main("project", "settings", payload={"session_id": "private", "expected_account": "active_user", "project_id": 7, "comments": desired})
            self.assertEqual(code, 0)
            self.assertIs(response["comments"], desired)
        self.assertEqual(self.session.client.puts, [
            ("https://api.scratch.mit.edu/projects/7", {"json": {"comments_allowed": False}}),
            ("https://api.scratch.mit.edu/projects/7", {"json": {"comments_allowed": True}}),
        ])
        async def ignored_put(*_args, **_kwargs):
            return types.SimpleNamespace(json=lambda: {"id": 7, "comments_allowed": True})
        with patch.object(self.session.client, "put", ignored_put):
            code, response = await self.run_main("project", "settings", payload={"session_id": "private", "expected_account": "active_user", "project_id": 7, "comments": False})
        self.assertEqual(code, 1)
        self.assertIn("could not be verified", response["error"])

    async def test_studio_settings_skip_matching_states_and_verify_changes(self):
        for field, desired, changed in (("comments", True, False), ("comments", False, True), ("open_to_all", False, False), ("open_to_all", True, True)):
            FakeStudio.calls = []
            code, response = await self.run_main("studio", "settings", payload={"session_id": "private", "expected_account": "active_user", "studio_id": 8, field: desired})
            self.assertEqual(code, 0)
            self.assertIs(response[field], desired)
            self.assertIs(response["changed"], changed)
            writes = [call for call in FakeStudio.calls if call[0] != "load"]
            self.assertEqual(len(writes), int(changed))
            self.assertEqual(len(FakeStudio.calls), 3 if changed else 1)

    async def test_profile_comments_repeat_is_idempotent_and_other_settings_untouched(self):
        for desired, changed in ((False, True), (False, False), (True, True)):
            code, response = await self.run_main("account", "settings", payload={"session_id": "private", "expected_account": "active_user", "comments": desired})
            self.assertEqual(code, 0)
            self.assertIs(response["comments"], desired)
            self.assertIs(response["changed"], changed)
        self.assertEqual(self.session.user.comment_toggles, 2)
        self.assertEqual(self.session.settings_calls, [])

    async def test_unknown_or_unverified_state_does_not_succeed_or_repeat_toggle(self):
        self.session.user.comments_allowed = None
        payload = {"session_id": "private", "expected_account": "active_user", "comments": False}
        code, response = await self.run_main("account", "settings", payload=payload)
        self.assertEqual(code, 1)
        self.assertIn("No change was requested", response["error"])
        self.assertEqual(self.session.user.comment_toggles, 0)
        self.session.user.comments_allowed = True
        async def ignored_toggle():
            self.session.user.comment_toggles += 1
        with patch.object(self.session.user, "toggle_comment", ignored_toggle):
            code, response = await self.run_main("account", "settings", payload=payload)
        self.assertEqual(code, 1)
        self.assertIn("Check its state", response["error"])
        self.assertEqual(self.session.user.comment_toggles, 1)

    async def test_new_mutations_require_confirmation_and_reject_account_changes(self):
        for entity, action, fields in (("project", "unshare", {"project_id": 7}), ("project", "settings", {"project_id": 7, "comments": False}),
                                       ("studio", "settings", {"studio_id": 8, "open_to_all": True}), ("account", "settings", {"comments": False})):
            for expected in (None, "different_user"):
                payload = {"session_id": "private", **fields}
                if expected is not None:
                    payload["expected_account"] = expected
                code, _ = await self.run_main(entity, action, payload=payload)
                self.assertEqual(code, 1)
        self.assertEqual(FakeProject.calls + FakeStudio.calls + self.session.client.puts, [])
        self.assertEqual(self.session.user.comment_toggles, 0)

    async def test_invalid_setting_payloads_fail_before_auth(self):
        for entity, fields in (("project", {"project_id": 7, "comments": "off"}), ("studio", {"studio_id": 8}),
                               ("studio", {"studio_id": 8, "comments": True, "open_to_all": False}),
                               ("account", {"comments": False, "country": "Japan"})):
            code, _ = await self.run_main(entity, "settings", payload={"session_id": "private", "expected_account": "active_user", **fields})
            self.assertEqual(code, 1)
        self.assertEqual(self.session_ids, [])

    async def test_invalid_first_reaction_stops_before_second_request(self):
        async def malformed(_project):
            return None
        with patch.object(FakeProject, "is_loved", malformed):
            code, response = await self.run_main("project", "reactions", payload={"session_id": "private", "project_id": 7})
        self.assertEqual(code, 1)
        self.assertIn("invalid", response["error"])
        self.assertEqual(FakeProject.calls, [])

    async def test_bad_json_after_setting_write_is_unverified_not_expired_auth(self):
        class BadResponse:
            def json(self):
                raise ValueError("private response")
        async def bad_put(*_args, **_kwargs):
            return BadResponse()
        with patch.object(self.session.client, "put", bad_put):
            code, response = await self.run_main("project", "settings", payload={"session_id": "private", "expected_account": "active_user", "project_id": 7, "comments": False})
        self.assertEqual(code, 1)
        self.assertIn("could not be verified", response["error"])
        self.assertNotIn("scc login", response["error"])

    async def test_lists_only_the_requested_studio_page(self):
        code, response = await self.run_main(
            "studio", "list",
            payload={"session_id": "private-session", "type": "owned", "page": 2},
        )
        self.assertEqual(code, 0)
        self.assertEqual(self.session.list_calls, [{"start_page": 2, "end_page": 2, "type": "owned"}])
        self.assertEqual(response["studios"][0]["url"], "https://scratch.mit.edu/studios/9/")

    async def test_creation_and_invite_require_confirmed_account(self):
        for entity, action, fields in (
            ("project", "create", {}), ("project", "remix", {"project_id": 9}),
            ("studio", "create", {}), ("studio", "accept-invite", {"studio_id": 42}),
        ):
            for expected in (None, "another_user"):
                with self.subTest(entity=entity, action=action, expected=expected):
                    payload = {"session_id": "private-session", **fields}
                    if expected is not None:
                        payload["expected_account"] = expected
                    code, response = await self.run_main(entity, action, payload=payload)
                    self.assertEqual(code, 1)
                    self.assertIn("account", response["error"])
        self.assertEqual(self.session.create_calls, [])
        self.assertEqual(self.session.studio_calls, 0)
        self.assertEqual(FakeStudio.accepted, [])
        self.assertEqual(self.session.client.urls, [])

    async def test_creates_project_and_studio_once(self):
        project_code, project_response = await self.run_main(
            "project", "create",
            payload={"session_id": "private-session", "expected_account": "active_user", "title": "New project"},
        )
        studio_code, studio_response = await self.run_main(
            "studio", "create", payload={"session_id": "private-session", "expected_account": "active_user"}
        )

        self.assertEqual((project_code, studio_code), (0, 0))
        self.assertEqual(self.session.create_calls, [{"title": "New project"}])
        self.assertEqual(self.session.studio_calls, 1)
        self.assertEqual(project_response["project"]["id"], 2)
        self.assertEqual(studio_response["studio_id"], 3)

    async def test_accepts_studio_invite_once(self):
        code, response = await self.run_main(
            "studio", "accept-invite",
            payload={"session_id": "private-session", "expected_account": "active_user", "studio_id": 42},
        )

        self.assertEqual(code, 0)
        self.assertEqual(FakeStudio.accepted, [42])
        self.assertEqual(response["studio_id"], 42)

    async def test_remix_copies_source_data(self):
        code, response = await self.run_main(
            "project", "remix",
            payload={"session_id": "private-session", "expected_account": "active_user", "project_id": 9},
        )

        self.assertEqual(code, 0)
        self.assertEqual(self.session.client.urls, [
            "https://projects.scratch.mit.edu/9?token=test",
        ])
        self.assertEqual(self.session.create_calls, [{
            "title": None,
            "project_data": b'{"targets": []}',
            "remix_id": 9,
            "is_json": True,
        }])
        self.assertEqual(response["source_project_id"], 9)

    async def test_dangerous_actions_check_account_and_call_scapi_once(self):
        share_code, _ = await self.run_main(
            "project", "share",
            payload={
                "session_id": "private-session", "project_id": 7,
                "expected_account": "active_user",
            },
        )
        promote_code, _ = await self.run_main(
            "studio", "promote",
            payload={
                "session_id": "private-session", "studio_id": 8,
                "username": "curator", "expected_account": "active_user",
            },
        )
        trash_code, _ = await self.run_main(
            "project", "trash",
            payload={
                "session_id": "private-session", "project_id": 10,
                "expected_account": "active_user",
            },
        )
        delete_code, _ = await self.run_main(
            "studio", "delete",
            payload={
                "session_id": "private-session", "studio_id": 11,
                "expected_account": "active_user",
            },
        )

        self.assertEqual((share_code, promote_code, trash_code, delete_code), (0, 0, 0, 0))
        self.assertEqual(FakeProject.shared, [7])
        self.assertEqual(FakeProject.trashed, [10])
        self.assertEqual(FakeStudio.promoted, [(8, "curator")])
        self.assertEqual(FakeStudio.deleted, [11])

    async def test_profile_and_settings_use_scapi(self):
        profile_code, _ = await self.run_main(
            "account", "edit-profile",
            payload={"session_id": "private-session", "bio": "About", "expected_account": "active_user"},
        )
        settings_code, _ = await self.run_main(
            "account", "settings",
            payload={"session_id": "private-session", "cat_ears": True, "expected_account": "active_user"},
        )

        self.assertEqual((profile_code, settings_code), (0, 0))
        self.assertEqual(self.session.user.edit_calls, [{
            "bio": "About", "status": None, "featured_project_id": None,
        }])
        self.assertEqual(self.session.settings_calls, [{
            "country": None, "state": None, "avatar_badge_type": True,
        }])

    async def test_edit_thumbnail_restore_and_add_project_use_scapi(self):
        common = {"session_id": "private-session", "expected_account": "active_user"}
        edit_code, _ = await self.run_main(
            "project", "edit", payload={**common, "project_id": 5, "title": "New"}
        )
        thumbnail_code, _ = await self.run_main(
            "project", "thumbnail",
            payload={**common, "project_id": 5, "thumbnail": "UE5H"},
        )
        restore_code, _ = await self.run_main(
            "project", "restore", payload={**common, "project_id": 5}
        )
        add_code, _ = await self.run_main(
            "studio", "add-project",
            payload={**common, "studio_id": 6, "project_id": 5},
        )

        self.assertEqual((edit_code, thumbnail_code, restore_code, add_code), (0, 0, 0, 0))
        self.assertIn(("edit", 5, {"title": "New", "instructions": None, "description": None}), FakeProject.calls)
        self.assertIn(("thumbnail", 5, b"PNG"), FakeProject.calls)
        self.assertIn(("old-edit", 5, {"trash": False}), FakeProject.calls)
        self.assertIn(("add-project", 6, 5), FakeStudio.calls)

    async def test_reports_are_mocked_and_never_touch_scratch(self):
        common = {"session_id": "private-session", "expected_account": "active_user"}
        project_code, response = await self.run_main(
            "project", "report",
            payload={**common, "project_id": 7, "category": 6, "reason": "Reason"},
        )
        comment_code, _ = await self.run_main(
            "project", "report-comment",
            payload={**common, "project_id": 7, "comment_id": 12},
        )

        self.assertEqual((project_code, comment_code), (0, 0))
        self.assertEqual(response["moderation_status"], "reviewed")
        self.assertIn(("report", 7, 6, "Reason"), FakeProject.calls)
        self.assertEqual(FakeComment.reports, [("FakeProject", 12)])

    async def test_studio_management_comment_deletion_and_reports_are_mocked(self):
        common = {"session_id": "private-session", "expected_account": "active_user"}
        remove_code, _ = await self.run_main(
            "studio", "remove-curator",
            payload={**common, "studio_id": 8, "username": "curator"},
        )
        invite_code, _ = await self.run_main(
            "studio", "invite",
            payload={**common, "studio_id": 8, "username": "curator"},
        )
        report_code, _ = await self.run_main(
            "studio", "report", payload={**common, "studio_id": 8, "type": "title"},
        )
        comment_code, _ = await self.run_main(
            "studio", "delete-comment",
            payload={**common, "studio_id": 8, "comment_id": 18},
        )
        user_report_code, response = await self.run_main(
            "user", "report", payload={**common, "username": "other", "type": "icon"},
        )
        self.assertEqual((remove_code, invite_code, report_code, comment_code, user_report_code),
                         (0, 0, 0, 0, 0))
        self.assertIn(("remove-curator", 8, "curator"), FakeStudio.calls)
        self.assertIn(("invite", 8, "curator"), FakeStudio.calls)
        self.assertEqual(FakeStudio.reports, [(8, "title")])
        self.assertIn(("FakeStudio", 18, False), FakeComment.deleted)
        self.assertEqual(FakeUser.reports, [("other", "icon")])
        self.assertEqual(response["report_type"], "icon")

    async def test_sensitive_account_actions_are_mocked(self):
        common = {"session_id": "private-session", "expected_account": "active_user"}
        email_code, _ = await self.run_main(
            "account", "change-email",
            payload={**common, "email": "new@example.com", "password": "secret"},
        )
        delete_code, _ = await self.run_main(
            "account", "delete-account",
            payload={**common, "password": "secret", "delete_projects": False},
        )

        self.assertEqual((email_code, delete_code), (0, 0))
        self.assertEqual(self.session.account_calls, [
            ("change-email", "new@example.com", "secret"),
            ("delete-account", "secret", False),
        ])

    async def test_password_change_and_studio_transfer_require_account_match(self):
        common = {"session_id": "private-session", "expected_account": "active_user"}
        password_code, _ = await self.run_main(
            "account", "change-password",
            payload={**common, "old_password": "old-secret", "new_password": "new-secret"},
        )
        transfer_code, response = await self.run_main(
            "studio", "transfer",
            payload={**common, "studio_id": 8, "username": "newowner", "password": "secret"},
        )
        self.assertEqual((password_code, transfer_code), (0, 0), response)
        self.assertIn(("change-password", "old-secret", "new-secret"), self.session.account_calls)
        self.assertIn(("transfer", 8, "newowner", "secret"), FakeStudio.calls)
        self.assertEqual(response["username"], "newowner")

        rejected, _ = await self.run_main(
            "studio", "transfer",
            payload={"session_id": "private-session", "studio_id": 8,
                     "username": "other", "password": "secret", "expected_account": "other"},
        )
        self.assertEqual(rejected, 1)
        self.assertEqual(len([call for call in FakeStudio.calls if call[0] == "transfer"]), 1)

    async def test_class_lists_and_reads_one_page(self):
        listed, response = await self.run_main(
            "class", "list",
            payload={"session_id": "private-session", "type": "all", "page": 2},
        )
        students, student_response = await self.run_main(
            "class", "students",
            payload={"session_id": "private-session", "class_id": 25, "page": 3},
        )
        studios, studio_response = await self.run_main(
            "class", "studios",
            payload={"session_id": "private-session", "class_id": 25, "page": 4},
        )
        self.assertEqual((listed, students, studios), (0, 0, 0))
        self.assertEqual(response["classrooms"][0]["id"], 25)
        self.assertEqual(self.session.list_calls, [{
            "start_page": 2, "end_page": 2, "type": "all",
        }])
        self.assertEqual(student_response["items"][0]["username"], "student")
        self.assertEqual(studio_response["items"][0]["id"], 44)
        self.assertIn(("students", {"start_page": 3, "end_page": 3, "use_api": True}),
                      self.session.classroom.calls)

    async def test_class_mutations_use_scapi_once_after_confirmation(self):
        common = {"session_id": "private-session", "expected_account": "active_user"}
        created, response = await self.run_main(
            "class", "create",
            payload={**common, "title": "New class", "description": "About"},
        )
        edited, edit_response = await self.run_main(
            "class", "edit", payload={**common, "class_id": 25, "open": False},
        )
        studio, studio_response = await self.run_main(
            "class", "create-studio",
            payload={**common, "class_id": 25, "title": "Class studio"},
        )
        self.assertEqual((created, edited, studio), (0, 0, 0))
        self.assertEqual(response["classroom"]["id"], 26)
        self.assertIn(("create-class", "New class", "About", None), self.session.account_calls)
        self.assertIn(("edit", {"title": None, "description": None,
                                "status": None, "open": False}), self.session.classroom.calls)
        self.assertIs(edit_response["classroom"]["closed"], True)
        self.assertEqual(studio_response["studio"]["id"], 45)

    async def test_invalid_class_mutation_never_opens_session(self):
        code, response = await self.run_main(
            "class", "create", payload={"session_id": "private-session", "title": "",
                                       "expected_account": "active_user"},
        )
        self.assertEqual(code, 1)
        self.assertIn("title", response["error"])
        self.assertEqual(self.session_ids, [])

    async def test_account_mismatch_prevents_mutation(self):
        code, response = await self.run_main(
            "project", "trash",
            payload={
                "session_id": "private-session", "project_id": 7,
                "expected_account": "another_user",
            },
        )

        self.assertEqual(code, 1)
        self.assertIn("account changed", response["error"])
        self.assertEqual(FakeProject.trashed, [])

    async def test_invalid_options_make_no_session_request(self):
        code, response = await self.run_main(
            "project", "list",
            payload={
                "session_id": "private-session", "visibility": "unknown", "page": 1,
            },
        )

        self.assertEqual(code, 1)
        self.assertEqual(response["error"], "Invalid project list options.")
        self.assertEqual(self.session_ids, [])


if __name__ == "__main__":
    unittest.main()
