from __future__ import annotations

import base64
import hashlib
import hmac
import time

TOKEN_TTL_SECONDS = 2 * 60 * 60


def hash_api_key(api_key: str) -> str:
    """Return the sha256 hex digest LiteLLM stores for a plaintext API key."""
    return hashlib.sha256(api_key.strip().encode("utf-8")).hexdigest()


def _signature(payload: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256)
    return base64.urlsafe_b64encode(digest.digest()).decode("ascii").rstrip("=")


def issue_token(
    key_hash: str,
    secret: str,
    *,
    now: float | None = None,
    scope: str = "self",
    team_id: str = "",
    gateway: str = "",
    employee_id: str = "",
) -> tuple[str, int]:
    """Issue a short-lived access token bound to a key hash.

    Payload: key_hash:expiry:scope:team_id:gateway:employee_id，
    整体由 HMAC 签名覆盖，任何部分都无法篡改。
    """
    issued_at = int(now if now is not None else time.time())
    expires_at = issued_at + TOKEN_TTL_SECONDS
    payload = f"{key_hash}:{expires_at}:{scope}:{team_id}:{gateway}:{employee_id}"
    encoded_payload = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{encoded_payload}.{_signature(payload, secret)}", expires_at


def verify_token(token: str, secret: str, *, now: float | None = None) -> dict | None:
    """Return the authenticated key identity for a valid token, else None.

    兼容旧版两段式 token（key_hash:expiry），视为 scope=self。
    """
    try:
        encoded_payload, signature = token.split(".", 1)
        payload = base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4))
        parts = payload.decode("utf-8").split(":")
        if len(parts) == 2:
            key_hash, raw_expires_at = parts
            scope, team_id = "self", ""
            gateway, employee_id = "", ""
        elif len(parts) == 4:
            key_hash, raw_expires_at, scope, team_id = parts
            gateway, employee_id = "", ""
        elif len(parts) == 6:
            (
                key_hash,
                raw_expires_at,
                scope,
                team_id,
                gateway,
                employee_id,
            ) = parts
        else:
            return None
        expires_at = int(raw_expires_at)
    except (ValueError, TypeError, UnicodeDecodeError):
        return None

    if not hmac.compare_digest(_signature(payload.decode("utf-8"), secret), signature):
        return None

    current = now if now is not None else time.time()
    if current >= expires_at:
        return None

    result = {"key_hash": key_hash, "scope": scope, "team_id": team_id}
    if gateway or employee_id:
        result.update({"gateway": gateway, "employee_id": employee_id})
    return result
