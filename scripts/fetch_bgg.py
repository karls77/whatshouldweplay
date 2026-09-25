#!/usr/bin/env python3
"""Download a BoardGameGeek collection and write it as JSON for the web app.

Uses the BGG XML API2:
  /xmlapi2/collection  - the games a user owns
  /xmlapi2/thing       - per-game details, incl. the "suggested number of players" poll

Standard library only, so it runs anywhere Python 3.9+ is installed.

Environment variables:
  BGG_USERNAME  BGG user whose owned collection to fetch (default: ratpfink)
  BGG_TOKEN     API token from https://boardgamegeek.com/applications
                (BGG requires one for XML API access)
  OUTPUT        where to write the JSON (default: site/data/games.json)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

API = "https://boardgamegeek.com/xmlapi2"
THING_BATCH = 20  # BGG's maximum number of ids per /thing request
USER_AGENT = "whatshouldweplay/1.0 (+https://github.com/karls77/whatshouldweplay)"


def fetch(path, params, token=None, attempts=8):
    """GET an API url, retrying while BGG queues the request (202) or throttles us."""
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    headers = {"User-Agent": USER_AGENT}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    delay = 5
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as resp:
                body = resp.read()
                if resp.status == 200:
                    return body
                # 202 = BGG has queued the collection export; ask again shortly.
                print(f"  {path}: HTTP {resp.status}, retrying in {delay}s", file=sys.stderr)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit(f"BGG refused the request (HTTP {e.code}). Set BGG_TOKEN to a valid API token.")
            if e.code not in (429, 500, 502, 503, 504):
                raise
            print(f"  {path}: HTTP {e.code}, retrying in {delay}s", file=sys.stderr)
        except urllib.error.URLError as e:
            print(f"  {path}: {e.reason}, retrying in {delay}s", file=sys.stderr)
        if attempt < attempts:
            time.sleep(delay)
            delay = min(delay * 2, 60)
    sys.exit(f"Giving up on {url} after {attempts} attempts")


def num(value, cast=int):
    """Parse a BGG numeric attribute; missing, empty, 'N/A' and 0 become None."""
    try:
        n = cast(value)
    except (TypeError, ValueError):
        return None
    return n or None


def attr(el, path, name="value"):
    found = el.find(path)
    return None if found is None else found.get(name)


def parse_collection(xml_bytes):
    """Return {game id: {...}} for each owned base game in a /collection response."""
    root = ET.fromstring(xml_bytes)
    if root.tag == "errors":
        sys.exit("BGG error: " + "; ".join(m.text or "" for m in root.iter("message")))
    games = {}
    for item in root.iter("item"):
        game_id = int(item.get("objectid"))
        rating = item.find("stats/rating")
        games[game_id] = {
            "id": game_id,
            "name": item.findtext("name", "").strip(),
            "myRating": num(rating.get("value"), float) if rating is not None else None,
            "plays": int(item.findtext("numplays", "0") or 0),
        }
    return games


def parse_player_poll(item):
    """Summarise the 'suggested_numplayers' poll as {"4": {"best": n, "rec": n, "not": n}, ...}."""
    poll = item.find("poll[@name='suggested_numplayers']")
    counts = {}
    if poll is None:
        return counts
    keys = {"Best": "best", "Recommended": "rec", "Not Recommended": "not"}
    for results in poll.findall("results"):
        votes = {"best": 0, "rec": 0, "not": 0}
        for result in results.findall("result"):
            key = keys.get(result.get("value"))
            if key:
                votes[key] = int(result.get("numvotes") or 0)
        counts[results.get("numplayers")] = votes
    return counts


def parse_things(xml_bytes):
    """Return {game id: {...}} with details from a /thing?stats=1 response."""
    things = {}
    for item in ET.fromstring(xml_bytes).iter("item"):
        game_id = int(item.get("id"))
        ratings = item.find("statistics/ratings")
        if ratings is None:
            ratings = ET.Element("ratings")
        weight = num(attr(ratings, "averageweight"), float)
        average = num(attr(ratings, "average"), float)
        things[game_id] = {
            "name": attr(item, "name[@type='primary']"),
            "year": num(attr(item, "yearpublished")),
            "thumbnail": (item.findtext("thumbnail") or "").strip() or None,
            "minPlayers": num(attr(item, "minplayers")),
            "maxPlayers": num(attr(item, "maxplayers")),
            "minTime": num(attr(item, "minplaytime")),
            "maxTime": num(attr(item, "maxplaytime")),
            "playingTime": num(attr(item, "playingtime")),
            "minAge": num(attr(item, "minage")),
            "weight": round(weight, 2) if weight else None,
            "bggRating": round(average, 2) if average else None,
            "rank": num(attr(ratings, "ranks/rank[@name='boardgame']")),
            "categories": [l.get("value") for l in item.findall("link[@type='boardgamecategory']")],
            "mechanics": [l.get("value") for l in item.findall("link[@type='boardgamemechanic']")],
            "playerPoll": parse_player_poll(item),
        }
    return things


def main():
    username = os.environ.get("BGG_USERNAME", "ratpfink")
    token = os.environ.get("BGG_TOKEN") or None
    output = os.environ.get("OUTPUT", "site/data/games.json")
    if not token:
        print("Warning: BGG_TOKEN is not set; BGG may reject the requests.", file=sys.stderr)

    print(f"Fetching owned collection for {username}...")
    games = parse_collection(fetch("collection", {
        "username": username,
        "own": 1,
        "subtype": "boardgame",
        "excludesubtype": "boardgameexpansion",
        "stats": 1,
    }, token))
    print(f"  {len(games)} games")

    ids = sorted(games)
    for start in range(0, len(ids), THING_BATCH):
        batch = ids[start:start + THING_BATCH]
        print(f"Fetching details {start + 1}-{start + len(batch)} of {len(ids)}...")
        things = parse_things(fetch("thing", {"id": ",".join(map(str, batch)), "stats": 1}, token))
        for game_id, details in things.items():
            if game_id in games:
                # Keep the collection's name (it reflects the user's chosen edition name).
                details["name"] = games[game_id]["name"] or details["name"]
                games[game_id].update(details)
        time.sleep(2)  # be polite; BGG throttles rapid requests

    data = {
        "username": username,
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "games": sorted(games.values(), key=lambda g: g["name"].lower()),
    }
    os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(games)} games to {output}")


if __name__ == "__main__":
    main()
