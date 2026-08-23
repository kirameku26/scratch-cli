import asyncio
import json
import sys

import scapi


async def get_user(
    session_id: str,
    username: str | None = None,
):
    async with scapi.session_login(session_id) as session:
        if username:
            user = await session.get_user(username)
        else:
            user = await session.get_user(session.username)

        data = {}

        for name in dir(user):
            if name.startswith("_"):
                continue

            try:
                value = getattr(user, name)

                if callable(value):
                    continue

                data[name] = value
            except Exception:
                continue

        print(json.dumps(
            data,
            ensure_ascii=False,
            default=str,
        ))


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Session ID is required."
        }))
        return

    session_id = sys.argv[1]

    username = None

    args = sys.argv[2:]

    if args:
        if args[0] == "--user":
            if len(args) < 2:
                print(json.dumps({
                    "error": "--user requires a username."
                }))
                return

            username = args[1]

            if len(args) > 2:
                print(json.dumps({
                    "error": f"Unknown argument: {args[2]}"
                }))
                return

        else:
            print(json.dumps({
                "error": f"Unknown option: {args[0]}"
            }))
            return

    await get_user(session_id, username)


if __name__ == "__main__":
    asyncio.run(main())