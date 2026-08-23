import asyncio
import getpass

import scapi


async def main():
    username = input("Username: ")
    password = getpass.getpass("Password: ")

    print("Calling scapi.login()...")

    async with scapi.login(
        username,
        password,
        load_status=True,
    ) as session:
        print("Login returned successfully.")
        print("Session type:", type(session))
        print("Session:", session)

        print()
        print("username:", session.username)
        print("user_id:", session.user_id)
        print("session_id length:", len(session.session_id))
        print("xtoken exists:", bool(session.xtoken))

        print()
        print("user type:", type(session.user))
        print("user:", session.user)
        print("user.username:", session.user.username)
        print("user.id:", session.user.id)

        print()
        print("status type:", type(session.status))
        print("status:", session.status)

        print()
        print("session_id repr:", repr(session.session_id))
        print("session_id length:", len(session.session_id))


if __name__ == "__main__":
    asyncio.run(main())