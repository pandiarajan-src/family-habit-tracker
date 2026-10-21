"""Streak savers (REQ-020, REQ-023)."""

import logging
from uuid import UUID

from fastapi import APIRouter, status

from app.routers.deps import R401, R403, R404, FamilyCtx, FromDate, MemberCtx, ToDate, r409
from app.schemas.streak_saver import StreakSaverCreate, StreakSaverRead
from app.services import savers

logger = logging.getLogger(__name__)

router = APIRouter(tags=["streak-savers"])


@router.post(
    "/habits/{habit_id}/streak-savers",
    response_model=StreakSaverRead,
    status_code=status.HTTP_201_CREATED,
    summary="Spend gems to save a past day (or last week) so the streak carries on",
    responses={
        401: R401,
        403: R403,
        404: R404,
        409: r409("Not enough gems, or that day is already checked in"),
        422: {"description": "That day or week can't be saved (REQ-020)"},
    },
)
def use_streak_saver(habit_id: UUID, body: StreakSaverCreate, ctx: MemberCtx) -> StreakSaverRead:
    saver = savers.use(ctx, habit_id, body.period_start)
    logger.info(
        "streak saver used saver_id=%s habit_id=%s by=%s", saver.id, habit_id, ctx.acting.id
    )
    return StreakSaverRead.from_row(saver, ctx)


@router.get(
    "/streak-savers",
    response_model=list[StreakSaverRead],
    summary="Streak savers in a date range of up to 62 days (History)",
    responses={401: R401, 422: {"description": "Range over 62 days, or `to` before `from`"}},
)
def list_streak_savers(
    ctx: FamilyCtx,
    from_: FromDate,
    to: ToDate,
    member_id: UUID | None = None,
) -> list[StreakSaverRead]:
    rows = savers.list_range(ctx, from_, to, member_id)
    return [StreakSaverRead.from_row(r, ctx) for r in rows]
