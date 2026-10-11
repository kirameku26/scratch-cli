import asyncio
import json
import sys

import scapi
from scapi.utils.error import NotFound


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

    try:
        async with scapi.session_login(session_id) as session:
            if username:
                target_username = username
            else:
                target_username = session.username

            user = await session.get_user(target_username)

            await user.load_website()

            data = {
                field: getattr(user, field, None)
                for field in USER_FIELDS
            }

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

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "type": type(e).__name__,
        }, ensure_ascii=False))

        return 1

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
