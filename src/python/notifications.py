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
        "created_at": created_at.isoformat() if created_at else None,
        "title": item_title,
        "url": url,
        "content": string_or_none(getattr(target, "content", None))
        if action == "comment" else None,
    }


def output_error(message: str) -> None:
    print(json.dumps({"error": message}))


async def main() -> int:
    if len(sys.argv) != 3:
        output_error("Invalid notification arguments.")
        return 1

    try:
        payload = json.load(sys.stdin)
        session_id = payload.get("session_id")
        limit = int(sys.argv[1])
        offset = int(sys.argv[2])
    except (json.JSONDecodeError, AttributeError, ValueError):
        output_error("Invalid notification arguments.")
        return 1

    if not isinstance(session_id, str) or not session_id:
        output_error("A valid Scratch session is required.")
        return 1

    if limit < 1 or limit > 40 or offset < 0:
        output_error("Invalid limit or offset.")
        return 1

    try:
        async with scapi.session_login(session_id) as session:
            username = session.username
            notifications = [
                serialize_notification(activity)
                async for activity in session.get_messages(
                    limit=limit,
                    offset=offset,
                )
            ]

        print(json.dumps({
            "username": username,
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
    sys.exit(asyncio.run(main()))
