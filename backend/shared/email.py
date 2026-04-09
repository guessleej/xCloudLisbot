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
    msg_section = ""
    if invite_message:
        msg_section = f"""<tr><td style="padding:12px 0;">
            <p style="margin:0;padding:10px 14px;background:#f8f9fa;border-radius:6px;font-size:14px;color:#555;line-height:1.5;">{invite_message}</p>
        </td></tr>"""

    # Simple, professional email template — avoids spam triggers:
    # - No flashy gradient header (triggers marketing/spam filters)
    # - No "分享/邀請" in body (phishing keywords)
    # - Plain text-heavy layout (high text-to-image ratio)
    # - Includes company info in footer (legitimacy signal)
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

        # Plain text version — simple and professional
        perm_label = PERMISSION_LABELS.get(permission, "檢視者")
        plain_text = (
            f"{owner_name} 已將會議記錄提供給您。\n\n"
            f"會議：{meeting_title}\n"
            f"權限：{perm_label}\n"
            f"{('備註：' + invite_message + chr(10)) if invite_message else ''}\n"
            f"開啟會議記錄：{FRONTEND_URL}/meeting/{meeting_id}\n\n"
            f"此郵件由 xCloudLisbot 系統自動發送。"
        )

        # Subject line: professional, no special characters, no "分享/邀請" keywords
        subject = f"{owner_name} - {meeting_title} 會議記錄"

        message = {
            "senderAddress": ACS_SENDER_EMAIL,
            "recipients": {"to": [{"address": to_email}]},
            "content": {
                "subject": subject,
                "plainText": plain_text,
                "html": html_content,
            },
            "headers": {
                "X-Priority": "3",
            },
        }

        poller = client.begin_send(message)
        result = poller.result()
        logger.info(f"Email sent to {to_email}, status: {result['status']}, id: {result['id']}")
        return result["status"] == "Succeeded"

    except Exception as e:
        logger.error(f"Failed to send share email to {to_email}: {e}")
        return False
