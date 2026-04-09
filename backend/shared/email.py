"""Email notification via Azure Communication Services."""

import os
import logging

logger = logging.getLogger(__name__)

ACS_CONNECTION_STRING = os.environ.get("ACS_CONNECTION_STRING", "")
ACS_SENDER_EMAIL = os.environ.get("ACS_SENDER_EMAIL", "meet@bi.cloudinfo.com.tw")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

PERMISSION_LABELS = {"view": "檢視者", "edit": "編輯者"}


def _build_share_email_html(
    meeting_title: str, meeting_id: str, owner_name: str,
    permission: str, invite_message: str,
) -> str:
    perm_label = PERMISSION_LABELS.get(permission, "檢視者")
    meeting_url = f"{FRONTEND_URL}/meeting/{meeting_id}"
    msg_block = f'<div style="background:#f3f0ff;border-left:3px solid #6366f1;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;font-size:14px;color:#374151;">{invite_message}</div>' if invite_message else ""

    return f"""<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 24px;text-align:center;">
    <h1 style="color:#fff;font-size:20px;margin:0;">會議記錄已與您分享</h1>
  </div>
  <div style="padding:24px;">
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      <strong>{owner_name}</strong> 邀請您以<strong>「{perm_label}」</strong>身份查看會議記錄：
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0;">{meeting_title}</p>
    </div>
    {msg_block}
    <a href="{meeting_url}" style="display:block;text-align:center;background:#6366f1;color:#fff;padding:14px 24px;border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;margin:24px 0;">
      查看會議記錄
    </a>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:16px 0 0;">
      您需要使用此 Email 地址登入 xCloudLisbot 才能存取。
    </p>
  </div>
  <div style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #f1f5f9;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">xCloudLisbot — AI 會議智慧記錄系統</p>
  </div>
</div>
</body>
</html>"""


def send_share_notification(
    to_email: str,
    meeting_title: str,
    meeting_id: str,
    owner_name: str,
    permission: str = "view",
    invite_message: str = "",
) -> bool:
    """Send share notification email via Azure Communication Services.
    Returns True on success, False on failure. Never raises — email failure must not block sharing."""
    if not ACS_CONNECTION_STRING:
        logger.warning("ACS_CONNECTION_STRING not set — skipping email notification")
        return False

    try:
        from azure.communication.email import EmailClient

        client = EmailClient.from_connection_string(ACS_CONNECTION_STRING)

        html_content = _build_share_email_html(
            meeting_title, meeting_id, owner_name, permission, invite_message,
        )
        plain_text = (
            f"{owner_name} 邀請您查看會議記錄「{meeting_title}」。\n"
            f"權限：{PERMISSION_LABELS.get(permission, '檢視者')}\n"
            f"{invite_message + chr(10) if invite_message else ''}"
            f"連結：{FRONTEND_URL}/meeting/{meeting_id}\n"
            f"請使用此 Email 登入 xCloudLisbot 存取。"
        )

        message = {
            "senderAddress": ACS_SENDER_EMAIL,
            "recipients": {"to": [{"address": to_email}]},
            "content": {
                "subject": f"「{meeting_title}」會議記錄已與您分享",
                "plainText": plain_text,
                "html": html_content,
            },
        }

        poller = client.begin_send(message)
        result = poller.result()
        logger.info(f"Email sent to {to_email}, status: {result['status']}, id: {result['id']}")
        return result["status"] == "Succeeded"

    except Exception as e:
        logger.error(f"Failed to send share email to {to_email}: {e}")
        return False
