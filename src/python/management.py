import asyncio
import base64
import binascii
import json
import sys
from typing import Any

import scapi


VISIBILITIES = {"all", "shared", "notshared", "trashed"}
DANGEROUS_ACTIONS = {
    ("project", "create"), ("project", "remix"),
    ("project", "unshare"), ("project", "settings"), ("studio", "settings"),
    ("studio", "create"), ("studio", "accept-invite"),
    ("studio", "follow"), ("studio", "unfollow"),
    ("project", "share"), ("project", "trash"), ("project", "restore"),
    ("project", "edit"), ("project", "thumbnail"), ("project", "report"),
    ("project", "report-comment"), ("user", "report-comment"),
    ("studio", "promote"), ("studio", "delete"), ("studio", "edit"),
    ("studio", "thumbnail"), ("studio", "add-project"),
    ("studio", "remove-project"), ("studio", "leave"),
    ("studio", "invite"), ("studio", "remove-curator"),
    ("studio", "report"), ("project", "delete-comment"),
    ("studio", "report-comment"), ("studio", "delete-comment"), ("user", "delete-comment"),
    ("studio", "transfer"),
    ("user", "report"),
    ("account", "edit-profile"), ("account", "settings"),
    ("account", "clear-messages"), ("account", "become-scratcher"),
    ("account", "change-email"), ("account", "delete-account"),
    ("account", "change-password"),
    ("class", "create"), ("class", "edit"), ("class", "create-studio"),
}


class SettingUnavailable(Exception):
    pass


class SettingNotVerified(Exception):
    pass


async def set_boolean_setting(obj, field, desired, load, change):
    try:
        await load()
    except ValueError as exception:
        raise SettingUnavailable() from exception
    current = getattr(obj, field, None)
    if type(current) is not bool:
        raise SettingUnavailable()
    if current == desired:
        return False
    await change()
    try:
        await load()
    except Exception as exception:
        raise SettingNotVerified() from exception
    if getattr(obj, field, None) is not desired:
        raise SettingNotVerified()
    return True


def scalar(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if str(value) == "_Special.UNKNOWN":
        return None
    return str(value)


def serialize_project(project: Any) -> dict[str, Any]:
    project_id = getattr(project, "id", None)
    return {
        "id": scalar(project_id),
        "title": scalar(getattr(project, "title", None)),
        "shared": scalar(getattr(project, "public", None)),
        "trashed": scalar(getattr(project, "deleted", None)),
        "url": (
            f"https://scratch.mit.edu/projects/{project_id}/"
            if isinstance(project_id, int) and not isinstance(project_id, bool)
            else None
        ),
    }


def serialize_studio(studio: Any) -> dict[str, Any]:
    studio_id = getattr(studio, "id", None)
    return {
        "id": scalar(studio_id),
        "title": scalar(getattr(studio, "title", None)),
        "url": (f"https://scratch.mit.edu/studios/{studio_id}/"
                if isinstance(studio_id, int) and not isinstance(studio_id, bool)
                else None),
    }


def serialize_classroom(classroom: Any) -> dict[str, Any]:
    class_id = getattr(classroom, "id", None)
    return {
        "id": scalar(class_id),
        "title": scalar(getattr(classroom, "title", None)),
        "description": scalar(getattr(classroom, "description", None)),
        "status": scalar(getattr(classroom, "status", None)),
        "closed": scalar(getattr(classroom, "closed", None)),
        "student_count": scalar(getattr(classroom, "student_count", None)),
        "studio_count": scalar(getattr(classroom, "studio_count", None)),
        "url": (f"https://scratch.mit.edu/classrooms/{class_id}"
                if isinstance(class_id, int) and not isinstance(class_id, bool)
                else None),
    }


def serialize_member(user: Any) -> dict[str, Any]:
    return {
        "username": scalar(getattr(user, "username", None)),
        "url": scalar(getattr(user, "url", None)),
    }


def serialize_comment(comment: Any) -> dict[str, Any]:
    author = getattr(comment, "author", None)
    return {
        "id": scalar(getattr(comment, "id", None)),
        "author": scalar(getattr(author, "username", None)),
        "content": scalar(getattr(comment, "content", None)),
    }


def output_error(message: str) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False))


def read_payload() -> dict[str, Any]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, AttributeError):
        return {}
    return payload if isinstance(payload, dict) else {}


async def main() -> int:
    if len(sys.argv) != 3:
        output_error("Invalid management arguments.")
        return 1

    entity, action = sys.argv[1:]
    payload = read_payload()
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        output_error("A valid Scratch session is required.")
        return 1

    expected_account = payload.get("expected_account")
    if expected_account is not None and (
        not isinstance(expected_account, str) or not expected_account
    ):
        output_error("Invalid expected account.")
        return 1
    if (entity, action) in DANGEROUS_ACTIONS and expected_account is None:
        output_error("This action requires confirmed account information.")
        return 1

    if entity == "class" and action in {
        "list", "details", "create", "edit", "students", "studios", "create-studio"
    }:
        page = payload.get("page")
        class_type = payload.get("type")
        if action in {"list", "students", "studios"} and (
            not isinstance(page, int) or isinstance(page, bool) or page < 1
        ):
            output_error("Page must be a positive integer.")
            return 1
        if action == "list" and class_type not in {"all", "closed"}:
            output_error("Invalid class list type.")
            return 1
        class_id = payload.get("class_id")
        if action not in {"list", "create"} and (
            not isinstance(class_id, int) or isinstance(class_id, bool) or class_id < 1
        ):
            output_error("Class ID must be a positive integer.")
            return 1
        title = payload.get("title")
        description = payload.get("description")
        status = payload.get("status")
        opened = payload.get("open")
        if action in {"create", "create-studio"} and (
            not isinstance(title, str) or not title.strip() or len(title.strip()) > 100
        ):
            output_error("A class or studio title is required (1–100 characters).")
            return 1
        if title is not None and (
            not isinstance(title, str) or not title.strip() or len(title.strip()) > 100
        ):
            output_error("Invalid class or studio title.")
            return 1
        if description is not None and (
            not isinstance(description, str) or len(description) > 5000
        ):
            output_error("Invalid class or studio description.")
            return 1
        if status is not None and (not isinstance(status, str) or len(status) > 5000):
            output_error("Invalid class status.")
            return 1
        if opened is not None and not isinstance(opened, bool):
            output_error("Invalid class visibility.")
            return 1
        if action == "edit" and all(
            value is None for value in (title, description, status, opened)
        ):
            output_error("At least one class change is required.")
            return 1
        if action == "create-studio" and (status is not None or opened is not None):
            output_error("Class studio creation accepts only title and description.")
            return 1
        if action == "create" and opened is not None:
            output_error("Class creation does not accept visibility.")
            return 1
        title = title.strip() if isinstance(title, str) else None
    elif entity == "project" and action == "list":
        visibility = payload.get("visibility")
        page = payload.get("page")
        if (
            visibility not in VISIBILITIES
            or not isinstance(page, int)
            or isinstance(page, bool)
            or page < 1
        ):
            output_error("Invalid project list options.")
            return 1
    elif entity == "project" and action == "create":
        title = payload.get("title")
        if title is not None and (not isinstance(title, str) or not title.strip()):
            output_error("Project title must not be empty.")
            return 1
        title = title.strip() if isinstance(title, str) else None
    elif entity == "project" and action in {
        "remix", "share", "unshare", "trash", "restore", "edit", "thumbnail", "report",
        "report-comment", "delete-comment", "settings", "reactions"
    }:
        project_id = payload.get("project_id")
        if (
            not isinstance(project_id, int)
            or isinstance(project_id, bool)
            or project_id < 1
        ):
            output_error("Project ID must be a positive integer.")
            return 1
        comments = payload.get("comments")
        if action == "settings" and not isinstance(comments, bool):
            output_error("A boolean comments setting is required.")
            return 1
        title = payload.get("title")
        if title is not None and (not isinstance(title, str) or not title.strip()):
            output_error("Project title must not be empty.")
            return 1
        title = title.strip() if isinstance(title, str) else None
        instructions = payload.get("instructions")
        description = payload.get("description")
        if instructions is not None and not isinstance(instructions, str):
            output_error("Invalid project instructions.")
            return 1
        if description is not None and not isinstance(description, str):
            output_error("Invalid project credits.")
            return 1
        if action == "edit" and title is None and instructions is None and description is None:
            output_error("At least one project edit is required.")
            return 1
        thumbnail = payload.get("thumbnail")
        if action == "thumbnail":
            if not isinstance(thumbnail, str) or not thumbnail:
                output_error("Thumbnail data is required.")
                return 1
            try:
                thumbnail = base64.b64decode(thumbnail, validate=True)
            except (binascii.Error, ValueError):
                output_error("Invalid thumbnail data.")
                return 1
        category = payload.get("category")
        reason = payload.get("reason")
        if action == "report" and (
            not isinstance(category, int) or isinstance(category, bool)
            or category < 0 or category > 19
            or not isinstance(reason, str) or not reason.strip()
        ):
            output_error("A valid report category and reason are required.")
            return 1
        reason = reason.strip() if isinstance(reason, str) else None
        comment_id = payload.get("comment_id")
        if action in {"report-comment", "delete-comment"} and (
            not isinstance(comment_id, int) or isinstance(comment_id, bool) or comment_id < 1
        ):
            output_error("Comment ID must be a positive integer.")
            return 1
    elif entity == "studio" and action == "create":
        pass
    elif entity == "studio" and action == "list":
        page = payload.get("page")
        studio_type = payload.get("type")
        if not isinstance(page, int) or isinstance(page, bool) or page < 1 \
                or studio_type not in {"all", "owned", "curated"}:
            output_error("Invalid studio list options.")
            return 1
    elif entity == "studio" and action in {
        "accept-invite", "promote", "delete", "edit", "thumbnail", "add-project",
        "remove-project", "follow", "unfollow", "leave", "invite",
        "remove-curator", "report", "comments", "managers", "curators",
        "report-comment", "delete-comment", "transfer", "settings", "role"
    }:
        studio_id = payload.get("studio_id")
        if not isinstance(studio_id, int) or isinstance(studio_id, bool) or studio_id < 1:
            output_error("Studio ID must be a positive integer.")
            return 1
        comments = payload.get("comments")
        open_to_all = payload.get("open_to_all")
        if action == "settings" and ((comments is None) == (open_to_all is None)
                or (comments is not None and not isinstance(comments, bool))
                or (open_to_all is not None and not isinstance(open_to_all, bool))):
            output_error("Exactly one boolean comments or open_to_all setting is required.")
            return 1
        username = payload.get("username")
        if action in {"promote", "invite", "remove-curator", "transfer"} and (
            not isinstance(username, str)
            or not username
            or not all(c.isascii() and (c.isalnum() or c in "_-") for c in username)
        ):
            output_error("Invalid Scratch username.")
            return 1
        title = payload.get("title")
        description = payload.get("description")
        if title is not None and (not isinstance(title, str) or not title.strip()):
            output_error("Studio title must not be empty.")
            return 1
        title = title.strip() if isinstance(title, str) else None
        if description is not None and not isinstance(description, str):
            output_error("Invalid studio description.")
            return 1
        if action == "edit" and title is None and description is None:
            output_error("At least one studio edit is required.")
            return 1
        thumbnail = payload.get("thumbnail")
        if action == "thumbnail":
            if not isinstance(thumbnail, str) or not thumbnail:
                output_error("Thumbnail data is required.")
                return 1
            try:
                thumbnail = base64.b64decode(thumbnail, validate=True)
            except (binascii.Error, ValueError):
                output_error("Invalid thumbnail data.")
                return 1
        project_id = payload.get("project_id")
        if action in {"add-project", "remove-project"} and (
            not isinstance(project_id, int) or isinstance(project_id, bool) or project_id < 1
        ):
            output_error("Project ID must be a positive integer.")
            return 1
        comment_id = payload.get("comment_id")
        if action == "delete-comment" and (
            not isinstance(comment_id, int) or isinstance(comment_id, bool) or comment_id < 1
        ):
            output_error("Comment ID must be a positive integer.")
            return 1
        report_type = payload.get("type")
        if action == "report" and report_type not in {"title", "description", "thumbnail"}:
            output_error("Invalid studio report type.")
            return 1
        if action in {"report-comment", "delete-comment"}:
            comment_id = payload.get("comment_id")
            if not isinstance(comment_id, int) or isinstance(comment_id, bool) or comment_id < 1:
                output_error("Comment ID must be a positive integer.")
                return 1
        if action == "transfer":
            password = payload.get("password")
            if not isinstance(password, str) or not password:
                output_error("A password is required to transfer studio ownership.")
                return 1
    elif entity == "user" and action in {"report-comment", "delete-comment", "report"}:
        username = payload.get("username")
        comment_id = payload.get("comment_id")
        if (
            not isinstance(username, str) or not username
            or not all(c.isascii() and (c.isalnum() or c in "_-") for c in username)
        ):
            output_error("A valid username is required.")
            return 1
        if action in {"report-comment", "delete-comment"} and (
            not isinstance(comment_id, int) or isinstance(comment_id, bool) or comment_id < 1
        ):
            output_error("A valid comment ID is required.")
            return 1
        report_type = payload.get("type")
        if action == "report" and report_type not in {
            "username", "icon", "description", "working_on"
        }:
            output_error("Invalid user report type.")
            return 1
    elif entity == "account" and action == "identify":
        pass
    elif entity == "account" and action == "scratcher-status":
        pass
    elif entity == "account" and action in {"clear-messages", "become-scratcher"}:
        pass
    elif entity == "account" and action == "change-email":
        email = payload.get("email")
        password = payload.get("password")
        if (
            not isinstance(email, str) or not email.strip()
            or "@" not in email or len(email) > 254
            or not isinstance(password, str) or not password
        ):
            output_error("A valid email address and password are required.")
            return 1
        email = email.strip()
    elif entity == "account" and action == "change-password":
        old_password = payload.get("old_password")
        new_password = payload.get("new_password")
        if (not isinstance(old_password, str) or not old_password
                or not isinstance(new_password, str)
                or len(new_password) < 6 or len(new_password) > 128
                or new_password == old_password):
            output_error("A current password and a different new password are required.")
            return 1
    elif entity == "account" and action == "delete-account":
        password = payload.get("password")
        delete_projects = payload.get("delete_projects")
        if not isinstance(password, str) or not password or not isinstance(delete_projects, bool):
            output_error("A password and project deletion choice are required.")
            return 1
    elif entity == "account" and action == "edit-profile":
        bio = payload.get("bio")
        status = payload.get("status")
        featured_project_id = payload.get("featured_project_id")
        if bio is not None and not isinstance(bio, str):
            output_error("Invalid About me value.")
            return 1
        if status is not None and not isinstance(status, str):
            output_error("Invalid What I'm working on value.")
            return 1
        if featured_project_id is not None and (
            not isinstance(featured_project_id, int)
            or isinstance(featured_project_id, bool)
            or featured_project_id < 1
        ):
            output_error("Featured project ID must be a positive integer.")
            return 1
        if bio is None and status is None and featured_project_id is None:
            output_error("At least one profile change is required.")
            return 1
    elif entity == "account" and action == "settings":
        country = payload.get("country")
        state = payload.get("state")
        cat_ears = payload.get("cat_ears")
        comments = payload.get("comments")
        if comments is not None and (not isinstance(comments, bool)
                or country is not None or state is not None or cat_ears is not None):
            output_error("Use a boolean comments setting without other account settings.")
            return 1
        if country is not None and (not isinstance(country, str) or not country.strip()):
            output_error("Country must not be empty.")
            return 1
        if state is not None and (not isinstance(state, str) or not state.strip()):
            output_error("State must not be empty.")
            return 1
        if cat_ears is not None and not isinstance(cat_ears, bool):
            output_error("Invalid cat ears setting.")
            return 1
        if country is None and state is None and cat_ears is None and comments is None:
            output_error("At least one account setting is required.")
            return 1
        country = country.strip() if isinstance(country, str) else None
        state = state.strip() if isinstance(state, str) else None
    else:
        output_error("Unsupported management action.")
        return 1

    try:
        async with scapi.session_login(session_id) as session:
            if expected_account is not None and session.username != expected_account:
                output_error("The active Scratch account changed before the action could run.")
                return 1
            if entity == "class" and action == "list":
                classrooms = [
                    serialize_classroom(item)
                    async for item in session.get_mystuff_classes(
                        start_page=page, end_page=page, type=class_type,
                    )
                ]
                response = {
                    "account": session.username, "entity": entity, "action": action,
                    "type": class_type, "page": page, "classrooms": classrooms,
                }
            elif entity == "class" and action == "create":
                classroom = await session.create_class(title, description, status)
                response = {
                    "account": session.username, "entity": entity, "action": action,
                    "classroom": serialize_classroom(classroom),
                }
            elif entity == "class":
                classroom = await session.get_mystuff_class(class_id)
                response = {
                    "account": session.username, "entity": entity, "action": action,
                    "class_id": class_id,
                }
                if action == "details":
                    response["classroom"] = serialize_classroom(classroom)
                elif action == "students":
                    response["page"] = page
                    response["items"] = [
                        serialize_member(item)
                        async for item in classroom.get_students(
                            start_page=page, end_page=page, use_api=True,
                        )
                    ]
                elif action == "studios":
                    response["page"] = page
                    response["items"] = [
                        serialize_studio(item)
                        async for item in classroom.get_class_studios(
                            start_page=page, end_page=page, use_api=True,
                        )
                    ]
                elif action == "edit":
                    await classroom.edit(
                        title=title, description=description, status=status, open=opened,
                    )
                    if opened is not None:
                        classroom.closed = not opened
                    response["classroom"] = serialize_classroom(classroom)
                else:
                    studio = await classroom.create_class_studio(title, description)
                    response["studio"] = serialize_studio(studio)
            elif entity == "project" and action == "list":
                projects = [
                    serialize_project(project)
                    async for project in session.get_mystuff_projects(
                        start_page=page,
                        end_page=page,
                        type=visibility,
                    )
                ]
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "visibility": visibility,
                    "page": page,
                    "projects": projects,
                }
            elif entity == "project" and action == "create":
                project = await session.create_project(title=title)
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "project": serialize_project(project),
                }
            elif entity == "project" and action == "remix":
                source = await session.get_project(project_id)
                project_data = (await session.client.get(source.download_url)).data
                if not project_data:
                    output_error("The source project data was empty; no remix was created.")
                    return 1
                project = await session.create_project(
                    title=title,
                    project_data=project_data,
                    remix_id=project_id,
                    is_json=True,
                )
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "source_project_id": project_id,
                    "project": serialize_project(project),
                }
            elif entity == "project":
                project = scapi.Project(project_id, session)
                if action == "share":
                    await project.share()
                elif action == "unshare":
                    await project.unshare()
                elif action == "settings":
                    # Scapi 3.2.4 uses comment_allowed, but scratch-www sends
                    # comments_allowed. Verify the returned state, not just HTTP 200.
                    result = await session.client.put(
                        f"https://api.scratch.mit.edu/projects/{project_id}",
                        json={"comments_allowed": comments},
                    )
                    try:
                        data = result.json()
                    except ValueError as exception:
                        raise SettingNotVerified() from exception
                    if not isinstance(data, dict) or type(data.get("id")) is not int or data.get("id") != project_id or data.get("comments_allowed") is not comments:
                        raise SettingNotVerified()
                elif action == "reactions":
                    loved = await project.is_loved()
                    if type(loved) is not bool:
                        output_error("Received an invalid Scratch reaction response.")
                        return 1
                    favorited = await project.is_favorited()
                    if type(favorited) is not bool:
                        output_error("Received an invalid Scratch reaction response.")
                        return 1
                elif action == "trash":
                    await project.old_edit(trash=True)
                elif action == "restore":
                    await project.old_edit(trash=False)
                elif action == "edit":
                    await project.edit(
                        title=title, instructions=instructions, description=description
                    )
                elif action == "thumbnail":
                    await project.set_thumbnail(thumbnail)
                elif action == "report-comment":
                    comment = scapi.Comment(comment_id, session, place=project)
                    await comment.report()
                elif action == "delete-comment":
                    comment = scapi.Comment(comment_id, session, place=project)
                    await comment.delete()
                else:
                    moderation_status = await project.report(category, reason)
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "project_id": project_id,
                }
                if action == "report":
                    response["moderation_status"] = moderation_status
                if action == "report-comment":
                    response["comment_id"] = comment_id
                if action == "delete-comment":
                    response["comment_id"] = comment_id
                if action == "reactions":
                    response.update(loved=loved, favorited=favorited)
                if action == "settings":
                    response["comments"] = comments
            elif entity == "studio" and action == "list":
                studios = [
                    serialize_studio(item)
                    async for item in session.get_mystuff_studios(
                        start_page=page, end_page=page, type=studio_type,
                    )
                ]
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "type": studio_type,
                    "page": page,
                    "studios": studios,
                }
            elif entity == "studio" and action == "create":
                studio = await session.create_studio()
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "studio_id": getattr(studio, "id", None),
                }
            elif entity == "studio":
                studio = scapi.Studio(studio_id, session)
                if action == "accept-invite":
                    await studio.accept_invite()
                elif action == "role":
                    status = await studio.get_my_role()
                    role = {key: getattr(status, key, None) for key in ("manager", "curator", "invited", "following")}
                    if any(type(value) is not bool for value in role.values()):
                        output_error("Received an invalid Scratch studio role response.")
                        return 1
                elif action == "settings":
                    field = "comments_allowed" if comments is not None else "open_to_all"
                    desired = comments if comments is not None else open_to_all
                    change = studio.toggle_comment if comments is not None else (studio.open_project if desired else studio.close_project)
                    changed = await set_boolean_setting(studio, field, desired, studio.update, change)
                elif action == "promote":
                    await studio.promote(username)
                elif action == "delete":
                    await studio.edit(trash=True)
                elif action == "edit":
                    await studio.edit(title=title, description=description)
                elif action == "thumbnail":
                    await studio.set_thumbnail(thumbnail)
                elif action == "add-project":
                    await studio.add_project(project_id)
                elif action == "remove-project":
                    await studio.remove_project(project_id)
                elif action == "follow":
                    await studio.follow()
                elif action == "unfollow":
                    await studio.unfollow()
                elif action == "leave":
                    await studio.leave()
                elif action == "invite":
                    await studio.invite(username)
                elif action == "remove-curator":
                    await studio.remove_curator(username)
                elif action == "transfer":
                    await studio.transfer_ownership(username, password)
                elif action == "report":
                    moderation_status = await studio.report(report_type)
                elif action == "report-comment":
                    comment = scapi.Comment(comment_id, session, place=studio)
                    await comment.report()
                elif action == "delete-comment":
                    comment = scapi.Comment(comment_id, session, place=studio)
                    await comment.delete()
                elif action in {"comments", "managers", "curators"}:
                    getter = {
                        "comments": studio.get_comments,
                        "managers": studio.get_managers,
                        "curators": studio.get_curators,
                    }[action]
                    items = [
                        serialize_comment(item) if action == "comments" else serialize_member(item)
                        async for item in getter(limit=40, offset=0)
                    ]
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "studio_id": studio_id,
                }
                if action in {"promote", "transfer"}:
                    response["username"] = username
                if action == "add-project":
                    response["project_id"] = project_id
                if action == "remove-project":
                    response["project_id"] = project_id
                if action == "report":
                    response["moderation_status"] = moderation_status
                if action in {"comments", "managers", "curators"}:
                    response["items"] = items
                if action in {"report-comment", "delete-comment"}:
                    response["comment_id"] = comment_id
                if action == "role":
                    response["role"] = role
                if action == "settings":
                    response.update(changed=changed, **{"comments" if comments is not None else "open_to_all": desired})
            elif entity == "user":
                user = scapi.User(username, session, is_real=True)
                if action == "report-comment":
                    comment = scapi.Comment(comment_id, session, place=user)
                    await comment.report()
                elif action == "delete-comment":
                    comment = scapi.Comment(comment_id, session, place=user)
                    await comment.delete(is_old=True)
                else:
                    await user.report(report_type)
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "target": username,
                }
                if action in {"report-comment", "delete-comment"}:
                    response["comment_id"] = comment_id
                if action == "report":
                    response["report_type"] = report_type
            elif action == "identify":
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
            elif action == "scratcher-status":
                invite_status = await session.get_invite_status()
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                    "invite_status": invite_status,
                }
            elif action == "edit-profile":
                await session.user.edit(
                    bio=bio,
                    status=status,
                    featured_project_id=featured_project_id,
                )
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
            elif action == "clear-messages":
                await session.clear_message()
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
            elif action == "become-scratcher":
                await session.become_scratcher()
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
            elif action == "change-email":
                await session.change_email(email, password)
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
            elif action == "change-password":
                await session.change_password(old_password, new_password)
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
            elif action == "delete-account":
                await session.delete_account(password, delete_projects)
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
            else:
                if comments is not None:
                    changed = await set_boolean_setting(session.user, "comments_allowed", comments,
                                                        session.user.load_website, session.user.toggle_comment)
                else:
                    await session.change_account_settings(
                        country=country, state=state, avatar_badge_type=cat_ears,
                    )
                response = {
                    "account": session.username,
                    "entity": entity,
                    "action": action,
                }
                if comments is not None:
                    response.update(comments=comments, changed=changed)
        print(json.dumps(response, ensure_ascii=False))
    except SettingUnavailable:
        output_error("Could not determine the current setting. No change was requested.")
        return 1
    except SettingNotVerified:
        output_error("The setting change could not be verified. Check its state on Scratch before retrying.")
        return 1
    except ValueError:
        output_error("Stored Scratch session is invalid. Run `scc login` again.")
        return 1
    except Exception:
        output_error("Scratch could not complete the requested action.")
        return 1

    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main, mutation=len(sys.argv) > 2 and sys.argv[2] not in {"identify", "list", "details", "students", "studios", "comments", "managers", "curators", "scratcher-status", "reactions", "role"}))
