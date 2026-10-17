import asyncio
import json
import sys
from typing import Any

import scapi


def string_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def notification_object(activity: Any) -> Any:
    action = getattr(getattr(activity, "action", None), "value", "unknown")

    if action == "project_remix":
        return getattr(activity, "target", None)

    return getattr(activity, "place", None) or getattr(activity, "target", None)


def serialize_notification(activity: Any) -> dict[str, Any]:
    action = string_or_none(
        getattr(getattr(activity, "action", None), "value", None)
    ) or "unknown"
    actor = getattr(activity, "actor", None)
    item = notification_object(activity)
    target = getattr(activity, "target", None)
    created_at = getattr(activity, "created_at", None)
    item_title = (
        string_or_none(getattr(item, "title", None))
        or string_or_none(getattr(item, "name", None))
        or string_or_none(getattr(item, "username", None))
    )
    url = string_or_none(getattr(item, "url", None))

    if url is None and action == "forum_post":
        topic_id = getattr(item, "id", None)
        if isinstance(topic_id, int):
            url = f"https://scratch.mit.edu/discuss/topic/{topic_id}/"

    return {
        "id": getattr(activity, "id", None),
        "action": action,
        "actor": string_or_none(getattr(actor, "username", None)),
        "created_at": created_at.isoformat()
        if hasattr(created_at, "isoformat") else None,
        "title": item_title,
        "url": url,
        "content": string_or_none(getattr(target, "content", None))
        if action == "comment" else None,
    }


def output_error(message: str) -> None:
    print(json.dumps({"error": message}))


async def main() -> int:
    if len(sys.argv) != 4:
        output_error("Invalid notification arguments.")
        return 1

    try:
        payload = json.load(sys.stdin)
        session_id = payload.get("session_id")
        page = payload.get("page", 1)
        action, raw_limit, raw_offset = sys.argv[1:]
        limit = int(raw_limit) if raw_limit else None
        offset = int(raw_offset)
    except (json.JSONDecodeError, AttributeError, ValueError):
        output_error("Invalid notification arguments.")
        return 1

    if not isinstance(session_id, str) or not session_id:
        output_error("A valid Scratch session is required.")
        return 1

    if action not in {"list", "count"}:
        output_error("Invalid notification action.")
        return 1
    if (limit is not None and (limit < 1 or limit > 40)) or offset < 0 or type(page) is not int or page < 1 or page > 9007199254740991:
        output_error("Invalid limit or offset.")
        return 1

    try:
        async with scapi.session_login(session_id) as session:
            username = session.username
            unread_count = await session.get_message_count()
            effective_limit = min(unread_count, 40) if limit is None else limit
            offset += (page - 1) * effective_limit
            if offset > 9007199254740991:
                output_error("Page and offset exceed the safe pagination range.")
                return 1
            notifications = [] if action == "count" or effective_limit == 0 else [
                serialize_notification(activity)
                async for activity in session.get_messages(
                    limit=effective_limit, offset=offset,
                )
            ]

        print(json.dumps({
            "username": username,
            "action": action,
            "unread_count": unread_count,
            "notifications": notifications,
        }, ensure_ascii=False))
    except ValueError:
        output_error("Stored Scratch session is invalid. Run `scc login` again.")
        return 1
    except Exception:
        output_error("Could not load Scratch notifications.")
        return 1

    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main))
