from contextlib import aclosing


async def self_following_status(user):
    """Check at most one Scapi following page; a full page cannot prove No."""
    target = user.username.lower()
    count = 0
    valid = True
    async with aclosing(user.get_followings(limit=40, offset=0)) as followings:
        async for followed in followings:
            count += 1
            username = getattr(followed, "username", None)
            if not isinstance(username, str) or not username:
                valid = False
            elif username.lower() == target:
                return True
            if count >= 40:
                return None
    return False if valid else None
