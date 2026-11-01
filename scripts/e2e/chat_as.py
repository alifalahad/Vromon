#!/usr/bin/env python3
"""
Act as a test account in chat, from the Mac, while the phone is signed in as the other.

    backend/venv/bin/python scripts/e2e/chat_as.py B send "Hi Ana! চলো সিলেট যাই"
    backend/venv/bin/python scripts/e2e/chat_as.py B read            # read up to the newest message
    backend/venv/bin/python scripts/e2e/chat_as.py B typing 8         # "typing…" for 8 seconds
    backend/venv/bin/python scripts/e2e/chat_as.py B messages 5       # the last 5 messages
    backend/venv/bin/python scripts/e2e/chat_as.py B list             # B's chats
    backend/venv/bin/python scripts/e2e/chat_as.py B listen 60        # print B's live events for 60 seconds

Cards (step 4):

    backend/venv/bin/python scripts/e2e/chat_as.py B trips                         # B's trips, to pick one to share
    backend/venv/bin/python scripts/e2e/chat_as.py B trip 91                       # a trip card
    backend/venv/bin/python scripts/e2e/chat_as.py B place attraction 192          # also destination 3, region BD-G, city 1185241
    backend/venv/bin/python scripts/e2e/chat_as.py B idea Sylhet --month 2026-12 --part early --days 3 --note "tea gardens"
    backend/venv/bin/python scripts/e2e/chat_as.py B poll "Which weekend?" "3–5 Dec|10–12 Dec" --multiple
    backend/venv/bin/python scripts/e2e/chat_as.py B vote 31 2                     # answer: option 2 (1,3 for several; - takes it back)

Reactions, replies and safety (step 5):

    backend/venv/bin/python scripts/e2e/chat_as.py B react 31 heart                # also thumbs_up, laugh, wow, want; - takes it back
    backend/venv/bin/python scripts/e2e/chat_as.py B reply 31 "Yes, let's"
    backend/venv/bin/python scripts/e2e/chat_as.py B unsend 32
    backend/venv/bin/python scripts/e2e/chat_as.py B report 31 spam "a note"
    backend/venv/bin/python scripts/e2e/chat_as.py B settings read_receipts=false  # PUT /me/settings (others stay as saved)

On the road (step 6):

    backend/venv/bin/python scripts/e2e/chat_as.py B newtrip Sylhet --start -1 --days 3  # a trip that began yesterday
    backend/venv/bin/python scripts/e2e/chat_as.py A road                                # A's On the road list
    backend/venv/bin/python scripts/e2e/chat_as.py B deltrip 101

Trip rooms (step 7):

    backend/venv/bin/python scripts/e2e/chat_as.py A invite 91              # invite the other test account to trip 91
    backend/venv/bin/python scripts/e2e/chat_as.py B join 91                # join it; prints the room's chat id
    backend/venv/bin/python scripts/e2e/chat_as.py B room 91                # who's in it, and its last messages
    backend/venv/bin/python scripts/e2e/chat_as.py B suggest 91 192         # suggest attraction 192 in trip 91's room
    backend/venv/bin/python scripts/e2e/chat_as.py A accept 91 MESSAGE_ID 2 # the owner adds it to day 2
    backend/venv/bin/python scripts/e2e/chat_as.py B tryedit 91             # a member trying to change the plan (should be 404)
    backend/venv/bin/python scripts/e2e/chat_as.py B leave 91
    backend/venv/bin/python scripts/e2e/chat_as.py B roomsay 91 "Hi all"    # text into the room

The chat is the one with the other test account (A for B, B for A), unless --to names
someone else B is friends with. --base picks the backend (default: API_URL in
.env.e2e.local). Run it with the backend's Python.
"""

import argparse
import asyncio
import json
import sys
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from live_check import call  # noqa: E402
from session import read_env, sign_in, tls  # noqa: E402

ACCOUNTS = Path(__file__).resolve().parents[2] / ".env.e2e.local"


def chat_id(base: str, token: str, username: str) -> int:
    _, friends = call(base, token, "GET", "/friends")
    friend = next((f for f in friends if f["username"] == username), None)
    if friend is None:
        sys.exit(f"Not friends with {username} on {base}")
    _, conversation = call(base, token, "POST", "/conversations/direct", {"user_id": friend["id"]})
    return conversation["id"]


async def live(base: str, token: str):
    import websockets

    url = base.replace("https://", "wss://").replace("http://", "ws://") + "/api/v1/ws"
    ws = await websockets.connect(url, ssl=tls() if url.startswith("wss") else None)
    await ws.send(json.dumps({"type": "auth", "token": token}))
    if json.loads(await asyncio.wait_for(ws.recv(), 15)).get("type") != "ready":
        sys.exit("The socket didn't sign in")
    return ws


async def typing(base: str, token: str, conversation: int, seconds: float) -> None:
    async with await live(base, token) as ws:
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            await ws.send(json.dumps({"type": "typing", "conversation_id": conversation}))
            await asyncio.sleep(min(3, max(0, end - time.monotonic())))


def describe(m: dict) -> str:
    """A message in one line: its text, or what its card shows."""
    if m.get("deleted"):
        return "(removed)"
    p, kind = m.get("payload") or {}, m.get("kind")
    if kind == "text" or not kind:
        return repr(m.get("body"))
    if p.get("available") is False:
        return f"[{kind}] no longer available"
    votes = f"  votes {m['votes']}" if m.get("votes") else ""
    if kind == "trip":
        return f"[trip] {p.get('destination')} {p.get('start_date')}–{p.get('end_date')}, {p.get('stops')} stops, by {p.get('owner_name')}"
    if kind == "place":
        return f"[place] {p.get('type')} {p.get('name')}"
    if kind == "idea":
        return f"[idea] {p.get('destination')} {p.get('part') or ''} {p.get('month') or ''} {p.get('days') or '?'} days{votes}"
    if kind == "poll":
        return f"[poll] {p.get('question')} {[o['text'] for o in p.get('options', [])]}{votes}"
    if kind == "checkin":
        where = p.get("stop") or (f"near {p['near']}" if p.get("near") else "somewhere")
        late = f", {p['late_by']} min vs plan {p['planned']}" if p.get("planned") else ""
        return f"[I'm here] {where} at {p.get('time')}{late}"
    if kind == "late":
        return f"[running late] {p.get('minutes')} min for {p.get('stop') or '-'} (from {p.get('source')})"
    if kind == "live":
        # Never print the point itself
        state = f"active, a point {'is' if p.get('lat') is not None else 'is not'} shown to members" if p.get("active") else "ended"
        return f"[live location] {state}, until {p.get('until')}{', near ' + p['near'] if p.get('near') else ''}"
    return f"[{kind}]"


async def listen(base: str, token: str, seconds: float) -> None:
    async with await live(base, token) as ws:
        print(f"listening for {seconds:g} s", flush=True)
        end = time.monotonic() + seconds
        while (left := end - time.monotonic()) > 0:
            try:
                event = json.loads(await asyncio.wait_for(ws.recv(), left))
            except TimeoutError:
                break
            kind = event.get("type")
            if kind == "ping":
                continue
            if kind.startswith("message."):
                detail = describe(event["message"])
            else:
                detail = repr({k: v for k, v in event.items() if k != "type"})
            print(f"{time.strftime('%H:%M:%S')}  {kind}  {detail}", flush=True)


def main() -> None:
    accounts = read_env(ACCOUNTS)
    parser = argparse.ArgumentParser(description="Act as a test account in chat.")
    parser.add_argument("account", choices=["A", "B"])
    parser.add_argument(
        "action",
        choices=[
            "send", "read", "typing", "messages", "list", "listen", "trips", "trip", "place", "idea", "poll", "vote",
            "react", "reply", "unsend", "report", "settings", "newtrip", "deltrip", "road",
            "invite", "join", "room", "suggest", "accept", "tryedit", "leave", "roomsay",
        ],
    )
    parser.add_argument("rest", nargs="*", help="the text, seconds or count; a card's ids; a poll's question and answers")
    parser.add_argument("--to", help="the friend's username (default: the other test account)")
    parser.add_argument("--month", help="idea: YYYY-MM")
    parser.add_argument("--part", choices=["early", "mid", "late"], help="idea: early, mid or late in the month")
    parser.add_argument("--days", type=int, help="idea: how many days")
    parser.add_argument("--note", help="idea: a short note")
    parser.add_argument("--multiple", action="store_true", help="poll: more than one answer each")
    parser.add_argument("--start", type=int, default=0, help="newtrip: starts this many days from today (negative: already began)")
    parser.add_argument("--base", default=accounts.get("API_URL", "http://127.0.0.1:8001"))
    args = parser.parse_args()
    args.arg = args.rest[0] if args.rest else None
    base = args.base.rstrip("/")
    token = sign_in(args.account)[0]["access_token"]

    if args.action == "listen":
        asyncio.run(listen(base, token, float(args.arg or 60)))
        return
    if args.action == "list":
        _, chats = call(base, token, "GET", "/conversations")
        for c in chats:
            last = describe(c["last_message"]) if c["last_message"] else "-"
            who = c["other"]["username"] if c["other"] else "(deleted account)"
            print(f"{c['id']:>4}  {who:<14} unread {c['unread_count']}  read by them up to {c['other_read_up_to']}  last: {last}")
        return
    if args.action == "settings":
        _, saved = call(base, token, "GET", "/me/settings")
        change = {}
        for pair in args.rest:
            key, _, value = pair.partition("=")
            change[key] = {"true": True, "false": False}.get(value.lower(), value)
        keep = {k: v for k, v in saved.items() if k != "updated_at"}
        _, saved = call(base, token, "PUT", "/me/settings", {**keep, **change})
        print({k: saved[k] for k in change} if change else saved)
        return
    if args.action == "newtrip":
        start = date.today() + timedelta(days=args.start)
        end = start + timedelta(days=(args.days or 3) - 1)
        _, trip = call(base, token, "POST", "/trips", {
            "destination": args.arg or "Sylhet", "start_date": start.isoformat(), "end_date": end.isoformat(),
            "num_travelers": 1, "total_budget": 10000,
        })
        print(f"trip {trip['id']}: {trip['destination']} {trip['start_date']} – {trip['end_date']}")
        return
    if args.action == "deltrip":
        status, _ = call(base, token, "DELETE", f"/trips/{args.arg}")
        print(f"deleted trip {args.arg}, HTTP {status}")
        return
    if args.action == "road":
        _, road = call(base, token, "GET", f"/me/friends/on-the-road?today={date.today().isoformat()}")
        for r in road:
            trip = r["trip"]
            when = f"day {trip['day']} of {trip['days']}" if trip["day"] else f"in {trip['starts_in']} days"
            print(f"{r['friend']['username']:<14} {trip['destination']:<12} {trip['start_date']} – {trip['end_date']}  {when}  (trip {trip['trip_id']})")
        if not road:
            print("nobody on the road")
        return
    if args.action in ("invite", "join", "room", "suggest", "accept", "tryedit", "leave", "roomsay"):
        room_action(base, token, args, accounts)
        return
    if args.action == "trips":
        _, trips = call(base, token, "GET", "/trips")
        for trip in trips:
            print(f"{trip['id']:>5}  {trip['destination']:<14} {trip['start_date']} – {trip['end_date']}  {trip['status']}")
        return

    other = args.to or accounts[f"E2E_{'A' if args.account == 'B' else 'B'}_USERNAME"]
    conversation = chat_id(base, token, other)
    if args.action == "send":
        text = args.arg or f"Hello from the Mac {time.strftime('%H:%M:%S')}"
        status, message = call(base, token, "POST", f"/conversations/{conversation}/messages", {"client_id": str(uuid.uuid4()), "body": text})
        print(f"sent to {other} (chat {conversation}): {message['body']!r}, message {message['id']}, HTTP {status}")
    elif args.action == "read":
        _, page = call(base, token, "GET", f"/conversations/{conversation}/messages?limit=1")
        newest = page["messages"][-1]["id"] if page["messages"] else 0
        if newest:
            call(base, token, "POST", f"/conversations/{conversation}/read", {"message_id": newest})
        print(f"read chat {conversation} up to message {newest}")
    elif args.action == "typing":
        seconds = float(args.arg or 8)
        asyncio.run(typing(base, token, conversation, seconds))
        print(f"was typing in chat {conversation} for {seconds:g} s")
    elif args.action == "react":
        if len(args.rest) != 2:
            sys.exit("react MESSAGE_ID heart|thumbs_up|laugh|wow|want|-")
        path = f"/conversations/{conversation}/messages/{args.rest[0]}/reaction"
        if args.rest[1] == "-":
            _, message = call(base, token, "DELETE", path)
        else:
            _, message = call(base, token, "PUT", path, {"reaction": args.rest[1]})
        print(f"message {message['id']}: reactions {message['reactions']}")
    elif args.action == "reply":
        if len(args.rest) != 2:
            sys.exit('reply MESSAGE_ID "text"')
        status, message = call(
            base, token, "POST", f"/conversations/{conversation}/messages",
            {"client_id": str(uuid.uuid4()), "body": args.rest[1], "reply_to_id": int(args.rest[0])},
        )
        quoted = describe(message["reply_to"]) if message.get("reply_to") else "-"
        print(f"replied to {args.rest[0]} ({quoted}): {message['body']!r}, message {message['id']}, HTTP {status}")
    elif args.action == "unsend":
        status, _ = call(base, token, "DELETE", f"/conversations/{conversation}/messages/{args.arg}")
        print(f"unsent message {args.arg}, HTTP {status}")
    elif args.action == "report":
        if len(args.rest) not in (2, 3):
            sys.exit('report MESSAGE_ID spam|harassment|inappropriate|scam|other ["note"]')
        status, report = call(
            base, token, "POST", f"/messages/{args.rest[0]}/report",
            {"reason": args.rest[1], "note": args.rest[2] if len(args.rest) == 3 else None},
        )
        print(f"report {report['id']} ({report['status']}), HTTP {status}")
    elif args.action == "messages":
        _, page = call(base, token, "GET", f"/conversations/{conversation}/messages?limit={int(args.arg or 10)}")
        for m in page["messages"]:
            who = "me" if m["client_id"] else (m["sender_id"] or "Vromon")[:8]
            extra = f"  reactions {m['reactions']}" if m.get("reactions") else ""
            extra += f"  replying to {m['reply_to']['id']}" if m.get("reply_to") else ""
            print(f"{m['id']:>5}  {who:<8} {describe(m)}{extra}")
    elif args.action == "vote":
        if len(args.rest) != 2:
            sys.exit("vote MESSAGE_ID OPTIONS (1, 1,3, or - to take the answer back)")
        options = [] if args.rest[1] == "-" else [int(o) for o in args.rest[1].split(",")]
        _, message = call(base, token, "PUT", f"/conversations/{conversation}/messages/{args.rest[0]}/vote", {"option_ids": options})
        print(f"answered message {message['id']}: {describe(message)}")
    else:
        card = card_payload(base, token, args)
        status, message = call(
            base, token, "POST", f"/conversations/{conversation}/messages",
            {"client_id": str(uuid.uuid4()), "kind": args.action, "payload": card},
        )
        print(f"sent to {other} (chat {conversation}): {describe(message)}, message {message['id']}, HTTP {status}")


def room_action(base: str, token: str, args, accounts: dict) -> None:
    """Trip rooms (step 7): the trip id first, then what the action needs."""
    trip = int(args.rest[0])
    if args.action == "invite":
        other = args.to or accounts[f"E2E_{'A' if args.account == 'B' else 'B'}_USERNAME"]
        _, friends = call(base, token, "GET", "/friends")
        uid = next(f["id"] for f in friends if f["username"] == other)
        _, room = call(base, token, "POST", f"/trips/{trip}/members", {"user_ids": [uid], "note": args.note})
        print(f"invited {other}; room {room['conversation_id']}: {[(m['user']['username'], m['status']) for m in room['members']]}")
    elif args.action == "join":
        _, room = call(base, token, "POST", f"/trips/{trip}/members/me/join")
        print(f"joined; room {room['conversation_id']}: {[(m['user']['username'], m['status']) for m in room['members']]}")
    elif args.action == "leave":
        _, me = call(base, token, "GET", "/me")
        status, _ = call(base, token, "DELETE", f"/trips/{trip}/members/{me['id']}")
        print(f"left trip {trip}, HTTP {status}")
    elif args.action == "tryedit":
        for method, path, body in (("PATCH", f"/trips/{trip}", {"title": "Changed by a member"}), ("DELETE", f"/trips/{trip}", None)):
            try:
                status, _ = call(base, token, method, path, body)
            except Exception as exc:  # urllib raises on 4xx
                status = getattr(exc, "code", exc)
            print(f"{method} {path}: HTTP {status}")
    else:
        _, room = call(base, token, "GET", f"/trips/{trip}/members")
        cid = room["conversation_id"]
        if args.action == "room":
            print(f"room {cid}: {[(m['user']['username'], m['status']) for m in room['members']]}")
            _, page = call(base, token, "GET", f"/conversations/{cid}/messages?limit={int(args.rest[1]) if len(args.rest) > 1 else 8}")
            for m in page["messages"]:
                extra = f"  suggestion {m['payload'].get('suggestion')}" if m.get("payload") and m["payload"].get("suggestion") else ""
                print(f"{m['id']:>5}  {m['kind']:<7} {describe(m) if m['kind'] != 'system' else m['payload']}{extra}")
        elif args.action == "suggest":
            status, m = call(base, token, "POST", f"/conversations/{cid}/messages", {
                "client_id": str(uuid.uuid4()), "kind": "place", "payload": {"type": "attraction", "ref": args.rest[1]},
            })
            print(f"suggested {m['payload'].get('name')} in room {cid}: message {m['id']}, HTTP {status}")
        elif args.action == "roomsay":
            status, m = call(base, token, "POST", f"/conversations/{cid}/messages", {"client_id": str(uuid.uuid4()), "body": args.rest[1]})
            print(f"said {m['body']!r} in room {cid}: message {m['id']}, HTTP {status}")
        elif args.action == "accept":
            status, m = call(base, token, "POST", f"/trips/{trip}/suggestions/{args.rest[1]}/accept", {"day": int(args.rest[2])})
            print(f"added: {m['payload'].get('suggestion')}, HTTP {status}")


def card_payload(base: str, token: str, args) -> dict:
    """What the app sends for a card (the server builds the rest)."""
    rest = args.rest
    if args.action == "trip" and len(rest) == 1:
        return {"trip_id": int(rest[0])}
    if args.action == "place" and len(rest) == 2:
        return {"type": rest[0], "ref": rest[1]}
    if args.action == "poll" and len(rest) == 2:
        return {"question": rest[0], "options": rest[1].split("|"), "multiple": args.multiple}
    if args.action == "idea" and len(rest) == 1:
        if rest[0].isdigit():
            destination_id = int(rest[0])
        else:
            _, destinations = call(base, token, "GET", "/destinations")
            match = next((d for d in destinations if d["name"].casefold() == rest[0].casefold()), None)
            if match is None:
                sys.exit(f"No destination called {rest[0]!r}")
            destination_id = match["id"]
        card = {"destination_id": destination_id, "month": args.month, "part": args.part, "days": args.days, "note": args.note}
        return {k: v for k, v in card.items() if v is not None}
    sys.exit("Usage: trip ID | place TYPE REF | idea DESTINATION [--month --part --days --note] | poll QUESTION 'A|B' [--multiple]")


if __name__ == "__main__":
    main()
