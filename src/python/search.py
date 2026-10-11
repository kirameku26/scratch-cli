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


def output_error(message: str, error_type: str | None = None) -> None:
    payload = {"error": message}

    if error_type:
        payload["type"] = error_type

    print(json.dumps(payload, ensure_ascii=False))


async def main() -> int:
    if len(sys.argv) != 5:
        output_error("Invalid project search arguments.")
        return 1

    resource_type, query, raw_limit, raw_offset = sys.argv[1:]

    if resource_type != "project":
        output_error(f"Unsupported search type: {resource_type}")
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
            projects = [
                serialize_project(project)
                async for project in scapi.search_projects(
                    client,
                    query,
                    limit=limit,
                    offset=offset,
                )
            ]

        print(json.dumps({
            "type": "project",
            "query": query,
            "results": projects,
        }, ensure_ascii=False))

    except Exception as error:
        output_error(str(error), type(error).__name__)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
