import asyncio
import json
import sys
from typing import Any

import scapi


def scalar(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if str(value) == "_Special.UNKNOWN":
        return None
    return str(value)


def username(value: Any) -> str | None:
    return scalar(getattr(value, "username", None))


def output_error(message: str) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False))


async def main() -> int:
    if len(sys.argv) != 3:
        output_error("Invalid resource arguments.")
        return 1
    entity, raw_id = sys.argv[1:]
    if entity not in {"project", "studio"}:
        output_error("Unsupported resource type.")
        return 1
    try:
        resource_id = int(raw_id)
    except ValueError:
        output_error("ID must be a positive integer.")
        return 1
    if resource_id < 1:
        output_error("ID must be a positive integer.")
        return 1

    try:
        async with scapi.HTTPClient() as client:
            if entity == "project":
                item = await scapi.get_project(resource_id, _client=client)
                response = {
                    "entity": entity,
                    "id": item.id,
                    "title": scalar(item.title),
                    "author": username(item.author),
                    "remix_parent_id": scalar(item.remix_parent_id),
                    "remix_root_id": scalar(item.remix_root_id),
                    "instructions": scalar(item.instructions),
                    "description": scalar(item.description),
                    "love_count": scalar(item.love_count),
                    "favorite_count": scalar(item.favorite_count),
                    "view_count": scalar(item.view_count),
                    "remix_count": scalar(item.remix_count),
                    "shared": scalar(item.public),
                    "comments_allowed": scalar(getattr(item, "comments_allowed", None)),
                    "url": item.url,
                    "thumbnail_url": item.thumbnail_url,
                }
            else:
                item = await scapi.get_studio(resource_id, _client=client)
                response = {
                    "entity": entity,
                    "id": item.id,
                    "title": scalar(item.title),
                    "description": scalar(item.description),
                    "host_id": scalar(item.host_id),
                    "open_to_all": scalar(item.open_to_all),
                    "comments_allowed": scalar(item.comments_allowed),
                    "follower_count": scalar(item.follower_count),
                    "manager_count": scalar(item.manager_count),
                    "curator_count": scalar(item.curator_count),
                    "project_count": scalar(item.project_count),
                    "url": item.url,
                    "thumbnail_url": item.thumbnail_url,
                }
        print(json.dumps(response, ensure_ascii=False))
    except Exception:
        output_error(f"Could not load the Scratch {entity}.")
        return 1
    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main))
