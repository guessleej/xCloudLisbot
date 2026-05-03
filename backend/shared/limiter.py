"""Shared slowapi limiter instance — imported by main.py and individual routers.

Set REDIS_URL to a Redis connection string (e.g. redis://redis:6379/0) to enable
distributed rate limiting across multiple instances. Without it, limits are tracked
per-process and do not aggregate across pods — unsuitable for horizontal scaling.
"""

import logging
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_log = logging.getLogger(__name__)

_REDIS_URL = os.environ.get("REDIS_URL", "")

if _REDIS_URL:
    limiter = Limiter(key_func=get_remote_address, storage_uri=_REDIS_URL)
    _log.info("Rate limiter: Redis-backed (%s)", _REDIS_URL.split("@")[-1])
else:
    if os.environ.get("ENVIRONMENT") == "production":
        _log.warning(
            "REDIS_URL not set — rate limiter is in-memory. "
            "This does not enforce limits across multiple instances. "
            "Set REDIS_URL=redis://<host>:6379/0 for production deployments."
        )
    limiter = Limiter(key_func=get_remote_address)
