"""Fernet-based encryption helpers for sensitive DB fields (e.g. calendar tokens).

Usage:
    from shared.crypto import encrypt_json, decrypt_json

    encrypted = encrypt_json({"access_token": "...", "refresh_token": "..."})
    original  = decrypt_json(encrypted)

If CALENDAR_TOKEN_ENCRYPTION_KEY is not set (development), the data is stored
as plain JSON with a startup warning — never silently drops data.
"""

import json
import logging

from shared.config import CALENDAR_TOKEN_ENCRYPTION_KEY, ENVIRONMENT

_log = logging.getLogger(__name__)
_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is not None:
        return _fernet
    if not CALENDAR_TOKEN_ENCRYPTION_KEY:
        if ENVIRONMENT == "production":
            raise RuntimeError(
                "CALENDAR_TOKEN_ENCRYPTION_KEY must be set in production. "
                "Generate with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _log.warning("CALENDAR_TOKEN_ENCRYPTION_KEY not set — calendar tokens stored as plaintext (dev only)")
        return None
    from cryptography.fernet import Fernet
    _fernet = Fernet(CALENDAR_TOKEN_ENCRYPTION_KEY.encode())
    return _fernet


def encrypt_json(data: dict) -> dict:
    """Return {encrypted: '<ciphertext>'} or the original dict if no key configured."""
    f = _get_fernet()
    if f is None:
        return data
    plaintext = json.dumps(data).encode()
    return {"encrypted": f.encrypt(plaintext).decode()}


def decrypt_json(stored: dict | None) -> dict | None:
    """Decrypt a stored token dict.  Returns None for None input."""
    if stored is None:
        return None
    if "encrypted" not in stored:
        # Plaintext (dev mode or old unencrypted record) — return as-is
        return stored
    f = _get_fernet()
    if f is None:
        _log.error("Cannot decrypt token: CALENDAR_TOKEN_ENCRYPTION_KEY not set")
        return None
    try:
        return json.loads(f.decrypt(stored["encrypted"].encode()))
    except Exception as exc:
        _log.error(f"Token decryption failed: {exc}")
        return None
