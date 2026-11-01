"""
Vromon Backend — a cap on the size of request bodies (docs/friends-chat-plan.md, step 10).

Nothing else limits them: Starlette reads a whole body into memory before an endpoint
sees it, so one huge request could use up the server's memory. A JSON body may be up to
MAX_JSON_BYTES (real ones, such as a trip with its must-dos, are a few KB); a photo
upload (multipart) up to the photo limit plus room for the form around it.

Too big: 413, before anything is read when Content-Length says so, or as soon as a body
sent without one (chunked) passes the cap. FastAPI passes an HTTPException raised while
it reads the body straight through, so the app gets a 413 and not a 400.
"""

from __future__ import annotations

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_JSON_BYTES = 1024 * 1024
# The multipart form around a photo: its boundaries, headers and other fields
FORM_OVERHEAD_BYTES = 64 * 1024

TOO_LARGE = "This request is too large"


class BodySizeLimit:
    def __init__(self, app: ASGIApp, *, max_bytes: int, max_upload_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.max_upload_bytes = max_upload_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":  # the socket has its own cap (live.py)
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        upload = headers.get(b"content-type", b"").lower().startswith(b"multipart/form-data")
        limit = self.max_upload_bytes if upload else self.max_bytes
        declared = headers.get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await JSONResponse({"detail": TOO_LARGE}, status_code=413)(scope, receive, send)
            return
        seen = 0

        async def capped() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    raise HTTPException(status_code=413, detail=TOO_LARGE)
            return message

        await self.app(scope, capped, send)
