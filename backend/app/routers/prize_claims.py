"""Prize claims (REQ-025, REQ-026)."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.models import ClaimStatus
from app.routers.deps import R401, R403, R404, R422, FamilyCtx, MemberCtx, r409
from app.schemas.prize_claim import PrizeClaimCreate, PrizeClaimRead, PrizeClaimUpdate
from app.services import claims

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prize-claims", tags=["prize-claims"])


@router.get(
    "",
    response_model=list[PrizeClaimRead],
    summary="List prize claims, newest first",
    responses={401: R401, 422: R422},
)
def list_claims(
    ctx: FamilyCtx,
    claim_status: Annotated[ClaimStatus | None, Query(alias="status")] = None,
    member_id: UUID | None = None,
) -> list[PrizeClaimRead]:
    rows = claims.list_claims(ctx, claim_status, member_id)
    return [PrizeClaimRead.from_row(c, ctx) for c in rows]


@router.post(
    "",
    response_model=PrizeClaimRead,
    status_code=status.HTTP_201_CREATED,
    summary="Claim a prize for yourself; its cost is held until a parent decides",
    responses={
        401: R401,
        403: R403,
        404: R404,
        409: r409("Not enough gems yet"),
        422: R422,
    },
)
def create_claim(body: PrizeClaimCreate, ctx: MemberCtx) -> PrizeClaimRead:
    row = claims.claim(ctx, body.prize_id)
    logger.info("prize claimed claim_id=%s by=%s", row.id, ctx.acting.id)
    return PrizeClaimRead.from_row(row, ctx)


@router.patch(
    "/{claim_id}",
    response_model=PrizeClaimRead,
    summary="Approve or decline a claim (parents), or cancel your own",
    responses={
        401: R401,
        403: R403,
        404: R404,
        409: r409("The claim isn't pending any more"),
        422: R422,
    },
)
def update_claim(claim_id: UUID, body: PrizeClaimUpdate, ctx: MemberCtx) -> PrizeClaimRead:
    row = claims.decide(ctx, claim_id, ClaimStatus(body.status))
    logger.info("prize claim %s claim_id=%s by=%s", row.status.value, row.id, ctx.acting.id)
    return PrizeClaimRead.from_row(row, ctx)
