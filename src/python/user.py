import asyncio
import json
import os

import scapi


CONFIG_PATH = os.path.expanduser("~/.config/scc/config.json")


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


async def main():
    config = load_config()

    session_id = config.get("scratchsessionsid")

    if not session_id:
        print("Not logged in.")
        return

    print("Session ID length:", len(session_id))
    print("First char:", repr(session_id[:1]))
    print("Last char:", repr(session_id[-1:]))

    async with scapi.session_login(session_id) as session:
        print("Login successful.")
        print("Username:", session.username)
        print("User ID:", session.user_id)


if __name__ == "__main__":
    asyncio.run(main())