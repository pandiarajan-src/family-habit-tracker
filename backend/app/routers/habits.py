"""Habits with their streaks, weekly progress and saveable days (REQ-008 to REQ-010, REQ-016,
REQ-017, REQ-020, REQ-022)."""

import logging
from uuid import UUID

from fastapi import APIRouter, Response, status

from app.routers.deps import R401, R403, R404, R422, FamilyCtx, MemberCtx
from app.schemas.habit import HabitCreate, HabitRead, HabitUpdate
from app.services import habits

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/habits", tags=["habits"])


@router.get(
    "",
    response_model=list[HabitRead],
    summary="List habits, optionally for one member and including archived ones",
    responses={401: R401, 422: R422},
)
def list_habits(
    ctx: FamilyCtx, member_id: UUID | None = None, include_archived: bool = False
) -> list[HabitRead]:
    return [HabitRead.from_view(v) for v in habits.list_habits(ctx, member_id, include_archived)]


@router.post(
    "",
    response_model=HabitRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a habit for yourself, or for a child (parents)",
    responses={
        401: R401,
        403: R403,
        404: {"description": "Member not found in this family"},
        422: {"description": "Invalid habit, or the member already has 20 active habits"},
    },
)
def create_habit(body: HabitCreate, ctx: MemberCtx) -> HabitRead:
    view = habits.create(
        ctx, body.member_id, body.title, body.goal_note, body.frequency, body.weekly_target
    )
    logger.info("habit created habit_id=%s by=%s", view.habit.id, ctx.acting.id)
    return HabitRead.from_view(view)


@router.get(
    "/{habit_id}",
    response_model=HabitRead,
    summary="Get one habit with its streak and progress",
    responses={401: R401, 404: R404},
)
def read_habit(habit_id: UUID, ctx: FamilyCtx) -> HabitRead:
    return HabitRead.from_view(habits.get_view(ctx, habit_id))


@router.patch(
    "/{habit_id}",
    response_model=HabitRead,
    summary="Rename, change the goal or weekly target, archive or bring back a habit",
    responses={401: R401, 403: R403, 404: R404, 422: R422},
)
def update_habit(habit_id: UUID, body: HabitUpdate, ctx: MemberCtx) -> HabitRead:
    changes = body.model_dump(exclude_unset=True)
    view = habits.update(
        ctx,
        habit_id,
        title=changes.get("title"),
        weekly_target=changes.get("weekly_target"),
        archived=changes.get("archived"),
        goal_note=changes.get("goal_note", habits.UNSET),
    )
    logger.info("habit updated habit_id=%s by=%s", habit_id, ctx.acting.id)
    return HabitRead.from_view(view)


@router.delete(
    "/{habit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a habit with its check-ins and savers; spent gems stay spent",
    responses={401: R401, 403: R403, 404: R404},
)
def delete_habit(habit_id: UUID, ctx: MemberCtx) -> Response:
    habits.delete(ctx, habit_id)
    logger.info("habit deleted habit_id=%s by=%s", habit_id, ctx.acting.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
