"""Bounded, public project and studio lists."""
import json
import sys
from datetime import datetime

import scapi
from scapi.utils.error import NotFound, TooManyRequests, Unauthorized


ACTIONS = {"project": {"comments", "remixes", "studios"}, "studio": {"projects", "activity"}}


def string(value):
    return value if isinstance(value, str) else None


def serialize(value, kind):
    if kind == "activity":
        target = getattr(value, "target", None)
        created = getattr(value, "created_at", None)
        return {
            "action": string(getattr(getattr(value, "action", None), "value", None)) or "unknown",
            "actor": string(getattr(getattr(value, "actor", None), "username", None)),
            "target": string(getattr(target, "title", None)) or string(getattr(target, "username", None)),
            "when": created.isoformat() if isinstance(created, datetime) else string(getattr(value, "other", None)),
        }
    if kind == "comments":
        created = getattr(value, "created_at", None)
        return {"id": value.id, "author": string(getattr(getattr(value, "author", None), "username", None)),
                "content": string(getattr(value, "content", None)),
                "created_at": created.isoformat() if isinstance(created, datetime) else None}
    return {"id": value.id, "title": string(getattr(value, "title", None)), "url": string(getattr(value, "url", None))}


def error(message):
    print(json.dumps({"error": message}))


async def main():
    if len(sys.argv) != 6:
        error("Invalid collection arguments.")
        return 1
    entity, action = sys.argv[1:3]
    if action not in ACTIONS.get(entity, set()):
        error("Unsupported collection action.")
        return 1
    try:
        target, limit, offset = map(int, sys.argv[3:])
        if not 1 <= target <= 9007199254740991 or not 1 <= limit <= 40 or not 0 <= offset <= 9007199254740991:
            raise ValueError()
        if action == "activity" and offset != 0:
            raise ValueError()
    except ValueError:
        error("Invalid collection ID, limit, or offset.")
        return 1
    try:
        async with scapi.HTTPClient() as client:
            if entity == "project":
                # Comments and studio membership require the author's username.
                obj = await scapi.get_project(target, _client=client) if action in {"comments", "studios"} else scapi.Project(target, client)
                getter = {"comments": obj.get_comments, "remixes": obj.get_remixes, "studios": obj.get_studios}[action]
                values = getter(limit=limit, offset=offset)
            else:
                obj = scapi.Studio(target, client)
                values = obj.get_activities(limit=limit) if action == "activity" else obj.get_projects(limit=limit, offset=offset)
            items = [serialize(value, action) async for value in values]
        print(json.dumps({"entity": entity, "action": action, "id": target, "items": items}, ensure_ascii=False))
    except NotFound:
        error("Scratch project or studio not found.")
        return 1
    except TooManyRequests:
        error("Scratch rate limit reached. Try again later.")
        return 1
    except Unauthorized:
        error("This collection is not publicly accessible.")
        return 1
    except Exception:
        error("Could not load the Scratch collection. The network may be unavailable.")
        return 1
    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main))
