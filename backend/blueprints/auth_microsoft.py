"""Microsoft OAuth endpoint."""

import logging
import requests as http_requests
from fastapi import APIRouter, Request, HTTPException

from shared.auth import create_jwt, upsert_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/auth/callback/microsoft")
async def auth_microsoft(request: Request):
    body = await request.json()
    access_token = body.get("accessToken")
    if not access_token:
        raise HTTPException(400, "Missing accessToken")

    graph_res = http_requests.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if not graph_res.ok:
        raise HTTPException(401, "Failed to fetch Microsoft user info")

    g = graph_res.json()
    user = upsert_user("microsoft", g["id"],
        g.get("mail") or g.get("userPrincipalName", ""), g.get("displayName", ""))
    token = create_jwt(user["id"], "microsoft", user["email"])
    return {"token": token, "user": user}
