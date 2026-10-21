"""Prizes (REQ-024): parents manage them, everyone sees them."""

import logging
from uuid import UUID

from fastapi import APIRouter, Response, status

from app.routers.deps import R401, R403, R404, R422, FamilyCtx, MemberCtx, r409
from app.schemas.prize import PrizeCreate, PrizeRead, PrizeUpdate
from app.services import claims

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prizes", tags=["prizes"])


@router.get(
    "",
    response_model=list[PrizeRead],
    summary="List the family's prizes, cheapest first",
    responses={401: R401},
)
def list_prizes(ctx: FamilyCtx) -> list[PrizeRead]:
    return [PrizeRead.from_row(p) for p in claims.list_prizes(ctx)]


@router.post(
    "",
    response_model=PrizeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a prize (parents only)",
    responses={401: R401, 403: R403, 422: R422},
)
def create_prize(body: PrizeCreate, ctx: MemberCtx) -> PrizeRead:
    prize = claims.create_prize(ctx, body.title, body.gem_cost)
    logger.info("prize created prize_id=%s by=%s", prize.id, ctx.acting.id)
    return PrizeRead.from_row(prize)


@router.patch(
    "/{prize_id}",
    response_model=PrizeRead,
    summary="Edit a prize (parents only); pending claims keep their cost",
    responses={401: R401, 403: R403, 404: R404, 422: R422},
)
def update_prize(prize_id: UUID, body: PrizeUpdate, ctx: MemberCtx) -> PrizeRead:
    prize = claims.update_prize(ctx, prize_id, body.title, body.gem_cost)
    logger.info("prize updated prize_id=%s by=%s", prize.id, ctx.acting.id)
    return PrizeRead.from_row(prize)


@router.delete(
    "/{prize_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a prize (parents only); past claims keep its title and cost",
    responses={
        401: R401,
        403: R403,
        404: R404,
        409: r409("A claim for this prize is waiting for a decision"),
    },
)
def delete_prize(prize_id: UUID, ctx: MemberCtx) -> Response:
    claims.delete_prize(ctx, prize_id)
    logger.info("prize deleted prize_id=%s by=%s", prize_id, ctx.acting.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
