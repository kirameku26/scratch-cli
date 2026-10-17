import asyncio
import json


async def run_with_timeout(operation, *, timeout=30, mutation=False):
    try:
        return await asyncio.wait_for(operation(), timeout=timeout)
    except (TimeoutError, asyncio.TimeoutError):
        message = "Scratch request timed out."
        if mutation:
            message += " The change may have completed; check its result before retrying."
        print(json.dumps({"error": message}))
        return 1


def run(operation, *, mutation=False):
    return asyncio.run(run_with_timeout(operation, mutation=mutation))
