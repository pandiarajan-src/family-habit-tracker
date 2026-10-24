// A fake server for My habits and the Habit editor: habits live in `state`, so a create,
// edit, archive or delete changes what the next GET returns, as the real API would.
import type { HabitCreate, HabitRead, HabitUpdate, MemberRead } from '../api/types'
import { boardRoutes, habit } from './fixtures'
import { json, mockApi, type MockApi, type Routes } from './mockApi'

export interface HabitServer {
  api: MockApi
  state: { habits: HabitRead[] }
}

const TODAY = '2026-10-20'

function patched(h: HabitRead, body: HabitUpdate): HabitRead {
  const next = { ...h }
  if (body.title != null) next.title = body.title
  if (body.goal_note !== undefined) next.goal_note = body.goal_note
  if (body.weekly_target != null) next.weekly_target = body.weekly_target
  if (body.archived != null) {
    next.archived = body.archived
    next.archived_on = body.archived ? TODAY : null
  }
  return next
}

export function habitServer(
  acting: MemberRead,
  habits: HabitRead[],
  routes: Routes = {},
): HabitServer {
  const state = { habits: [...habits] }
  const api = mockApi({
    ...boardRoutes(acting),
    'GET /habits': (call) =>
      json(
        state.habits.filter(
          (h) =>
            h.member_id === call.query.get('member_id') &&
            (call.query.get('include_archived') === 'true' || !h.archived),
        ),
      ),
    'POST /habits': (call) => {
      const body = call.body as HabitCreate
      const created = habit({ id: body.member_id } as MemberRead, {
        title: body.title,
        goal_note: body.goal_note ?? null,
        frequency: body.frequency,
        weekly_target: body.weekly_target ?? null,
        created_on: TODAY,
      })
      state.habits.push(created)
      api.use(habitRoutes(created.id))
      return json(created, 201)
    },
  })

  function habitRoutes(id: string): Routes {
    const find = () => state.habits.find((h) => h.id === id)
    return {
      [`GET /habits/${id}`]: () => {
        const h = find()
        return h ? json(h) : json({ detail: 'Not found' }, 404)
      },
      [`PATCH /habits/${id}`]: (call) => {
        const h = find()
        if (!h) return json({ detail: 'Not found' }, 404)
        const next = patched(h, call.body as HabitUpdate)
        state.habits = state.habits.map((x) => (x.id === id ? next : x))
        return json(next)
      },
      [`DELETE /habits/${id}`]: () => {
        state.habits = state.habits.filter((h) => h.id !== id)
        return new Response(null, { status: 204 })
      },
    }
  }

  for (const h of habits) api.use(habitRoutes(h.id))
  api.use(routes)
  return { api, state }
}
