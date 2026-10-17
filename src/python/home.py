import asyncio
import json
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from math import ceil
from typing import Any

import scapi
from scapi.utils.error import Forbidden, NotFound, ProcessingError, ServerError, TooManyRequests, Unauthorized


SECTIONS = {
    "whats-happening",
    "news",
    "featured-projects",
    "featured-studios",
    "design-studio",
    "following-loves",
    "most-loved",
    "most-remixed",
    "newest-projects",
    "following-projects",
    "following-studio-projects",
    "viewed-projects",
}
PRIVATE_SECTIONS = {
    "whats-happening", "following-loves", "following-projects",
    "following-studio-projects", "viewed-projects",
}


class InvalidHomeResponse(Exception):
    pass


class InvalidStoredSession(Exception):
    pass


def rate_limit_message(exception):
    response = getattr(getattr(exception, "response", None), "_response", None)
    retry_after = getattr(response, "headers", {}).get("Retry-After", "")
    seconds = None
    if isinstance(retry_after, str):
        if retry_after.isascii() and retry_after.isdecimal() and len(retry_after) <= 10:
            seconds = int(retry_after)
        else:
            try:
                deadline = parsedate_to_datetime(retry_after)
                seconds = max(0, ceil((deadline - datetime.now(timezone.utc)).total_seconds()))
            except (ValueError, TypeError, OverflowError):
                pass
    return (f"Scratch rate limit reached. Try again after {seconds} seconds." if seconds is not None
            else "Scratch rate limit reached. Try again later.")


def scalar(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if str(value) == "_Special.UNKNOWN":
        return None
    return str(value)


def serialize_project(project: Any) -> dict[str, Any]:
    project_id = getattr(project, "id", None)
    author = getattr(project, "author", None)
    return {
        "id": scalar(project_id),
        "title": scalar(getattr(project, "title", None)),
        "author": scalar(getattr(author, "username", None)),
        "love_count": scalar(getattr(project, "love_count", None)),
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
        "url": (
            f"https://scratch.mit.edu/studios/{studio_id}/"
            if isinstance(studio_id, int) and not isinstance(studio_id, bool)
            else None
        ),
    }


def serialize_news(news: Any) -> dict[str, Any]:
    created_at = getattr(news, "created_at", None)
    news_id = scalar(getattr(news, "id", None))
    return {
        # News IDs are display-only and may exceed JavaScript's safe integer range.
        "id": str(news_id) if news_id is not None else None,
        "headline": scalar(getattr(news, "headline", None)),
        "copy": scalar(getattr(news, "copy", None)),
        "url": scalar(getattr(news, "url", None)),
        "image": scalar(getattr(news, "image", None)),
        "created_at": (
            created_at.isoformat() if hasattr(created_at, "isoformat") else None
        ),
    }


def serialize_activity(activity: Any) -> dict[str, Any]:
    target = getattr(activity, "target", None) or getattr(activity, "place", None)
    actor = getattr(activity, "actor", None)
    created_at = getattr(activity, "created_at", None)
    return {
        "action": scalar(getattr(getattr(activity, "action", None), "value", None))
        or "unknown",
        "actor": scalar(getattr(actor, "username", None)),
        "target_title": scalar(getattr(target, "title", None))
        or scalar(getattr(target, "username", None)),
        "target_url": scalar(getattr(target, "url", None)),
        "created_at": (
            created_at.isoformat() if hasattr(created_at, "isoformat") else None
        ),
    }


def output_error(message: str) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False))


def read_session_id() -> str | None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, AttributeError):
        return None
    session_id = payload.get("session_id") if isinstance(payload, dict) else None
    return session_id if isinstance(session_id, str) and session_id else None


async def load_public(section: str, limit: int, offset: int) -> dict[str, Any]:
    async with scapi.HTTPClient() as client:
        if section == "news":
            items = [
                serialize_news(news)
                async for news in scapi.get_news(
                    client, limit=limit, offset=offset
                )
            ]
            return {"section": section, "items": items}

        featured = await scapi.get_community_featured(client)

    key = {
        "featured-projects": "featured_projects",
        "featured-studios": "featured_studios",
        "design-studio": "design_studio_projects",
        "most-loved": "most_loved_projects",
        "most-remixed": "most_remixed_projects",
        "newest-projects": "newest_projects",
    }[section]
    values = featured[key][offset:offset + limit]
    serializer = serialize_studio if section == "featured-studios" else serialize_project
    response = {
        "section": section,
        "items": [serializer(item) for item in values],
    }

    if section == "design-studio":
        studio = featured.get("design_studio")
        response["studio"] = serialize_studio(studio) if studio else None

    return response


async def load_private(
    section: str, session_id: str, limit: int, offset: int
) -> dict[str, Any]:
    authenticated = False
    try:
        async with scapi.session_login(session_id) as session:
            authenticated = True
            if section == "whats-happening":
                items = [
                    serialize_activity(activity)
                    async for activity in session.get_feed(
                        limit=limit, offset=offset
                    )
                ]
            else:
                method = {
                    "following-loves": session.get_followings_loves,
                    "following-projects": session.get_followings_project,
                    "following-studio-projects": session.get_followings_studios_project,
                    "viewed-projects": session.get_viewed_projects,
                }[section]
                items = [
                    serialize_project(project)
                    async for project in method(limit=limit, offset=offset)
                ]
            return {"section": section, "username": session.username, "items": items}
    except ValueError as exception:
        # Feed conversion can also raise ValueError; it does not invalidate login.
        if not authenticated:
            raise InvalidStoredSession() from exception
        raise InvalidHomeResponse() from exception
    except (KeyError, TypeError, AttributeError) as exception:
        raise InvalidHomeResponse() from exception


async def main() -> int:
    if len(sys.argv) != 4:
        output_error("Invalid home arguments.")
        return 1

    section, raw_limit, raw_offset = sys.argv[1:]

    if section not in SECTIONS:
        output_error("Invalid home section.")
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

    session_id = read_session_id()
    if section in PRIVATE_SECTIONS and not session_id:
        output_error("A valid Scratch session is required.")
        return 1

    try:
        if section in PRIVATE_SECTIONS:
            response = await load_private(section, session_id, limit, offset)
        else:
            response = await load_public(section, limit, offset)
        print(json.dumps(response, ensure_ascii=False))
    except (InvalidStoredSession, Unauthorized):
        output_error("Stored Scratch session is invalid. Run `scc login` again." if section in PRIVATE_SECTIONS
                     else "Scratch requires authentication for this home section.")
        return 1
    except TooManyRequests as exception:
        output_error(rate_limit_message(exception))
        return 1
    except ProcessingError as exception:
        output_error("Scratch home request timed out. Try again later." if isinstance(exception.exception, (TimeoutError, asyncio.TimeoutError))
                     else "Could not reach Scratch. Check your internet connection and try again.")
        return 1
    except (TimeoutError, asyncio.TimeoutError):
        output_error("Scratch home request timed out. Try again later.")
        return 1
    except Forbidden:
        output_error("Scratch denied access to this home section.")
        return 1
    except NotFound:
        output_error("The Scratch home section was not found.")
        return 1
    except ServerError:
        output_error("Scratch is temporarily unavailable. Try again later.")
        return 1
    except (InvalidHomeResponse, ValueError, KeyError, TypeError, AttributeError):
        output_error("Received an invalid Scratch home response.")
        return 1
    except Exception:
        output_error("Could not load the Scratch home section.")
        return 1

    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main))
