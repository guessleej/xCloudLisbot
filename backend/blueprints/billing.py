"""XMeet AI — Billing & subscription endpoints."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import Invoice, Meeting, Subscription, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])

# ── Default plan constants ────────────────────────────────────────────────────
_FREE_PLAN = dict(
    plan_name="免費試用",
    price_per_seat=0.0,
    seats_total=1,
    upload_total_min=300,
    next_invoice_date=None,
    next_amount=0.0,
    card_last4=None,
    card_brand=None,
    status="active",
)


async def _get_or_create_subscription(user: User, session: AsyncSession) -> Subscription:
    result = await session.execute(
        select(Subscription).where(Subscription.user_id == user.id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        now = datetime.now(timezone.utc)
        sub = Subscription(
            id=str(uuid.uuid4()),
            user_id=user.id,
            created_at=now,
            updated_at=now,
            **_FREE_PLAN,
        )
        session.add(sub)
        try:
            await session.commit()
            await session.refresh(sub)
        except IntegrityError:
            await session.rollback()
            result = await session.execute(
                select(Subscription).where(Subscription.user_id == user.id)
            )
            sub = result.scalar_one()
    return sub


async def _upload_used_this_month(user_id: str, session: AsyncSession) -> int:
    """Sum duration (minutes) of completed meetings created this calendar month."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = await session.execute(
        select(
            func.coalesce(
                func.sum(
                    func.extract("epoch", Meeting.end_time - Meeting.start_time) / 60
                ),
                0,
            )
        ).where(
            Meeting.user_id == user_id,
            Meeting.status == "completed",
            Meeting.created_at >= month_start,
            Meeting.start_time.isnot(None),
            Meeting.end_time.isnot(None),
        )
    )
    return int(result.scalar_one() or 0)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/plan")
@limiter.limit("30/minute")
async def get_plan(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _get_or_create_subscription(user, session)
    upload_used = await _upload_used_this_month(user.id, session)

    return ok({
        "planName":       sub.plan_name,
        "pricePerSeat":   sub.price_per_seat,
        "seatsUsed":      1,
        "seatsTotal":     sub.seats_total,
        "uploadUsedMin":  upload_used,
        "uploadTotalMin": sub.upload_total_min,
        "nextInvoice":    sub.next_invoice_date,
        "nextAmount":     sub.next_amount,
        "cardLast4":      sub.card_last4,
        "cardBrand":      sub.card_brand,
        "status":         sub.status,
    })


@router.get("/invoices")
@limiter.limit("30/minute")
async def get_invoices(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Invoice)
        .where(Invoice.user_id == user.id)
        .order_by(Invoice.date.desc())
    )
    invoices = result.scalars().all()
    return ok([
        {
            "id":          inv.invoice_no,
            "date":        inv.date,
            "description": inv.description,
            "qty":         inv.qty,
            "period":      inv.period,
            "amount":      inv.amount,
            "status":      inv.status,
        }
        for inv in invoices
    ])


class SeatsBody(BaseModel):
    seats: int = Field(ge=1, le=500)


@router.post("/seats")
@limiter.limit("10/minute")
async def update_seats(
    request: Request,
    body: SeatsBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _get_or_create_subscription(user, session)
    if body.seats < 1:
        return error("Seats must be at least 1", 400)

    sub.seats_total = body.seats
    sub.next_amount = round(sub.price_per_seat * body.seats, 2)
    sub.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(sub)

    logger.info(f"User {user.id} updated seats to {body.seats}")
    return ok({"seatsTotal": sub.seats_total, "nextAmount": sub.next_amount})


@router.post("/upgrade-inquiry")
@limiter.limit("5/minute")
async def upgrade_inquiry(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Log an upgrade inquiry. In production this would trigger a CRM notification."""
    logger.info(f"Upgrade inquiry from user {user.id} ({user.email})")
    return ok({"message": "已收到您的升級需求，業務將於 1 個工作天內與您聯絡。"})


@router.get("/invoices/{invoice_no}/download")
@limiter.limit("20/minute")
async def download_invoice(
    request: Request,
    invoice_no: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Invoice).where(Invoice.invoice_no == invoice_no, Invoice.user_id == user.id)
    )
    inv = result.scalar_one_or_none()
    if inv is None:
        return error("Invoice not found", 404)

    content = "\n".join([
        "=" * 48,
        "        XMeet AI — 發票",
        "=" * 48,
        f"發票編號  : {inv.invoice_no}",
        f"日期      : {inv.date}",
        f"帳戶      : {user.email}",
        "-" * 48,
        f"項目      : {inv.description}",
        f"數量      : {inv.qty} 人",
        f"期間      : {inv.period}",
        "-" * 48,
        f"金額      : US$ {inv.amount:.2f}",
        f"狀態      : {'已付款' if inv.status == 'paid' else inv.status}",
        "=" * 48,
        "感謝您使用 XMeet AI",
    ])

    return PlainTextResponse(
        content=content,
        headers={
            "Content-Disposition": f'attachment; filename="{inv.invoice_no}.txt"',
        },
    )
