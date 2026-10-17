import base64
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import sys
import types
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "src/python/project_transfer.py"
BODY = b"<svg>test costume</svg>"
NAME = hashlib.md5(BODY).hexdigest() + ".svg"
PROJECT = {"targets": [{"isStage": True, "name": "Stage", "blocks": {}, "costumes": [
    {"assetId": NAME.split(".")[0], "dataFormat": "svg", "md5ext": NAME},
], "sounds": []}], "monitors": [], "extensions": [], "meta": {"semver": "3.0.0"}}


def archive(data=None, assets=None):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as file:
        file.writestr("project.json", json.dumps(PROJECT if data is None else data))
        for name, body in (assets if assets is not None else {NAME: BODY}).items():
            file.writestr(name, body)
    return output.getvalue()


class TransferTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.calls = []
        self.project_data = copy.deepcopy(PROJECT)
        self.raw_project = None
        self.username = "active_user"
        self.author = "active_user"
        self.asset_status = "ok"
        self.asset_body = BODY
        self.asset_bodies = {}
        self.failure = None
        self.upload_failure = None
        self.bad_verification = False
        owner = self

        class Response:
            def __init__(self, data):
                self.data = data

            def json(self):
                return json.loads(self.data)

        class Client:
            async def __aenter__(self):
                owner.calls.append(("open",))
                return self

            async def __aexit__(self, *_args):
                owner.calls.append(("close",))

            async def get(self, url):
                owner.calls.append(("get", "asset" if "assets" in url else "project"))
                if owner.failure:
                    raise owner.failure
                if "assets" in url:
                    name = url.split("/asset/")[1].split("/")[0]
                    return Response(owner.asset_bodies.get(name, owner.asset_body))
                data = {} if owner.bad_verification else owner.project_data
                return Response(owner.raw_project if owner.raw_project is not None else json.dumps(data).encode())

            async def post(self, url, *, data):
                owner.calls.append(("asset", url.rsplit("/", 1)[1], data))
                if owner.upload_failure:
                    raise owner.upload_failure
                return Response(json.dumps({"status": owner.asset_status}).encode())

        class Project:
            id = 123
            title = "サイトの作品名"
            download_url = "https://projects.scratch.mit.edu/123?token=private-project-token"

            @property
            def author(self):
                return types.SimpleNamespace(username=owner.author)

            async def edit_project(self, data, *, is_json):
                owner.calls.append(("edit", data, is_json))
                owner.project_data = copy.deepcopy(data)

        class Session(Client):
            @property
            def username(self):
                return owner.username

            client = Client()

            async def get_project(self, target):
                owner.calls.append(("metadata", target))
                return Project()

            async def create_project(self, **kwargs):
                owner.calls.append(("create", kwargs))
                owner.project_data = copy.deepcopy(kwargs["project_data"])
                return Project()

        async def get_project(target, *, _client):
            owner.calls.append(("metadata", target))
            return Project()

        def session_login(session):
            owner.calls.append(("login", session))
            return Session()

        fake = types.ModuleType("scapi")
        fake.HTTPClient, fake.get_project, fake.session_login = Client, get_project, session_login
        errors = types.ModuleType("scapi.utils.error")
        self.limited = errors.TooManyRequests = type("TooManyRequests", (Exception,), {})
        with patch.dict(sys.modules, {"scapi": fake, "scapi.utils": types.ModuleType("scapi.utils"), "scapi.utils.error": errors}):
            spec = importlib.util.spec_from_file_location("scc_transfer_test", SCRIPT)
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    async def run_main(self, action, payload):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), action]), patch.object(sys, "stdin", io.StringIO(json.dumps(payload))), contextlib.redirect_stdout(output):
            status = await self.module.main()
        text = output.getvalue()
        self.assertNotIn("private-project-token", text)
        self.assertNotIn("private-session", text)
        return status, json.loads(text)

    def upload_payload(self, **kwargs):
        return {"archive": base64.b64encode(archive()).decode(), "session_id": "private-session", "expected_account": "active_user", **kwargs}

    async def test_validation_is_offline_and_preserves_assets(self):
        data, assets = self.module.read_archive(archive())
        self.assertEqual(data, PROJECT)
        self.assertEqual(assets, {NAME: BODY})
        code, response = await self.run_main("validate", {"archive": base64.b64encode(archive()).decode()})
        self.assertEqual((code, response), (0, {"action": "validate", "valid": True}))
        self.assertEqual(self.calls, [])

    async def test_download_packages_assets_with_no_login(self):
        code, result = await self.run_main("download", {"project_id": 123})
        self.assertEqual(code, 0)
        self.assertEqual(result["title"], "サイトの作品名")
        self.assertEqual(self.module.read_archive(base64.b64decode(result["archive"])), (PROJECT, {NAME: BODY}))
        self.assertEqual([call for call in self.calls if call[0] == "get"], [("get", "project"), ("get", "asset")])
        self.assertFalse(any(call[0] == "login" for call in self.calls))

    async def test_private_download_uses_session(self):
        code, _ = await self.run_main("download", {"project_id": 123, "session_id": "private-session"})
        self.assertEqual(code, 0)
        self.assertIn(("login", "private-session"), self.calls)

    async def test_new_upload_assets_precede_json_and_readback(self):
        code, response = await self.run_main("upload", self.upload_payload(title="New project"))
        self.assertEqual(code, 0)
        self.assertEqual(response, {"action": "upload", "account": "active_user", "project_id": 123})
        operations = [call[0] for call in self.calls]
        self.assertLess(operations.index("asset"), operations.index("create"))
        self.assertLess(operations.index("create"), operations.index("get"))
        self.assertEqual(next(call[1] for call in self.calls if call[0] == "create"), {"title": "New project", "project_data": PROJECT, "is_json": True})

    async def test_overwrite_checks_owner_and_preserves_metadata(self):
        code, _ = await self.run_main("upload", self.upload_payload(project_id=123))
        self.assertEqual(code, 0)
        self.assertIn(("edit", PROJECT, True), self.calls)
        self.assertFalse(any(call[0] == "create" for call in self.calls))
        self.calls.clear()
        self.author = "another_user"
        code, response = await self.run_main("upload", self.upload_payload(project_id=123))
        self.assertEqual(code, 1)
        self.assertIn("owned by the confirmed account", response["error"])
        self.assertFalse(any(call[0] in {"asset", "edit", "create"} for call in self.calls))

    async def test_account_switch_or_missing_confirmation_blocks_mutations(self):
        for payload in (self.upload_payload(expected_account="other_user"), self.upload_payload(expected_account=None)):
            self.calls.clear()
            code, _ = await self.run_main("upload", payload)
            self.assertEqual(code, 1)
            self.assertFalse(any(call[0] in {"asset", "edit", "create"} for call in self.calls))

    async def test_asset_error_does_not_submit_project(self):
        self.asset_status = "error"
        code, response = await self.run_main("upload", self.upload_payload(project_id=123))
        self.assertEqual(code, 1)
        self.assertIn("not submitted", response["error"])
        self.assertFalse(any(call[0] in {"edit", "create"} for call in self.calls))

    async def test_rate_limit_on_asset_upload_stops_without_json_or_retry(self):
        self.upload_failure = self.limited("private-session")
        code, response = await self.run_main("upload", self.upload_payload(project_id=123))
        self.assertEqual(code, 1)
        self.assertIn("rate limit", response["error"])
        self.assertEqual(sum(call[0] == "asset" for call in self.calls), 1)
        self.assertFalse(any(call[0] in {"edit", "create"} for call in self.calls))

    async def test_failed_verification_is_not_success_or_retried(self):
        self.bad_verification = True
        code, response = await self.run_main("upload", self.upload_payload(project_id=123))
        self.assertEqual(code, 1)
        self.assertIn("could not be verified", response["error"])
        self.assertEqual(sum(call[0] == "edit" for call in self.calls), 1)

    async def test_rate_limit_and_network_errors_are_safe_without_retries(self):
        for error in (self.limited("private-session"), OSError("private-project-token")):
            self.calls.clear()
            self.failure = error
            code, response = await self.run_main("download", {"project_id": 123})
            self.assertEqual(code, 1)
            self.assertIn("error", response)
            self.assertEqual(sum(call[0] == "get" for call in self.calls), 1)

    async def test_bad_download_asset_prevents_partial_archive(self):
        self.asset_body = b"wrong hash"
        code, response = await self.run_main("download", {"project_id": 123})
        self.assertEqual(code, 1)
        self.assertNotIn("archive", response)

    async def test_invalid_inputs_send_no_requests(self):
        for action, payload in [("download", {"project_id": True}), ("upload", self.upload_payload(title="bad", project_id=123)), ("upload", self.upload_payload(archive="not-base64"))]:
            code, _ = await self.run_main(action, payload)
            self.assertEqual(code, 1)
            self.assertEqual(self.calls, [])

    def test_missing_corrupt_path_traversal_and_old_projects_are_rejected(self):
        for raw in (b"not a zip", archive(assets={}), archive(assets={"../bad.svg": BODY}), archive(data={"children": []}), archive(assets={NAME: b"wrong hash"})):
            with self.subTest(raw=raw[:12]), self.assertRaises(self.module.TransferError):
                self.module.read_archive(raw)

    def test_duplicate_archive_members_and_symlinks_are_rejected(self):
        for symlink in (False, True):
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w") as file:
                file.writestr("project.json", json.dumps(PROJECT))
                if symlink:
                    entry = zipfile.ZipInfo(NAME)
                    entry.external_attr = 0o120777 << 16
                    file.writestr(entry, b"/outside")
                else:
                    file.writestr(NAME, BODY)
                    with self.assertWarns(UserWarning):
                        file.writestr(NAME, BODY)
            with self.assertRaises(self.module.TransferError):
                self.module.read_archive(output.getvalue())

    def test_limits_and_asset_reference_consistency(self):
        for field, limit in (("MAX_ARCHIVE", 1), ("MAX_TOTAL", 1), ("MAX_ASSET", 1), ("MAX_JSON", 1), ("MAX_ASSETS", 0)):
            with patch.object(self.module, field, limit), self.assertRaises(self.module.TransferError):
                self.module.read_archive(archive())
        invalid = copy.deepcopy(PROJECT)
        invalid["targets"][0]["costumes"][0]["assetId"] = "0" * 32
        with self.assertRaises(self.module.TransferError):
            self.module.read_archive(archive(data=invalid))

    async def test_repeated_assets_are_fetched_and_uploaded_only_once(self):
        self.project_data["targets"][0]["costumes"] *= 2
        code, _ = await self.run_main("download", {"project_id": 123})
        self.assertEqual(code, 0)
        self.assertEqual(self.calls.count(("get", "asset")), 1)
        self.calls.clear()
        code, _ = await self.run_main("upload", self.upload_payload(archive=base64.b64encode(archive(data=self.project_data)).decode()))
        self.assertEqual(code, 0)
        self.assertEqual(sum(call[0] == "asset" for call in self.calls), 1)

    async def test_scratch2_download_preserves_scripts_text_pen_and_sound_assets(self):
        png, wav = b"mock text and pen layer", b"mock sound"
        png_name = hashlib.md5(png).hexdigest() + ".png"
        wav_name = hashlib.md5(wav).hexdigest() + ".wav"
        self.asset_bodies = {png_name: png, wav_name: wav}
        self.project_data = {
            "objName": "Stage", "scripts": [[0, 0, [["whenGreenFlag"], ["say:", "Hello"]]]],
            "costumes": [{"baseLayerMD5": NAME, "baseLayerID": -1, "textLayerMD5": png_name, "textLayerID": -1}],
            "sounds": [{"md5": wav_name, "soundID": -1, "soundName": "Sound"}],
            "penLayerMD5": png_name, "penLayerID": -1,
            "children": [{"objName": "Sprite", "costumes": [{"baseLayerMD5": NAME, "baseLayerID": -1}]}, {"cmd": "getVar:", "param": "score"}],
        }
        original = copy.deepcopy(self.project_data)
        code, response = await self.run_main("download", {"project_id": 123})
        self.assertEqual(code, 0)
        self.assertEqual(response["format"], "sb2")
        raw = base64.b64decode(response["archive"])
        data, assets = self.module.read_archive(raw, "sb2")
        self.assertEqual(set(assets), {"1.svg", "2.png", "3.wav"})
        self.assertEqual(data["scripts"], original["scripts"])
        self.assertEqual(data["costumes"][0]["baseLayerID"], data["children"][0]["costumes"][0]["baseLayerID"])
        self.assertEqual(data["costumes"][0]["textLayerID"], data["penLayerID"])
        self.assertGreater(data["costumes"][0]["textLayerID"], 0)
        self.assertEqual(self.project_data, original)
        self.assertEqual(sum(call == ("get", "asset") for call in self.calls), 3)
        self.calls.clear()
        code, _ = await self.run_main("validate", {"archive": response["archive"], "format": "sb2"})
        self.assertEqual(code, 0)
        self.assertEqual(self.calls, [])
        code, _ = await self.run_main("upload", self.upload_payload(archive=response["archive"]))
        self.assertEqual(code, 1)
        self.assertEqual(self.calls, [])

    def test_scratch2_rejects_unsafe_references_and_missing_assets(self):
        data = {"objName": "Stage", "children": [], "costumes": [{"baseLayerMD5": NAME, "baseLayerID": 1}]}
        valid = archive(data=data, assets={"1.svg": BODY})
        self.assertEqual(self.module.read_archive(valid, "sb2")[1], {"1.svg": BODY})
        for raw in (archive(data=data, assets={}), archive(data=data, assets={"../1.svg": BODY}), archive(data=data, assets={"1.svg": b"bad"})):
            with self.assertRaises(self.module.TransferError):
                self.module.read_archive(raw, "sb2")
        data["costumes"][0]["baseLayerMD5"] = "../../outside.svg"
        with self.assertRaises(self.module.TransferError):
            self.module.sb2_project(json.dumps(data).encode(), assign_ids=True)

    async def test_scratch1_download_preserves_original_binary_without_asset_requests(self):
        self.raw_project = b"ScratchV02" + (0).to_bytes(4, "big") + b"synthetic binary body"
        code, response = await self.run_main("download", {"project_id": 123})
        self.assertEqual(code, 0)
        self.assertEqual(response["format"], "sb")
        self.assertEqual(base64.b64decode(response["archive"]), self.raw_project)
        self.assertEqual(self.calls.count(("get", "project")), 1)
        self.assertEqual(self.calls.count(("get", "asset")), 0)
        self.calls.clear()
        code, _ = await self.run_main("validate", {"archive": response["archive"], "format": "sb"})
        self.assertEqual(code, 0)
        self.assertEqual(self.calls, [])
        code, _ = await self.run_main("upload", self.upload_payload(archive=response["archive"]))
        self.assertEqual(code, 1)
        self.assertEqual(self.calls, [])

    def test_scratch1_rejects_truncated_unknown_and_oversized_containers(self):
        for raw in (b"ScratchV02", b"ScratchV99" + bytes(20), b"ScratchV01" + (9999).to_bytes(4, "big") + bytes(20)):
            with self.assertRaises(self.module.TransferError):
                self.module.check_sb1(raw)
        raw = b"ScratchV01" + bytes(20)
        self.module.check_sb1(raw)
        with patch.object(self.module, "MAX_ARCHIVE", 10), self.assertRaises(self.module.TransferError):
            self.module.check_sb1(raw)
