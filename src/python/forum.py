import json
import re
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
import scapi
from scapi.utils.error import Forbidden, NotFound, TooManyRequests, Unauthorized


ACTIONS = {"categories", "topics", "topic", "posts", "post", "source", "follow", "unfollow"}
MUTATIONS = {"follow", "unfollow"}
BASE = "https://scratch.mit.edu"
MAX_ID = 9007199254740991


class InvalidForumResponse(Exception):
    pass


def identifier(href, kind):
    if not isinstance(href, str):
        return None
    url = urlsplit(urljoin(BASE, href))
    prefix = "" if kind == "category" else f"{kind}/"
    match = re.fullmatch(rf"/discuss/{prefix}([1-9][0-9]*)/", url.path)
    return int(match[1]) if url.scheme == "https" and url.netloc == "scratch.mit.edu" and match and int(match[1]) <= MAX_ID else None


def text(node):
    return node.get_text(" ", strip=True) if node else ""


def count(node):
    value = text(node).replace(",", "")
    return int(value) if value.isdecimal() and int(value) <= MAX_ID else None


def item(kind, item_id, title, **fields):
    prefix = "" if kind == "category" else f"{kind}/"
    return {"kind": kind, "id": item_id, "title": title,
            "url": f"{BASE}/discuss/{prefix}{item_id}/", **fields}


def categories(soup):
    boxes = soup.select(".blocktable .box")
    if not boxes:
        raise InvalidForumResponse()
    entries = []
    seen = set()
    for box in boxes:
        for row in box.select("tbody tr"):
            anchor = row.select_one(".tclcon a[href]")
            category_id = identifier(anchor.get("href"), "category") if anchor else None
            if category_id is None or category_id in seen:
                continue
            seen.add(category_id)
            entries.append(item("category", category_id, text(anchor), group=text(box.find("h4")),
                                description=text(row.select_one(".tclcon")),
                                topic_count=count(row.select_one(".tc2")), post_count=count(row.select_one(".tc3"))))
    if not entries:
        raise InvalidForumResponse()
    return entries


def topics(soup, limit):
    board = soup.select_one("#vf")
    if not board or not board.select_one(".box-head"):
        raise InvalidForumResponse()
    entries = []
    for row in board.select("tbody tr"):
        anchor = row.select_one(".tcl h3 a[href]")
        topic_id = identifier(anchor.get("href"), "topic") if anchor else None
        if topic_id is None:
            continue
        entries.append(item("topic", topic_id, text(anchor),
                            author=re.sub(r"^by\s+", "", text(row.select_one(".byuser"))),
                            replies=count(row.select_one(".tc2")), views=count(row.select_one(".tc3")),
                            closed=row.select_one(".iclosed") is not None, sticky=row.select_one(".isticky") is not None))
        if len(entries) == limit:
            break
    if not entries and not board.select_one(".djangobbcon1"):
        raise InvalidForumResponse()
    return entries


def topic(soup, expected_id=None):
    crumbs = soup.select_one(".linkst ul")
    if not crumbs:
        raise InvalidForumResponse()
    parts = crumbs.find_all("li", recursive=False)
    category_anchor = next((a for a in crumbs.select("a[href]") if identifier(a.get("href"), "category")), None)
    if len(parts) < 3 or category_anchor is None:
        raise InvalidForumResponse()
    meta = soup.find("meta", {"property": "og:url"})
    canonical = soup.find("link", {"rel": "canonical"})
    topic_id = identifier(meta.get("content"), "topic") if meta else None
    if topic_id is None and canonical:
        topic_id = identifier(canonical.get("href"), "topic")
    if topic_id is not None and expected_id is not None and topic_id != expected_id:
        raise InvalidForumResponse()
    topic_id = topic_id or expected_id
    if topic_id is None:
        raise InvalidForumResponse()
    pages = [int(text(node)) for node in soup.select(".pagination .page") if text(node).isdecimal()]
    return item("topic", topic_id, text(parts[2]).lstrip("» "),
                category_id=identifier(category_anchor.get("href"), "category"), category=text(category_anchor),
                page_count=max(pages, default=1))


def post(node, topic_info):
    match = re.fullmatch(r"p([1-9][0-9]*)", node.get("id", ""))
    content = node.select_one(".postmsg")
    author = next((text(a) for a in node.select(".postleft a[href]")
                   if re.fullmatch(r"/users/[A-Za-z0-9_-]+/", urlsplit(a.get("href")).path) and text(a)), None)
    if not match or int(match[1]) > MAX_ID or content is None or not author:
        raise InvalidForumResponse()
    modified = content.select_one(".posteditmessage")
    edited = text(modified) or None
    if modified:
        modified.decompose()
    for unsafe in content.select("script, style"):
        unsafe.decompose()
    for br in content.find_all("br"):
        br.replace_with("\n")
    for block in content.select("p, pre, blockquote, li, div"):
        block.insert_before("\n")
        block.insert_after("\n")
    return item("post", int(match[1]), f"Post {text(node.select_one('.box-head span'))}",
                topic_id=topic_info["id"], topic=topic_info["title"], author=author,
                created_at=text(node.select_one(".box-head a")) or None, edited=edited,
                content=content.get_text().strip())


async def read(client, action, target, page, limit):
    if action == "source":
        # No metadata request is needed to read the BBCode source.
        source = await scapi.ForumPost(target, client).get_source()
        if not isinstance(source, str) or source.lstrip().lower().startswith(("<!doctype html", "<html")):
            raise InvalidForumResponse()
        return {"source": source}
    path = "/discuss/" if action == "categories" else (
        f"/discuss/{target}/" if action == "topics" else
        f"/discuss/post/{target}/" if action == "post" else f"/discuss/topic/{target}/")
    response = await client.get(BASE + path, **({"params": {"page": page}} if action in {"topics", "posts"} else {}))
    soup = BeautifulSoup(response.text, "html.parser")
    if action == "categories":
        entries = categories(soup)
    elif action == "topics":
        entries = topics(soup, limit)
    else:
        info = topic(soup, target if action != "post" else None)
        if action == "topic":
            entries = [info]
        else:
            nodes = [soup.find("div", id=f"p{target}")] if action == "post" else soup.select("div.blockpost[id]")[:limit]
            if not nodes or any(node is None for node in nodes):
                if action == "posts" and soup.select_one(".djangobbcon1"):
                    return {"items": []}
                raise InvalidForumResponse()
            entries = [post(node, info) for node in nodes]
    return {"items": entries}


def error(message):
    print(json.dumps({"error": message}))


def rate_limit_message(exception):
    response = getattr(getattr(exception, "response", None), "_response", None)
    retry_after = getattr(response, "headers", {}).get("Retry-After", "")
    seconds = None
    if isinstance(retry_after, str):
        if re.fullmatch(r"[0-9]{1,10}", retry_after):
            seconds = int(retry_after)
        else:
            try:
                deadline = parsedate_to_datetime(retry_after)
                seconds = max(0, int((deadline - datetime.now(timezone.utc)).total_seconds()) + 1)
            except (ValueError, TypeError, OverflowError):
                pass
    return (f"Scratch rate limit reached. Try again after {seconds} seconds." if seconds is not None
            else "Scratch rate limit reached. Try again later.")


async def main():
    if len(sys.argv) != 5 or sys.argv[1] not in ACTIONS:
        error("Invalid forum arguments.")
        return 1
    action = sys.argv[1]
    try:
        target, page, limit = map(int, sys.argv[2:])
        if not (0 <= target <= MAX_ID and 1 <= page <= MAX_ID and 1 <= limit <= 40) or (target == 0) != (action == "categories"):
            raise ValueError()
    except ValueError:
        error("Invalid forum ID, page, or limit.")
        return 1
    response = {"action": action, "id": target or None, "page": page if action in {"topics", "posts"} else None}
    authenticated = False
    try:
        if action in MUTATIONS:
            try:
                payload = json.load(sys.stdin)
                session_id = payload.get("session_id")
                expected = payload.get("expected_account")
            except (ValueError, AttributeError):
                session_id, expected = None, None
            if not isinstance(session_id, str) or not session_id or not isinstance(expected, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", expected):
                error("A valid session and confirmed account are required.")
                return 1
            async with scapi.session_login(session_id) as session:
                authenticated = True
                if session.username != expected:
                    error("The active Scratch account changed before the action could run.")
                    return 1
                forum_topic = scapi.ForumTopic(target, session)
                await getattr(forum_topic, action)()
                response["account"] = session.username
        else:
            async with scapi.HTTPClient() as client:
                response.update(await read(client, action, target, page, limit))
    except NotFound:
        error("Scratch forum item not found.")
        return 1
    except TooManyRequests as exception:
        error(rate_limit_message(exception))
        return 1
    except Unauthorized:
        error("Stored Scratch session is invalid. Run `scc login` again." if action in MUTATIONS else "This forum item is not publicly accessible.")
        return 1
    except Forbidden:
        error("Scratch did not allow this forum request.")
        return 1
    except InvalidForumResponse:
        error("Received an invalid Scratch forum response.")
        return 1
    except ValueError:
        error("Stored Scratch session is invalid. Run `scc login` again." if action in MUTATIONS and not authenticated else "Received an invalid Scratch forum response.")
        return 1
    except Exception:
        error("Could not complete the Scratch forum request. The network may be unavailable.")
        return 1
    print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    from runtime import run
    sys.exit(run(main, mutation=len(sys.argv) > 1 and sys.argv[1] in MUTATIONS))
