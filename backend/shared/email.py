"""Email notification via Microsoft Graph API.

Uses a shared mailbox (meet@cloudinfo.com.tw) with Mail.Send Application permission.
Emails are routed through Exchange Online, which has better deliverability than ACS.
"""

import os
import logging
import requests

logger = logging.getLogger(__name__)

GRAPH_TENANT_ID = os.environ.get("GRAPH_TENANT_ID", "")
GRAPH_CLIENT_ID = os.environ.get("GRAPH_CLIENT_ID", "")
GRAPH_CLIENT_SECRET = os.environ.get("GRAPH_CLIENT_SECRET", "")
GRAPH_SENDER_EMAIL = os.environ.get("GRAPH_SENDER_EMAIL", "meet@cloudinfo.com.tw")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

PERMISSION_LABELS = {"view": "檢視者", "edit": "編輯者"}

# Token cache (module-level)
_token_cache = {"access_token": None, "expires_at": 0}


def _get_access_token() -> str | None:
    """Get a cached Graph API access token via client credentials flow."""
    import time
    now = time.time()
    if _token_cache["access_token"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["access_token"]

    if not (GRAPH_TENANT_ID and GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET):
        logger.warning("Graph API credentials not configured")
        return None

    try:
        resp = requests.post(
            f"https://login.microsoftonline.com/{GRAPH_TENANT_ID}/oauth2/v2.0/token",
            data={
                "client_id": GRAPH_CLIENT_ID,
                "client_secret": GRAPH_CLIENT_SECRET,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["access_token"] = data["access_token"]
        _token_cache["expires_at"] = now + data.get("expires_in", 3600)
        return _token_cache["access_token"]
    except Exception as e:
        logger.error(f"Failed to get Graph access token: {e}")
        return None


def _build_share_email_html(
    meeting_title: str, meeting_id: str, owner_name: str,
    permission: str, invite_message: str, share_token: str = None,
) -> str:
    perm_label = PERMISSION_LABELS.get(permission, "檢視者")
    # Prefer public link if share_token is provided — recipient doesn't need to login
    meeting_url = f"{FRONTEND_URL}/shared/{share_token}" if share_token else f"{FRONTEND_URL}/meeting/{meeting_id}"
    msg_section = ""
    if invite_message:
        msg_section = f"""<tr><td style="padding:12px 0;">
            <p style="margin:0;padding:10px 14px;background:#f8f9fa;border-radius:6px;font-size:14px;color:#555;line-height:1.5;">{invite_message}</p>
        </td></tr>"""

    return f"""<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding:24px 20px 16px;">
        <p style="margin:0;font-size:15px;color:#333;line-height:1.6;">
            {owner_name} 已將會議記錄提供給您：
        </p>
    </td></tr>
    <tr><td style="padding:0 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;">
            <tr><td style="padding:14px 16px;">
                <p style="margin:0;font-size:15px;font-weight:600;color:#212529;">{meeting_title}</p>
                <p style="margin:6px 0 0;font-size:13px;color:#6c757d;">權限：{perm_label}</p>
            </td></tr>
        </table>
    </td></tr>
    {msg_section}
    <tr><td style="padding:20px;">
        <table cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#4f46e5;border-radius:6px;">
                <a href="{meeting_url}" style="display:inline-block;padding:10px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                    開啟會議記錄
                </a>
            </td></tr>
        </table>
    </td></tr>
    <tr><td style="padding:0 20px 24px;">
        <p style="margin:0;font-size:12px;color:#adb5bd;line-height:1.5;">
            此郵件由 xCloudLisbot 系統自動發送。如有疑問，請聯繫 {owner_name}。
        </p>
    </td></tr>
    <tr><td style="padding:12px 20px;border-top:1px solid #f1f3f5;">
        <p style="margin:0;font-size:11px;color:#ced4da;text-align:center;">
            xCloudinfo Corp. | xCloudLisbot AI Meeting Assistant
        </p>
    </td></tr>
</table>
</body>
</html>"""


def send_share_notification(
    to_email: str,
    meeting_title: str,
    meeting_id: str,
    owner_name: str,
    permission: str = "view",
    invite_message: str = "",
    share_token: str = None,
) -> bool:
    """Send share notification email via Microsoft Graph API.
    If share_token is provided, the email link uses the public URL (/shared/{token}),
    allowing recipients to view the meeting without logging in.
    Returns True on success, False on failure. Never raises."""
    token = _get_access_token()
    if not token:
        return False

    try:
        html_content = _build_share_email_html(
            meeting_title, meeting_id, owner_name, permission, invite_message, share_token,
        )
        subject = f"{owner_name} - {meeting_title} 會議記錄"

        message = {
            "message": {
                "subject": subject,
                "body": {"contentType": "HTML", "content": html_content},
                "toRecipients": [{"emailAddress": {"address": to_email}}],
            },
            "saveToSentItems": "true",
        }

        resp = requests.post(
            f"https://graph.microsoft.com/v1.0/users/{GRAPH_SENDER_EMAIL}/sendMail",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=message,
            timeout=15,
        )

        if resp.status_code == 202:
            logger.info(f"Email sent via Graph API to {to_email}")
            return True
        else:
            logger.error(f"Graph sendMail failed {resp.status_code}: {resp.text[:300]}")
            return False

    except Exception as e:
        logger.error(f"Failed to send email via Graph to {to_email}: {e}")
        return False
