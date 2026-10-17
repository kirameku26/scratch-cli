import asyncio
import datetime
import json
import re
import sys
from urllib.parse import quote, urljoin, urlsplit

from bs4 import BeautifulSoup
import scapi
from scapi.utils.error import NotFound, TooManyRequests, Unauthorized
from following import self_following_status


SECTIONS = (
    "about", "projects", "favorites", "studios", "followed-studios",
    "following", "followers", "comments",
)
STUDIO_PATH = re.compile(r"/studios/(\d+)/?")
USER_IMAGE_PATH = re.compile(r"/get_image/user/(\d+)_")
API_BASE = "https://api.scratch.mit.edu/users"


class InvalidProfileResponse(Exception):
    pass


def text_or_none(value):
    return value if isinstance(value, str) else None


def serialize_comment(comment):
    created_at = getattr(comment, "created_at", None)
    return {
        "id": comment.id,
        "author": text_or_none(getattr(getattr(comment, "author", None), "username", None)),
        "content": text_or_none(getattr(comment, "content", None)),
        "created_at": created_at.isoformat()
        if isinstance(created_at, datetime.datetime) else None,
    }


def parse_followed_studios(html):
    soup = BeautifulSoup(html, "html.parser")
    studios = []
    by_id = {}

    for anchor in soup.select("a[href]"):
        url = urljoin("https://scratch.mit.edu/", anchor["href"])
        parsed = urlsplit(url)
        match = STUDIO_PATH.fullmatch(parsed.path)
        if parsed.netloc != "scratch.mit.edu" or not match:
            continue

        studio_id = int(match.group(1))
        image = anchor.find("img")
        title = (
            anchor.get_text(" ", strip=True)
            or text_or_none(anchor.get("title"))
            or text_or_none(anchor.get("data-title"))
            or (text_or_none(image.get("alt")) if image else None)
        )

        if studio_id in by_id:
            if title and not by_id[studio_id]["title"]:
                by_id[studio_id]["title"] = title
            continue

        entry = {
            "id": studio_id,
            "title": title,
            "url": f"https://scratch.mit.edu/studios/{studio_id}/",
        }
        by_id[studio_id] = entry
        studios.append(entry)

    for studio in studios:
        if not studio["title"]:
            studio["title"] = f"Studio #{studio['id']}"

    return studios


def output_error(message):
    print(json.dumps({"error": message}))


def profile_text(node):
    if node is None:
        return None
    for line_break in node.find_all("br"):
        line_break.replace_with("\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip()
             for line in node.get_text().splitlines()]
    return "\n".join(line for line in lines if line) or None


def scratch_url(href):
    if not isinstance(href, str):
        return None
    url = urljoin("https://scratch.mit.edu/", href)
    parsed = urlsplit(url)
    return url if parsed.scheme == "https" and (
        parsed.netloc == "scratch.mit.edu"
        or parsed.netloc.endswith(".scratch.mit.edu")
    ) else None


def serialize_featured(data):
    if not isinstance(data, dict):
        raise InvalidProfileResponse()
    project = data.get("featured_project_data")
    if project is None:
        return None
    if not isinstance(project, dict):
        raise InvalidProfileResponse()
    raw_id = project.get("id")
    if isinstance(raw_id, bool) or not str(raw_id).isdecimal() or int(raw_id) < 1:
        raise InvalidProfileResponse()
    project_id = int(raw_id)
    raw_label = data.get("featured_project_label_name")
    label_id = data.get("featured_project_label_id")
    fallback = {
        0: "Tutorial", 1: "Work in Progress", 2: "Remix This",
        3: "My Favorite Things", 4: "Why I Scratch",
    }
    label = raw_label.strip() if isinstance(raw_label, str) else ""
    return {
        "id": project_id,
        "title": text_or_none(project.get("title")),
        "url": f"https://scratch.mit.edu/projects/{project_id}/",
        "label": label or fallback.get(label_id, "Featured Project"),
    }


def following_from_page(soup):
    button = soup.select_one("#follow-button [data-control]")
    if button is None:
        return None
    control = button.get("data-control")
    if control == "unfollow":
        return True
    if control == "follow":
        return False
    return None


ACTIVITY_ACTIONS = {
    "project_share": "project",
    "project_love": "love",
    "project_favorite": "favorite",
    "project_remix": "remix",
    "studio_follow": "studio",
    "user_follow": "follow",
    "comment": "comment",
}


def serialize_activity(activity):
    target = getattr(activity, "target", None) or getattr(activity, "place", None)
    actor = getattr(activity, "actor", None)
    action = getattr(getattr(activity, "action", None), "value", None)
    return {
        "action": ACTIVITY_ACTIONS.get(action, "activity"),
        "actor": text_or_none(getattr(actor, "username", None)),
        "target_title": text_or_none(getattr(target, "title", None))
        or text_or_none(getattr(target, "username", None)),
        "target_url": scratch_url(getattr(target, "url", None)),
        "when": text_or_none(getattr(activity, "other", None)),
    }


def parse_profile_page(html, username):
    soup = BeautifulSoup(html, "html.parser")
    box = soup.select_one("#profile-data")
    if box is None:
        raise InvalidProfileResponse()

    header = box.select_one(".header-text")
    displayed_name = profile_text(header.select_one("h2")) if header else None
    if not displayed_name:
        raise InvalidProfileResponse()

    role = profile_text(header.select_one(".profile-details .group"))
    joined = header.select_one(".profile-details span[title]")
    country = profile_text(header.select_one(".profile-details .location"))
    portrait = box.select_one("#profile-avatar img[src]")
    icon_url = scratch_url(portrait.get("src")) if portrait else None
    user_id_match = USER_IMAGE_PATH.search(icon_url or "")

    return {
        "id": int(user_id_match.group(1)) if user_id_match else None,
        "username": displayed_name,
        "role": role,
        "country": country,
        "joined_at": text_or_none(joined.get("title")) if joined else None,
        "bio": profile_text(box.select_one("#bio-readonly .overview")
                            or box.select_one('#bio textarea[name="bio"]')),
        "status": profile_text(box.select_one("#status-readonly .overview")
                               or box.select_one('#status textarea[name="status"]')),
        "icon_url": icon_url,
        "url": f"https://scratch.mit.edu/users/{quote(username)}/",
    }


async def api_json(client, url, params=None):
    response = await client.get(url, params=params) if params else await client.get(url)
    try:
        return json.loads(response.text)
    except (ValueError, UnicodeError) as error:
        raise InvalidProfileResponse() from error


def serialize_api_item(item, section):
    if not isinstance(item, dict):
        raise InvalidProfileResponse()

    if section in ("following", "followers"):
        username = item.get("username")
        if not isinstance(username, str) or not username:
            raise InvalidProfileResponse()
        return {
            "username": username,
            "url": f"https://scratch.mit.edu/users/{quote(username)}/",
        }

    item_id = item.get("id")
    if not isinstance(item_id, int) or isinstance(item_id, bool):
        raise InvalidProfileResponse()

    if section == "studios":
        return {
            "id": item_id,
            "title": text_or_none(item.get("title")),
            "url": f"https://scratch.mit.edu/studios/{item_id}/",
        }

    author = item.get("author")
    return {
        "id": item_id,
        "title": text_or_none(item.get("title")),
        "author": text_or_none(author.get("username"))
        if isinstance(author, dict) else None,
        "url": f"https://scratch.mit.edu/projects/{item_id}/",
    }


async def fetch_about(client, username, viewer=None):
    response = await client.get(f"https://scratch.mit.edu/users/{quote(username)}/")
    about = parse_profile_page(response.text, username)
    if not viewer:
        about["following"] = None
    else:
        about["following"] = following_from_page(
            BeautifulSoup(response.text, "html.parser")
        )
    user = scapi.User(username, client, is_real=True)
    if about["following"] is None and viewer and viewer.lower() == username.lower():
        about["following"] = await self_following_status(user)
    featured_response = await client.get(
        f"https://scratch.mit.edu/site-api/users/all/{quote(username)}/"
    )
    about["featured_project"] = serialize_featured(featured_response.json())
    about["activities"] = [
        serialize_activity(activity)
        async for activity in user.get_activities(10)
    ]
    return about


async def fetch_items(client, username, section, limit, offset, page):
    if section == "comments":
        user = scapi.User(username, client, is_real=True)
        comments = []
        async for comment in user.get_comments(page, page):
            data = serialize_comment(comment)
            data["replies"] = [
                serialize_comment(reply)
                async for reply in comment.get_replies(use_cache=True)
            ]
            comments.append(data)
        return comments

    if section == "followed-studios":
        url = f"https://scratch.mit.edu/users/{quote(username)}/studios_following/"
        response = await client.get(url)
        return parse_followed_studios(response.text)[offset:offset + limit]

    path = {
        "projects": "projects/",
        "favorites": "favorites/",
        "studios": "studios/curate",
        "following": "following/",
        "followers": "followers/",
    }[section]
    data = await api_json(
        client,
        f"{API_BASE}/{quote(username)}/{path}",
        {"limit": limit, "offset": offset},
    )
    if not isinstance(data, list):
        raise InvalidProfileResponse()
    return [serialize_api_item(item, section) for item in data]


async def fetch_profile(client, username, section, limit, offset, page, viewer=None):
    if section == "about":
        return {"username": username, "section": section,
                "about": await fetch_about(client, username, viewer)}
    return {"username": username, "section": section,
            "items": await fetch_items(client, username, section, limit, offset, page)}


async def main():
    if len(sys.argv) != 6:
        output_error("Invalid profile arguments.")
        return 1

    username, section, raw_limit, raw_offset, raw_page = sys.argv[1:]
    if username and not re.fullmatch(r"[A-Za-z0-9_-]+", username):
        output_error("Invalid username.")
        return 1
    if section not in SECTIONS:
        output_error("Invalid profile section.")
        return 1

    try:
        limit, offset, page = map(int, (raw_limit, raw_offset, raw_page))
        payload = json.load(sys.stdin)
        session_id = payload.get("session_id")
    except (ValueError, json.JSONDecodeError, AttributeError):
        output_error("Invalid profile arguments.")
        return 1

    if limit < 1 or limit > 40 or offset < 0 or page < 1:
        output_error("Invalid pagination values.")
        return 1
    if not username and (not isinstance(session_id, str) or not session_id):
        output_error("No active session. Run `scc login` first or specify a username.")
        return 1

    using_session = not username
    try:
        if username:
            if section == "about" and isinstance(session_id, str) and session_id:
                try:
                    async with scapi.session_login(session_id) as session:
                        result = await fetch_profile(
                            session.client, username, section, limit, offset, page,
                            viewer=session.username,
                        )
                except (Unauthorized, ValueError):
                    async with scapi.HTTPClient() as client:
                        result = await fetch_profile(
                            client, username, section, limit, offset, page
                        )
            else:
                async with scapi.HTTPClient() as client:
                    result = await fetch_profile(client, username, section, limit, offset, page)
        else:
            async with scapi.session_login(session_id) as session:
                username = session.username
                result = await fetch_profile(
                    session.client, username, section, limit, offset, page,
                    viewer=session.username,
                )
        print(json.dumps(result, ensure_ascii=False))
    except NotFound:
        output_error("Scratch user or profile page not found.")
        return 1
    except TooManyRequests:
        output_error("Scratch rate limit reached. Try again later.")
        return 1
    except InvalidProfileResponse:
        output_error(f"Scratch returned an invalid {section} response.")
        return 1
    except Unauthorized:
        output_error(
            "Stored Scratch session is invalid. Run `scc login` again."
            if using_session else "Scratch denied access to the profile data."
        )
        return 1
    except ValueError:
        output_error(
            "Stored Scratch session is invalid. Run `scc login` again."
            if using_session else f"Could not read Scratch {section} data."
        )
        return 1
    except Exception as error:
        output_error(f"Could not load Scratch {section} data ({type(error).__name__}).")
        return 1

    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main))
