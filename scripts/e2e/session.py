#!/usr/bin/env python3
"""
Print a fresh Supabase access token for a test account: A (e2e.ana) or B (e2e.bob).

    backend/venv/bin/python scripts/e2e/session.py A           # the token (for curl, or Maestro's FRIEND_TOKEN)
    backend/venv/bin/python scripts/e2e/session.py B --check   # sign in and say who it is, without the token

Reads the accounts from .env.e2e.local at the repo root (ignored by git) and the public Supabase URL
and anon key from mobile/.env. Never prints passwords. Run it with the backend's Python:
the system Python on this Mac has no CA certificates.
"""

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def tls() -> ssl.SSLContext:
    try:
        import certifi
    except ImportError:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def sign_in(account: str) -> tuple[dict, dict]:
    accounts = read_env(ROOT / '.env.e2e.local')
    public = read_env(ROOT / 'mobile/.env')
    email = accounts.get(f'E2E_{account}_EMAIL')
    password = accounts.get(f'E2E_{account}_PASSWORD')
    if not email or not password:
        sys.exit(f'No email or password for account {account} in .env.e2e.local')
    request = urllib.request.Request(
        public['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/') + '/auth/v1/token?grant_type=password',
        data=json.dumps({'email': email, 'password': password}).encode(),
        headers={'apikey': public['EXPO_PUBLIC_SUPABASE_KEY'], 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(request, context=tls(), timeout=20) as response:
            return json.load(response), accounts
    except urllib.error.HTTPError as e:
        sys.exit(f'Sign-in failed for account {account}: HTTP {e.code} {e.read()[:200].decode(errors="replace")}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Print an access token for a test account.')
    parser.add_argument('account', choices=['A', 'B'], help='A = e2e.ana (the phone), B = e2e.bob (the friend)')
    parser.add_argument('--check', action='store_true', help='say who signed in instead of printing the token')
    args = parser.parse_args()
    session, accounts = sign_in(args.account)
    if args.check:
        user = session.get('user') or {}
        print(f"{args.account}: {accounts.get(f'E2E_{args.account}_USERNAME')} ({user.get('email')}) signed in; "
              f"the token lasts {session.get('expires_in')} s")
    else:
        print(session['access_token'])


if __name__ == '__main__':
    main()
