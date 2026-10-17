import asyncio
import json
import re
import sys
from typing import Any

import scapi
from scapi.utils.error import CommentFailure


PROJECT_ACTIONS = {"love", "unlove", "favorite", "unfavorite", "comment", "reply"}
USER_ACTIONS = {"follow", "unfollow", "comment", "reply"}
STUDIO_ACTIONS = {"follow", "unfollow", "comment", "reply"}
USERNAME = re.compile(r"^[A-Za-z0-9_-]+$")


def output_error(message: str) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False))


def read_payload() -> tuple[str | None, str | None, int | None, str | None]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, AttributeError):
        return None, None, None, None
    if not isinstance(payload, dict):
        return None, None, None, None
    session_id = payload.get("session_id")
    text = payload.get("text")
    comment_id = payload.get("comment_id")
    expected_account = payload.get("expected_account")
    return (
        session_id if isinstance(session_id, str) and session_id else None,
        text if isinstance(text, str) else None,
        comment_id if isinstance(comment_id, int) and not isinstance(comment_id, bool) else None,
        expected_account if isinstance(expected_account, str) and expected_account else None,
    )


async def project_action(
    session: Any, action: str, project_id: int, text: str | None, comment_id: int | None
):
    project = scapi.Project(project_id, session)
    result: dict[str, Any] = {}
    if action == "love":
        result["changed"] = await project.add_love()
    elif action == "unlove":
        result["changed"] = await project.remove_love()
    elif action == "favorite":
        result["changed"] = await project.add_favorite()
    elif action == "unfavorite":
        result["changed"] = await project.remove_favorite()
    elif action == "comment":
        comment = await project.post_comment(text)
        result["comment_id"] = getattr(comment, "id", None)
    else:
        comment = await project.post_comment(text, parent=comment_id)
        result["comment_id"] = getattr(comment, "id", None)
    return result


async def user_action(
    session: Any, action: str, username: str, text: str | None, comment_id: int | None
):
    user = scapi.User(username, session, is_real=True)
    result: dict[str, Any] = {}
    if action == "follow":
        await user.follow()
    elif action == "unfollow":
        await user.unfollow()
    elif action == "comment":
        comment = await user.post_comment(text)
        result["comment_id"] = getattr(comment, "id", None)
    else:
        comment = await user.post_comment(text, parent=comment_id)
        result["comment_id"] = getattr(comment, "id", None)
    return result


async def studio_action(
    session: Any, action: str, studio_id: int, text: str | None, comment_id: int | None
):
    studio = scapi.Studio(studio_id, session)
    result: dict[str, Any] = {}
    if action == "follow":
        await studio.follow()
    elif action == "unfollow":
        await studio.unfollow()
    elif action == "comment":
        comment = await studio.post_comment(text)
        result["comment_id"] = getattr(comment, "id", None)
    else:
        comment = await studio.post_comment(text, parent=comment_id)
        result["comment_id"] = getattr(comment, "id", None)
    return result


async def main() -> int:
    if len(sys.argv) != 4:
        output_error("Invalid interaction arguments.")
        return 1

    entity, action, target = sys.argv[1:]
    if entity == "project":
        if action not in PROJECT_ACTIONS:
            output_error("Invalid project action.")
            return 1
        try:
            parsed_target: int | str = int(target)
        except ValueError:
            output_error("Project ID must be an integer.")
            return 1
        if parsed_target < 1:
            output_error("Project ID must be a positive integer.")
            return 1
    elif entity == "user":
        if action not in USER_ACTIONS:
            output_error("Invalid user action.")
            return 1
        parsed_target = target
        if not USERNAME.fullmatch(parsed_target):
            output_error("Invalid Scratch username.")
            return 1
    elif entity == "studio":
        if action not in STUDIO_ACTIONS:
            output_error("Invalid studio action.")
            return 1
        try:
            parsed_target = int(target)
        except ValueError:
            output_error("Studio ID must be an integer.")
            return 1
        if parsed_target < 1:
            output_error("Studio ID must be a positive integer.")
    else:
        output_error("Invalid interaction target type.")
        return 1

    session_id, text, comment_id, expected_account = read_payload()
    if not session_id:
        output_error("A valid Scratch session is required.")
        return 1
    if expected_account is None:
        output_error("This action requires confirmed account information.")
        return 1
    if action in {"comment", "reply"} and not text:
        output_error("Comment text is required.")
        return 1
    if action in {"comment", "reply"}:
        text = text.strip()
        if not text:
            output_error("Comment text is required.")
            return 1
        if len(text) > 500:
            output_error("Comment text must be 500 characters or fewer.")
            return 1
    if action == "reply" and (comment_id is None or comment_id < 1):
        output_error("Reply comment ID must be a positive integer.")
        return 1

    try:
        async with scapi.session_login(session_id) as session:
            if session.username != expected_account:
                output_error("The active Scratch account changed before the action could run.")
                return 1
            if entity == "project":
                details = await project_action(
                    session, action, parsed_target, text, comment_id
                )
            elif entity == "user":
                details = await user_action(session, action, parsed_target, text, comment_id)
            else:
                details = await studio_action(session, action, parsed_target, text, comment_id)
            response = {
                "account": session.username,
                "entity": entity,
                "action": action,
                "target": parsed_target,
                **details,
            }
        print(json.dumps(response, ensure_ascii=False))
    except CommentFailure:
        output_error("Comment was rejected by Scratch.")
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
    sys.exit(run(main, mutation=True))
