"""Changes a parent made to a child's data (REQ-015)."""

import logging
from uuid import UUID

from fastapi import APIRouter

from app.routers.deps import R401, R403, R404, R422, MemberCtx
from app.schemas.adjustment import AdjustmentRead, AdjustmentUpdate
from app.services import adjustments

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/adjustments", tags=["adjustments"])


@router.get(
    "",
    response_model=list[AdjustmentRead],
    summary="The last 12 months of changes to a member's data, newest first",
    responses={401: R401, 403: R403, 404: R404, 422: R422},
)
def list_adjustments(ctx: MemberCtx, member_id: UUID | None = None) -> list[AdjustmentRead]:
    """Defaults to the acting member. A parent can see anyone's; a child only their own."""
    return [AdjustmentRead.from_row(a, ctx) for a in adjustments.list_for(ctx, member_id)]


@router.patch(
    "/{adjustment_id}",
    response_model=AdjustmentRead,
    summary='Dismiss a change notice ("Got it"); only the member it is about',
    responses={401: R401, 403: R403, 404: R404, 422: R422},
)
def acknowledge_adjustment(
    adjustment_id: UUID, body: AdjustmentUpdate, ctx: MemberCtx
) -> AdjustmentRead:
    row = adjustments.acknowledge(ctx, adjustment_id)
    logger.info("adjustment acknowledged adjustment_id=%s", row.id)
    return AdjustmentRead.from_row(row, ctx)
