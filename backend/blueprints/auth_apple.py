"""xCloud Lisbot — Apple Sign In (stub)."""

from fastapi import APIRouter

from shared.responses import error

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/apple/callback")
async def apple_callback():
    """Apple Sign In is not yet implemented."""
    return error("Apple login not implemented", 501)
