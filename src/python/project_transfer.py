"""Bounded Scratch downloads and sb3 uploads. No extraction or mutation retries."""
import asyncio
import base64
import hashlib
import io
import json
import re
import sys
import zipfile

import scapi
from scapi.utils.error import TooManyRequests

MAX_ARCHIVE = 50 * 1024 * 1024
MAX_TOTAL = 100 * 1024 * 1024
MAX_ASSET = 10 * 1024 * 1024
MAX_JSON = 5 * 1024 * 1024
MAX_ASSETS = 200
ASSET_NAME = re.compile(r"[a-f0-9]{32}\.[a-z0-9]{1,10}\Z")


class TransferError(Exception):
    pass


def decode_project(raw):
    if len(raw) > MAX_JSON:
        raise TransferError("Project JSON exceeds 5 MiB.")
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError):
        raise TransferError("Invalid project.json.") from None
    if not isinstance(data, dict):
        raise TransferError("Invalid project.json.")
    return data


def project_json(raw):
    data = decode_project(raw)
    if not isinstance(data.get("targets"), list) or not data["targets"]:
        raise TransferError("Only Scratch 3 projects with targets are supported.")
    stages = 0
    names = set()
    for target in data["targets"]:
        if not isinstance(target, dict) or type(target.get("isStage")) is not bool:
            raise TransferError("Invalid Scratch 3 target.")
        stages += target["isStage"]
        for collection in ("costumes", "sounds"):
            items = target.get(collection, [])
            if not isinstance(items, list):
                raise TransferError("Invalid asset list.")
            for item in items:
                if not isinstance(item, dict):
                    raise TransferError("Invalid asset reference.")
                asset_id, extension = item.get("assetId"), item.get("dataFormat")
                name = item.get("md5ext", f"{asset_id}.{extension}")
                if (not isinstance(name, str) or not ASSET_NAME.fullmatch(name)
                        or name != f"{asset_id}.{extension}"):
                    raise TransferError("Invalid asset filename or hash.")
                names.add(name)
    if stages != 1 or len(names) > MAX_ASSETS:
        raise TransferError("A project needs exactly one stage and at most 200 unique assets.")
    return data, sorted(names)


def sb2_project(raw, *, assign_ids=False):
    data = decode_project(raw)
    if not isinstance(data.get("objName"), str) or not isinstance(data.get("children"), list):
        raise TransferError("Invalid Scratch 2 project.")
    # Map local numeric filenames to server hashes. JSON downloaded from Scratch
    # may use -1 IDs; assign consistent IDs for offline sb2 imports.
    files, assigned = {}, {}

    def add(item, hash_key, id_key, default_extension=None):
        name = item.get(hash_key)
        if isinstance(name, str) and "." not in name and default_extension:
            name += f".{default_extension}"
            item[hash_key] = name
        if not isinstance(name, str) or not ASSET_NAME.fullmatch(name):
            raise TransferError("Invalid Scratch 2 asset reference.")
        if assign_ids:
            if name not in assigned:
                assigned[name] = len(assigned) + 1
            item[id_key] = assigned[name]
        identifier = item.get(id_key)
        if type(identifier) is not int or identifier < 0 or identifier > 9007199254740991:
            raise TransferError("Invalid Scratch 2 local asset ID.")
        local = f"{identifier}.{name.split('.')[1]}"
        if local in files and files[local] != name:
            raise TransferError("Conflicting Scratch 2 asset IDs.")
        files[local] = name
        if len(files) > MAX_ASSETS:
            raise TransferError("A project may contain at most 200 assets.")

    for target in [data, *data["children"]]:
        if not isinstance(target, dict):
            raise TransferError("Invalid Scratch 2 object.")
        if "objName" not in target:  # Variable/list watchers have no assets.
            continue
        for collection, hash_key, id_key, extension in (
                ("costumes", "baseLayerMD5", "baseLayerID", "png"),
                ("sounds", "md5", "soundID", None)):
            items = target.get(collection, [])
            if not isinstance(items, list):
                raise TransferError("Invalid Scratch 2 asset list.")
            for item in items:
                if not isinstance(item, dict):
                    raise TransferError("Invalid Scratch 2 asset reference.")
                add(item, hash_key, id_key, extension)
                if collection == "costumes" and item.get("textLayerMD5"):
                    add(item, "textLayerMD5", "textLayerID", "png")
    if data.get("penLayerMD5"):
        add(data, "penLayerMD5", "penLayerID", "png")
    return data, files


def check_asset(name, data):
    if not data or len(data) > MAX_ASSET or hashlib.md5(data).hexdigest() != name.split(".")[0]:
        raise TransferError("An asset is missing, exceeds 10 MiB, or has an incorrect hash.")


def check_sb1(raw):
    # Keep the original binary intact. Do not execute or deserialize Squeak
    # objects; this check identifies the container, not semantic validity.
    if (len(raw) <= 14 or len(raw) > MAX_ARCHIVE
            or raw[:10] not in (b"ScratchV01", b"ScratchV02")
            or int.from_bytes(raw[10:14], "big") > len(raw) - 14):
        raise TransferError("Invalid or oversized Scratch 1 project file.")


def read_archive(raw, project_format="sb3"):
    if not raw or len(raw) > MAX_ARCHIVE:
        raise TransferError("The project archive must be between 1 byte and 50 MiB.")
    if project_format not in {"sb2", "sb3"}:
        raise TransferError("Unsupported project archive format.")
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            names = [item.filename for item in entries]
            if (len(entries) > MAX_ASSETS + 1 or len(names) != len(set(names))
                    or "project.json" not in names or sum(item.file_size for item in entries) > MAX_TOTAL):
                raise TransferError("Invalid or oversized sb3 archive.")
            for item in entries:
                bound = MAX_JSON if item.filename == "project.json" else MAX_ASSET
                valid_asset = ASSET_NAME.fullmatch(item.filename) if project_format == "sb3" else re.fullmatch(r"[0-9]{1,16}\.[a-z0-9]{1,10}", item.filename)
                if (item.filename != "project.json" and not valid_asset
                        or item.file_size > bound or item.flag_bits & 1
                        or item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                        or (item.external_attr >> 16) & 0o170000 == 0o120000):
                    raise TransferError("Unsafe or unsupported sb3 archive entry.")
            if project_format == "sb3":
                data, required = project_json(archive.read("project.json"))
                required = {name: name for name in required}
            else:
                data, required = sb2_project(archive.read("project.json"))
            assets = {}
            for name, server_name in required.items():
                if name not in names:
                    raise TransferError("The sb3 archive is missing a referenced asset.")
                body = archive.read(name)
                check_asset(server_name, body)
                assets[name] = body
            return data, assets
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, OSError, EOFError):
        raise TransferError("Could not read the sb3 archive.") from None


async def download(client, project):
    raw = (await client.get(project.download_url)).data
    if raw.startswith(b"ScratchV"):
        check_sb1(raw)
        return raw, "sb"
    if "targets" in decode_project(raw):
        data, names = project_json(raw)
        files = {name: name for name in names}
        project_format = "sb3"
    else:
        data, files = sb2_project(raw, assign_ids=True)
        project_format = "sb2"
    total = len(raw)
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project.json", json.dumps(data, ensure_ascii=False))
        cached = {}
        for index, (local, name) in enumerate(files.items()):
            if index:
                await asyncio.sleep(0.1)
            body = cached.get(name)
            if body is None:
                body = (await client.get(f"https://assets.scratch.mit.edu/internalapi/asset/{name}/get/")).data
                cached[name] = body
            check_asset(name, body)
            total += len(body)
            if total > MAX_TOTAL:
                raise TransferError("Project contents exceed 100 MiB.")
            archive.writestr(local, body)
    raw = result.getvalue()
    if len(raw) > MAX_ARCHIVE:
        raise TransferError("The downloaded project archive exceeds 50 MiB.")
    return raw, project_format


async def upload(session, data, assets, project_id, title):
    project = None
    if project_id is not None:
        project = await session.get_project(project_id)
        if (not isinstance(getattr(project.author, "username", None), str)
                or project.author.username.casefold() != session.username.casefold()):
            raise TransferError("Only a project owned by the confirmed account can be overwritten.")
    # Match the Scratch editor: assets first, then project JSON. Never submit JSON
    # if an asset failed. Unreferenced uploaded assets may remain after a failure.
    for index, (name, body) in enumerate(assets.items()):
        if index:
            await asyncio.sleep(0.1)
        response = await session.client.post(f"https://assets.scratch.mit.edu/{name}", data=body)
        if response.json().get("status") != "ok":
            raise TransferError("Scratch did not confirm an asset upload; project data was not submitted.")
    if project is None:
        project = await session.create_project(title=title, project_data=data, is_json=True)
    else:
        await project.edit_project(data, is_json=True)
    # HTTP success alone is not enough for a destructive write.
    saved = await session.get_project(project.id)
    stored = json.loads((await session.client.get(saved.download_url)).data)
    if stored != data:
        raise TransferError("Uploaded project data could not be verified. Check Scratch before retrying.")
    return project.id


async def main():
    action = sys.argv[1] if len(sys.argv) == 2 else None
    mutation = action == "upload"
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict) or action not in {"validate", "download", "upload"}:
            raise TransferError("Invalid project transfer arguments.")
        project_id = payload.get("project_id")
        if ((action == "download" or project_id is not None)
                and (type(project_id) is not int or project_id < 1)):
            raise TransferError("Project ID must be a positive integer.")
        if action in {"validate", "upload"}:
            encoded = payload.get("archive")
            if not isinstance(encoded, str) or len(encoded) > (MAX_ARCHIVE + 2) // 3 * 4:
                raise TransferError("Invalid or oversized sb3 data.")
            project_format = payload.get("format", "sb3") if action == "validate" else "sb3"
            decoded = base64.b64decode(encoded, validate=True)
            if action == "validate" and project_format == "sb":
                check_sb1(decoded)
            else:
                data, assets = read_archive(decoded, project_format)
        if action == "validate":
            print(json.dumps({"action": action, "valid": True}))
            return 0
        session_id = payload.get("session_id")
        if action == "upload":
            expected = payload.get("expected_account")
            title = payload.get("title")
            if (not isinstance(session_id, str) or not session_id
                    or not isinstance(expected, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", expected)):
                raise TransferError("A confirmed active account is required for upload.")
            if title is not None and (not isinstance(title, str) or not title.strip() or len(title) > 100 or project_id is not None):
                raise TransferError("--title (1–100 characters) is available only for new uploads.")
            async with scapi.session_login(session_id) as session:
                if session.username != expected:
                    raise TransferError("The active account changed; upload cancelled.")
                result_id = await upload(session, data, assets, project_id, title)
                print(json.dumps({"action": action, "account": session.username, "project_id": result_id}))
        else:
            if session_id:
                async with scapi.session_login(session_id) as session:
                    project = await session.get_project(project_id)
                    raw, project_format = await download(session.client, project)
            else:
                async with scapi.HTTPClient() as client:
                    project = await scapi.get_project(project_id, _client=client)
                    raw, project_format = await download(client, project)
            title = getattr(project, "title", None)
            print(json.dumps({"action": action, "project_id": project_id, "format": project_format, "title": title if isinstance(title, str) else None, "archive": base64.b64encode(raw).decode("ascii")}))
        return 0
    except TooManyRequests:
        message = "Scratch rate limit reached. Wait before trying again; no automatic retry was made."
    except TransferError as error:
        message = str(error)
    except Exception:
        message = "Could not transfer the Scratch project. Check the file, connection, session, and project permissions."
    if mutation:
        message += " Changes may have partially completed; check Scratch before retrying."
    print(json.dumps({"error": message}))
    return 1


if __name__ == "__main__":
    from runtime import run_with_timeout
    raise SystemExit(asyncio.run(run_with_timeout(main, timeout=120, mutation=len(sys.argv) == 2 and sys.argv[1] == "upload")))
