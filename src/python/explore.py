import asyncio
import json
import sys
from typing import Any

import scapi


def json_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if str(value) == "_Special.UNKNOWN":
        return None

    return str(value)


def serialize_project(project: Any) -> dict[str, Any]:
    author = getattr(project, "author", None)

    return {
        "id": json_value(getattr(project, "id", None)),
        "title": json_value(getattr(project, "title", None)),
        "author": json_value(getattr(author, "username", None)),
        "url": json_value(getattr(project, "url", None)),
    }


def serialize_studio(studio: Any) -> dict[str, Any]:
    return {
        "id": json_value(getattr(studio, "id", None)),
        "title": json_value(getattr(studio, "title", None)),
        "host_id": json_value(getattr(studio, "host_id", None)),
        "url": json_value(getattr(studio, "url", None)),
    }


def output_error(message: str) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False))


async def main() -> int:
    if len(sys.argv) != 7:
        output_error("Invalid explore arguments.")
        return 1

    resource_type, mode, category, raw_limit, raw_offset, language = sys.argv[1:]

    if resource_type not in ("project", "studio"):
        output_error("Explore type must be project or studio.")
        return 1

    if mode not in ("trending", "popular"):
        output_error("Mode must be trending or popular.")
        return 1

    if category not in ("all", "animations", "art", "games", "music"):
        output_error("Category must be all, animations, art, games, or music.")
        return 1

    if resource_type == "studio" and category != "all":
        output_error("Category is available only for projects.")
        return 1
    if not language or len(language) > 20 or not all(
        character.isascii() and (character.isalnum() or character == "-")
        for character in language
    ):
        output_error("Invalid language code.")
        return 1

    try:
        limit = int(raw_limit)
        offset = int(raw_offset)
    except ValueError:
        output_error("Limit and offset must be integers.")
        return 1

    if limit < 1 or limit > 40 or offset < 0:
        output_error("Invalid limit or offset.")
        return 1

    try:
        async with scapi.HTTPClient() as client:
            if resource_type == "project":
                results = [
                    serialize_project(project)
                    async for project in scapi.explore_projects(
                        client,
                        query="*" if category == "all" else category,
                        mode=mode,
                        language=language,
                        limit=limit,
                        offset=offset,
                    )
                ]
            else:
                results = [
                    serialize_studio(studio)
                    async for studio in scapi.explore_studios(
                        client, mode=mode, language=language,
                        limit=limit, offset=offset
                    )
                ]

        print(json.dumps({
            "type": resource_type,
            "mode": mode,
            "results": results,
        }, ensure_ascii=False))
    except Exception as error:
        output_error(str(error) or "Failed to fetch Scratch Explore results.")
        return 1

    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main))
