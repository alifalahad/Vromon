"""
Vromon Backend — authentication (Supabase Auth, decision D1).

The app signs in with Supabase; every API request carries the Supabase access
token as `Authorization: Bearer <jwt>`. Tokens are verified locally against the
project's JWKS (asymmetric ES256/RS256 signing keys), checking signature, expiry,
issuer and audience. Keys are cached for at most 10 minutes, as Supabase advises,
and refetched when a token names an unknown key.

`get_current_user` maps the token's `sub` to a `users` row, creating it on first
use. Legacy HS256 (shared-secret) projects are not supported: switch the project
to asymmetric JWT signing keys in the Supabase dashboard.
"""

from __future__ import annotations

import logging
import secrets
import ssl
from typing import Any, Callable

import certifi
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models.models import Trip, User

logger = logging.getLogger("vromon.auth")

ALGORITHMS = ["ES256", "RS256"]
JWKS_CACHE_SECONDS = 600
DEV_BYPASS_SUBJECT = "dev-bypass"
# Unambiguous characters for human-typed codes (no 0/O, 1/I/L)
FRIEND_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
FRIEND_CODE_LENGTH = 8

_jwks_client: jwt.PyJWKClient | None = None


def _jwks_signing_key(token: str) -> Any:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(
            f"{settings.supabase_issuer}/.well-known/jwks.json",
            cache_jwk_set=True,
            lifespan=JWKS_CACHE_SECONDS,
            # certifi's CA bundle: some Python builds (e.g. python.org on macOS) ship without
            # system root certificates, which made every key download fail.
            ssl_context=ssl.create_default_context(cafile=certifi.where()),
        )
    return _jwks_client.get_signing_key_from_jwt(token).key


# Tests replace this to verify tokens signed with a local key.
signing_key_resolver: Callable[[str], Any] = _jwks_signing_key


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def verify_access_token(token: str) -> dict:
    """Return the verified claims of a Supabase access token, or raise 401."""
    if not settings.auth_configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Sign-in is not configured on this server")
    try:
        key = signing_key_resolver(token)
        return jwt.decode(
            token,
            key,
            algorithms=ALGORITHMS,
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Session expired")
    except jwt.PyJWKClientConnectionError as exc:
        # Our problem, not the token's: a 401 here would make the app sign the user out.
        logger.error("Could not fetch the Supabase signing keys: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="The sign-in service can't be reached; try again shortly")
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        logger.info("Rejected access token: %s", type(exc).__name__)
        raise _unauthorized("Invalid access token")


def new_friend_code() -> str:
    return "".join(secrets.choice(FRIEND_CODE_ALPHABET) for _ in range(FRIEND_CODE_LENGTH))


def _claim_pre_account_trips(db: Session, user: User) -> None:
    """
    Decision D4 (development only): the first account adopts the trips created
    before accounts existed. The DEV_AUTH_BYPASS user is a stand-in, so the first
    real (signed-in) account also inherits whatever the dev user had.
    """
    if settings.app_env == "production":
        return
    other_real_accounts = select(User.id).where(User.id != user.id, User.auth_subject != DEV_BYPASS_SUBJECT).limit(1)
    if db.scalar(other_real_accounts) is not None:
        return
    adoptable = Trip.user_id.is_(None)
    if user.auth_subject != DEV_BYPASS_SUBJECT:
        dev_user = select(User.id).where(User.auth_subject == DEV_BYPASS_SUBJECT).scalar_subquery()
        adoptable = adoptable | (Trip.user_id == dev_user)
    claimed = db.query(Trip).filter(adoptable).update({Trip.user_id: user.id}, synchronize_session=False)
    if claimed:
        logger.info("Account %s adopted %d earlier trip(s)", user.id, claimed)


def get_or_create_user(db: Session, subject: str, email: str | None) -> User:
    user = db.scalar(select(User).where(User.auth_subject == subject))
    if user is not None:
        if email and user.email != email:
            user.email = email
            db.commit()
        return user
    for _ in range(5):
        user = User(auth_subject=subject, email=email, friend_code=new_friend_code())
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(User).where(User.auth_subject == subject))
            if existing is not None:  # created concurrently by another request
                return existing
            continue  # friend code collision: try another
        _claim_pre_account_trips(db, user)
        db.commit()
        db.refresh(user)
        return user
    raise HTTPException(status_code=500, detail="Could not create the account; try again")


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """The signed-in user (401 without a valid token)."""
    token = _bearer_token(request)
    if token is None:
        if settings.dev_auth_bypass and settings.app_env == "development":
            return get_or_create_user(db, DEV_BYPASS_SUBJECT, None)
        raise _unauthorized("Sign in required")
    claims = verify_access_token(token)
    return get_or_create_user(db, str(claims["sub"]), claims.get("email"))
