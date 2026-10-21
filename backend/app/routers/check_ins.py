"""Check-ins (REQ-011 to REQ-014, REQ-023)."""

import logging
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Response, status

from app.routers.deps import R401, R403, R404, FamilyCtx, FromDate, MemberCtx, ToDate, r409
from app.schemas.check_in import CheckInCreate, CheckInRead
from app.services import check_ins

logger = logging.getLogger(__name__)

router = APIRouter(tags=["check-ins"])

_WINDOW_422 = {
    "description": "Outside the window: only today and yesterday for your own habits; "
    "never a future day or a day before the habit was created"
}


@router.put(
    "/habits/{habit_id}/check-ins/{day}",
    response_model=CheckInRead,
    status_code=status.HTTP_201_CREATED,
    summary="Check off a habit for a day (repeats return the same check-in)",
    responses={
        200: {"model": CheckInRead, "description": "Already checked in: the existing check-in"},
        401: R401,
        403: R403,
        404: R404,
        409: r409("That day was saved with a streak saver"),
        422: _WINDOW_422,
    },
)
def put_check_in(
    habit_id: UUID,
    day: date,
    response: Response,
    ctx: MemberCtx,
    body: Annotated[CheckInCreate | None, Body()] = None,
) -> CheckInRead:
    row, created = check_ins.check_in(ctx, habit_id, day)
    if created:
        logger.info("check-in added habit_id=%s by=%s", habit_id, ctx.acting.id)
    else:
        response.status_code = status.HTTP_200_OK
    return CheckInRead.from_row(row, ctx)


@router.delete(
    "/habits/{habit_id}/check-ins/{day}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Undo a check-in (no-op if there is none)",
    responses={401: R401, 403: R403, 404: R404, 422: _WINDOW_422},
)
def delete_check_in(habit_id: UUID, day: date, ctx: MemberCtx) -> Response:
    check_ins.undo(ctx, habit_id, day)
    logger.info("check-in removed habit_id=%s by=%s", habit_id, ctx.acting.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/check-ins",
    response_model=list[CheckInRead],
    summary="Check-ins in a date range of up to 62 days (History)",
    responses={401: R401, 422: {"description": "Range over 62 days, or `to` before `from`"}},
)
def list_check_ins(
    ctx: FamilyCtx,
    from_: FromDate,
    to: ToDate,
    member_id: UUID | None = None,
) -> list[CheckInRead]:
    return [CheckInRead.from_row(r, ctx) for r in check_ins.list_range(ctx, from_, to, member_id)]
