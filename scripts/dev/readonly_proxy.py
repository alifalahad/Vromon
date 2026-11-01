#!/usr/bin/env python3
"""
Read-only proxy for checking the app on a phone signed in to a real account.

Forwards GET, HEAD and OPTIONS to the development backend and refuses every write
(POST, PUT, PATCH, DELETE) with 403, so a wrong tap can't change the account's data.
Plain HTTP only: the live chat socket (WebSocket) does not pass through it.

    python3 scripts/dev/readonly_proxy.py            # listens on 127.0.0.1:8011
    adb reverse tcp:8001 tcp:8011                    # the phone's backend now goes through it
    ...check the app...
    adb reverse tcp:8001 tcp:8001                    # back to the backend directly

Blocked requests are printed, so you can tell whether the app tried to write.
"""

import argparse
import http.server
import socketserver
import urllib.error
import urllib.request

HOP = {'host', 'connection', 'accept-encoding', 'transfer-encoding', 'content-length', 'content-encoding', 'keep-alive'}


def handler(upstream: str):
    class Handler(http.server.BaseHTTPRequestHandler):
        def _forward(self):
            headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
            req = urllib.request.Request(upstream + self.path, method=self.command, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    status, out, body = r.status, r.getheaders(), r.read()
            except urllib.error.HTTPError as e:
                status, out, body = e.code, list(e.headers.items()), e.read()
            except urllib.error.URLError as e:
                status, out = 502, [('Content-Type', 'application/json')]
                body = f'{{"detail":"read-only test proxy: backend not reachable at {upstream} ({e.reason})"}}'.encode()
            self.send_response(status)
            for k, v in out:
                if k.lower() not in HOP:
                    self.send_header(k, v)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def _refuse(self):
            length = int(self.headers.get('Content-Length') or 0)
            if length:
                self.rfile.read(length)
            body = b'{"detail":"read-only test proxy: writes are blocked"}'
            self.send_response(403)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print('BLOCKED', self.command, self.path, flush=True)

        do_GET = do_HEAD = do_OPTIONS = _forward
        do_POST = do_PUT = do_PATCH = do_DELETE = _refuse

        def log_message(self, fmt, *args):
            pass

    return Handler


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument('--port', type=int, default=8011)
    parser.add_argument('--upstream', default='http://127.0.0.1:8001')
    args = parser.parse_args()
    print(f'read-only proxy on 127.0.0.1:{args.port} -> {args.upstream}', flush=True)
    Server(('127.0.0.1', args.port), handler(args.upstream)).serve_forever()
