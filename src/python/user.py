import asyncio
import json
import sys

import scapi
from bs4 import BeautifulSoup
from scapi.utils.error import NotFound, Unauthorized
from following import self_following_status


USER_FIELDS = [
    "bio",
    "comments_allowed",
    "country",
    "exist",
    "icon_url",
    "id",
    "is_myself",
    "is_scratcher",
    "joined_at",
    "membership_avatar_badge",
    "membership_label",
    "profile_id",
    "scratchteam",
    "status",
    "url",
    "username",
]


def featured_from_payload(data):
    if not isinstance(data, dict):
        raise ValueError("Invalid featured project response")
    project = data.get("featured_project_data")
    if project is None:
        return None
    if not isinstance(project, dict):
        raise ValueError("Invalid featured project response")
    raw_id = project.get("id")
    if isinstance(raw_id, bool) or not str(raw_id).isdecimal() or int(raw_id) < 1:
        raise ValueError("Invalid featured project ID")
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
        "title": project.get("title") if isinstance(project.get("title"), str) else None,
        "label": label or fallback.get(label_id, "Featured Project"),
        "url": f"https://scratch.mit.edu/projects/{project_id}/",
    }


def following_from_html(html):
    button = BeautifulSoup(html, "html.parser").select_one(
        "#follow-button [data-control]"
    )
    if button is None:
        return None
    control = button.get("data-control")
    if control == "unfollow":
        return True
    if control == "follow":
        return False
    return None


async def main():
    try:
        payload = json.load(sys.stdin)
        session_id = payload.get("session_id")
    except (json.JSONDecodeError, AttributeError):
        session_id = None

    if not isinstance(session_id, str) or not session_id:
        print(json.dumps({
            "error": "A valid session is required.",
        }))
        return 1

    username = None

    if len(sys.argv) >= 2 and sys.argv[1] == "--user":
        if len(sys.argv) < 3:
            print(json.dumps({
                "error": "--user requires a username.",
            }))
            return 1

        username = sys.argv[2]

    authenticated = False
    try:
        async with scapi.session_login(session_id) as session:
            authenticated = True
            if username:
                target_username = username
            else:
                target_username = session.username

            user = await session.get_user(target_username)

            await user.load_website()

            featured_response = await session.client.get(
                f"https://scratch.mit.edu/site-api/users/all/{target_username}/"
            )
            featured_project = featured_from_payload(featured_response.json())

            profile_response = await session.client.get(user.url)
            following = following_from_html(profile_response.text)
            if following is None and target_username.lower() == session.username.lower():
                following = await self_following_status(user)

            activities = []
            async for activity in user.get_activities(10):
                target = getattr(activity, "target", None) or getattr(activity, "place", None)
                actor = getattr(activity, "actor", None)
                action = getattr(getattr(activity, "action", None), "value", None)
                activities.append({
                    "action": action if isinstance(action, str) else "unknown",
                    "actor": getattr(actor, "username", None),
                    "target_title": getattr(target, "title", None)
                    or getattr(target, "username", None),
                    "target_url": getattr(target, "url", None),
                    "when": getattr(activity, "other", None),
                })

            data = {
                field: getattr(user, field, None)
                for field in USER_FIELDS
            }
            data["featured_project"] = featured_project
            data["following"] = following
            data["activities"] = activities

            print(json.dumps(
                data,
                default=str,
                ensure_ascii=False,
                indent=2,
            ))

    except NotFound:
        print(json.dumps({
            "error": "User not found",
            "username": username,
        }, ensure_ascii=False))

        return 1

    except Unauthorized:
        print(json.dumps({"error": "Stored Scratch session is invalid. Run `scc login` again."}))
        return 1
    except ValueError:
        message = ("Scratch returned invalid user data." if authenticated else
                   "Stored Scratch session is invalid. Run `scc login` again.")
        print(json.dumps({"error": message}))
        return 1
    except Exception:
        print(json.dumps({"error": "Could not load the Scratch user. The network may be unavailable."}))
        return 1

    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main))
