import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MemberRead } from '../../api/types'
import {
  allHabits,
  boardRoutes,
  dad,
  family,
  kavi,
  kaviHabits,
  members,
  mia,
  mum,
  session,
} from '../../test/fixtures'
import { json, mockApi, problem, type MockApi } from '../../test/mockApi'
import { renderApp } from '../../test/renderWithProviders'

const noContent = () => new Response(null, { status: 204 })

/** A fake server for Family settings: members can be added, edited and removed. */
function settingsServer(me: MemberRead, start: MemberRead[] = members) {
  const state = { members: start, timezone: family.timezone, acting: me as MemberRead | null }
  const api: MockApi = mockApi({
    ...boardRoutes(me),
    'GET /sessions/current': () => json(session(state.acting)),
    'GET /families/current': () => json({ ...family, timezone: state.timezone }),
    'GET /members': () => json(state.members),
    'GET /habits': () => json(allHabits),
    'PATCH /families/current': (call) => {
      state.timezone = (call.body as { timezone: string }).timezone
      return json({ ...family, timezone: state.timezone })
    },
    'POST /members': (call) => {
      const body = call.body as { nickname: string; avatar_emoji: string; role: MemberRead['role'] }
      const made: MemberRead = {
        id: '10000000-0000-4000-8000-000000000009',
        nickname: body.nickname,
        avatar_emoji: body.avatar_emoji,
        role: body.role,
        gem_balance: 0,
        gems_held: 0,
      }
      state.members = [...state.members, made]
      return json(made, 201)
    },
    'DELETE /sessions/current': () => noContent(),
  })
  for (const m of start) {
    api.use({
      [`PATCH /members/${m.id}`]: (call) => {
        const changes = call.body as Partial<MemberRead>
        const saved = { ...m, ...changes }
        state.members = state.members.map((x) => (x.id === m.id ? saved : x))
        if (state.acting?.id === m.id) state.acting = saved
        return json(saved)
      },
      [`DELETE /members/${m.id}`]: () => {
        state.members = state.members.filter((x) => x.id !== m.id)
        if (state.acting?.id === m.id) state.acting = null
        return noContent()
      },
      [`PUT /members/${m.id}/credentials`]: () => noContent(),
    })
  }
  return { api, state }
}

const membersRegion = () => screen.findByRole('region', { name: 'Family members' })
const card = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement

describe('REQ-006 manage family members', () => {
  it('lists members with their role and the buttons each one gets', async () => {
    settingsServer(mum)
    renderApp({ route: '/parent/settings' })
    await membersRegion()

    expect(within(card('Mum')).getByText('Parent · that’s you')).toBeVisible()
    expect(within(card('Dad')).getByText('Parent')).toBeVisible()
    expect(within(card('Dad')).getByRole('button', { name: 'Edit Dad' })).toBeEnabled()
    expect(within(card('Dad')).queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument()
    expect(within(card('Mia')).getByText('Child')).toBeVisible()
    expect(within(card('Mia')).getByRole('button', { name: 'Reset Mia’s PIN' })).toBeEnabled()
    expect(within(card('Mia')).getByRole('button', { name: 'Remove Mia' })).toBeEnabled()
    expect(screen.getByText('A family always needs at least one parent.')).toBeVisible()
  })

  it('adds a child member with a first PIN', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(screen.getByRole('button', { name: 'Add a member' }))
    const form = screen.getByRole('form', { name: 'Add a member' })
    expect(within(form).getByLabelText('Nickname')).toHaveFocus()
    expect(within(form).getByRole('button', { name: 'Child' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.type(within(form).getByLabelText('Nickname'), 'Zara')
    await user.type(within(form).getByLabelText('Avatar'), '🦊')
    await user.type(within(form).getByLabelText('First PIN'), '2468')
    await user.click(within(form).getByRole('button', { name: 'Add member' }))

    expect(
      await screen.findByText('Zara is in the family! They can check in with their PIN now.'),
    ).toBeVisible()
    expect(api.callsTo('POST /members')[0].body).toEqual({
      nickname: 'Zara',
      avatar_emoji: '🦊',
      role: 'child',
      pin: '2468',
    })
    expect(screen.getByRole('heading', { level: 3, name: 'Zara' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Family members' })).toHaveFocus()
  })

  it('a duplicate nickname is caught in the browser and nothing is sent', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(screen.getByRole('button', { name: 'Add a member' }))
    const form = screen.getByRole('form', { name: 'Add a member' })
    await user.type(within(form).getByLabelText('Nickname'), 'mia')
    await user.click(within(form).getByRole('button', { name: 'Add member' }))

    expect(
      within(form).getByText('Someone in the family already has that nickname — try another one'),
    ).toBeVisible()
    expect(within(form).getByLabelText('Nickname')).toHaveFocus()
    expect(api.callsTo('POST /members')).toHaveLength(0)

    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Add a member' })).toHaveFocus()
  })

  it("a 422 the browser couldn't foresee shows kind copy in the form", async () => {
    const { api } = settingsServer(mum)
    api.use({ 'POST /members': () => problem(422) })
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(screen.getByRole('button', { name: 'Add a member' }))
    const form = screen.getByRole('form', { name: 'Add a member' })
    await user.type(within(form).getByLabelText('Nickname'), 'Nana')
    await user.type(within(form).getByLabelText('Avatar'), '🌷')
    await user.click(within(form).getByRole('button', { name: 'Parent' }))
    await user.type(within(form).getByLabelText('First PIN'), '1357')
    await user.click(within(form).getByRole('button', { name: 'Add member' }))

    expect(
      await within(form).findByText(
        'That didn’t save — check the nickname is new and the avatar is one emoji.',
      ),
    ).toBeVisible()
    expect(api.callsTo('POST /members')[0].body).toMatchObject({ role: 'parent' })
  })

  it('checks the avatar and PIN before sending', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(screen.getByRole('button', { name: 'Add a member' }))
    const form = screen.getByRole('form', { name: 'Add a member' })
    await user.type(within(form).getByLabelText('Nickname'), 'Zara')
    await user.type(within(form).getByLabelText('Avatar'), 'Z')
    await user.click(within(form).getByRole('button', { name: 'Add member' }))
    expect(within(form).getByLabelText('Avatar')).toHaveFocus()
    expect(within(form).getByText('Pick just one emoji')).toBeVisible()

    await user.clear(within(form).getByLabelText('Avatar'))
    await user.type(within(form).getByLabelText('Avatar'), '🦊')
    await user.type(within(form).getByLabelText('First PIN'), '12')
    await user.click(within(form).getByRole('button', { name: 'Add member' }))
    expect(within(form).getByLabelText('First PIN')).toHaveFocus()
    expect(api.callsTo('POST /members')).toHaveLength(0)
  })

  it('edits a member; editing yourself updates the header', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Mum')).getByRole('button', { name: 'Edit Mum' }))
    const form = screen.getByRole('form', { name: 'Edit Mum' })
    expect(within(form).queryByLabelText('First PIN')).not.toBeInTheDocument()
    await user.clear(within(form).getByLabelText('Nickname'))
    await user.type(within(form).getByLabelText('Nickname'), 'Mama')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Mama is saved.')).toBeVisible()
    expect(api.callsTo(`PATCH /members/${mum.id}`)[0].body).toEqual({ nickname: 'Mama' })
    expect(await screen.findByText('Mama (parent)')).toBeVisible()
  })

  it('saving with no changes just closes the form, and Cancel returns focus to Edit', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Mia')).getByRole('button', { name: 'Edit Mia' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('form', { name: 'Edit Mia' })).not.toBeInTheDocument()
    expect(within(card('Mia')).getByRole('button', { name: 'Edit Mia' })).toHaveFocus()

    await user.click(within(card('Mia')).getByRole('button', { name: 'Edit Mia' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(within(card('Mia')).getByRole('button', { name: 'Edit Mia' })).toHaveFocus()
    expect(api.callsTo(`PATCH /members/${mia.id}`)).toHaveLength(0)
  })

  it('the only parent stays a parent and has no Remove', async () => {
    settingsServer(mum, [mum, mia, kavi])
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    expect(within(card('Mum')).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    await user.click(within(card('Mum')).getByRole('button', { name: 'Edit Mum' }))
    const form = screen.getByRole('form', { name: 'Edit Mum' })
    expect(within(form).queryByRole('button', { name: 'Child' })).not.toBeInTheDocument()
    expect(within(form).getByText('The only parent stays a parent.')).toBeVisible()
  })

  it('a refused role change (422) shows kind copy', async () => {
    const { api } = settingsServer(mum)
    api.use({ [`PATCH /members/${dad.id}`]: () => problem(422) })
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Dad')).getByRole('button', { name: 'Edit Dad' }))
    const form = screen.getByRole('form', { name: 'Edit Dad' })
    await user.click(within(form).getByRole('button', { name: 'Child' }))
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByText(/That didn’t save/)).toBeVisible()
    expect(api.callsTo(`PATCH /members/${dad.id}`)[0].body).toEqual({ role: 'child' })
  })
})

describe('REQ-007 remove a member', () => {
  it('the confirmation lists what is deleted and needs a second tap', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    const remove = within(card('Kavi')).getByRole('button', { name: 'Remove Kavi' })
    await user.click(remove)
    const dialog = screen.getByRole('alertdialog', { name: 'Remove Kavi from the family?' })
    const items = within(dialog)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toEqual([
      `${kaviHabits.length} habits and every check-in`,
      'All streak savers',
      'Gem history and a balance of 1 gem',
      'Prize claims, waiting or decided',
      'Kavi’s PIN',
      'Notes about changes parents made for Kavi',
    ])
    expect(
      within(dialog).getByText(
        'Things Kavi did for others, like approvals, stay and show “a family member”.',
      ),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Keep Kavi' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Keep Kavi' }))
    expect(within(card('Kavi')).getByRole('button', { name: 'Remove Kavi' })).toHaveFocus()
    expect(api.callsTo(`DELETE /members/${kavi.id}`)).toHaveLength(0)

    await user.click(within(card('Kavi')).getByRole('button', { name: 'Remove Kavi' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove Kavi' }))
    expect(await screen.findByText('Kavi is removed from the family.')).toBeVisible()
    expect(api.callsTo(`DELETE /members/${kavi.id}`)).toHaveLength(1)
    expect(screen.queryByRole('heading', { level: 3, name: 'Kavi' })).not.toBeInTheDocument()
  })

  it('a refused removal (422) says a family needs a parent', async () => {
    const { api } = settingsServer(mum)
    api.use({ [`DELETE /members/${dad.id}`]: () => problem(422) })
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Dad')).getByRole('button', { name: 'Remove Dad' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove Dad' }))
    await waitFor(() =>
      expect(screen.getAllByText('A family always needs at least one parent.')).toHaveLength(2),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('another failure keeps everything and says so', async () => {
    const { api } = settingsServer(mum)
    api.use({ [`DELETE /members/${mia.id}`]: () => problem(500) })
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Mia')).getByRole('button', { name: 'Remove Mia' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove Mia' }))
    expect(await screen.findByText("We couldn't do that just now. Please try again.")).toBeVisible()
  })

  it('a parent who removes themselves goes back to the board', async () => {
    settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Mum')).getByRole('button', { name: 'Remove Mum' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove Mum' }))
    expect(await screen.findByRole('heading', { name: "Who's checking in?" })).toBeVisible()
  })
})

describe('REQ-005 a parent resets a child’s PIN', () => {
  it('needs no current PIN, and checks the two copies match first', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Mia')).getByRole('button', { name: 'Reset Mia’s PIN' }))
    const form = screen.getByRole('form', { name: 'New PIN for Mia' })
    expect(within(form).queryByLabelText('Current PIN')).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText('New PIN'), '1111')
    await user.type(within(form).getByLabelText('Type the new PIN again'), '2222')
    await user.click(within(form).getByRole('button', { name: 'Save Mia’s PIN' }))
    expect(
      within(form).getByText('Those two PINs don’t match yet — try typing the new one again'),
    ).toBeVisible()
    expect(within(form).getByLabelText('Type the new PIN again')).toHaveFocus()
    expect(api.callsTo(`PUT /members/${mia.id}/credentials`)).toHaveLength(0)

    await user.clear(within(form).getByLabelText('Type the new PIN again'))
    await user.type(within(form).getByLabelText('Type the new PIN again'), '1111')
    await user.click(within(form).getByRole('button', { name: 'Save Mia’s PIN' }))

    expect(await screen.findByText(/Mia’s new PIN is saved/)).toBeVisible()
    expect(api.callsTo(`PUT /members/${mia.id}/credentials`)[0].body).toEqual({ pin: '1111' })
  })

  it('a bad format and a failed save are explained', async () => {
    const { api } = settingsServer(mum)
    api.use({ [`PUT /members/${kavi.id}/credentials`]: () => problem(500) })
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Kavi')).getByRole('button', { name: 'Reset Kavi’s PIN' }))
    const form = screen.getByRole('form', { name: 'New PIN for Kavi' })
    await user.type(within(form).getByLabelText('New PIN'), '12a')
    await user.click(within(form).getByRole('button', { name: 'Save Kavi’s PIN' }))
    expect(within(form).getByText('The PIN needs exactly 4 numbers')).toBeVisible()

    await user.clear(within(form).getByLabelText('New PIN'))
    await user.type(within(form).getByLabelText('New PIN'), '4321')
    await user.type(within(form).getByLabelText('Type the new PIN again'), '4321')
    await user.click(within(form).getByRole('button', { name: 'Save Kavi’s PIN' }))
    expect(await screen.findByText("We couldn't do that just now. Please try again.")).toBeVisible()

    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(within(card('Kavi')).getByRole('button', { name: 'Reset Kavi’s PIN' })).toHaveFocus()
  })
})

describe('REQ-010 a child’s habits from Family settings', () => {
  it("opens the child's list in parent mode", async () => {
    settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(within(card('Kavi')).getByRole('link', { name: 'Kavi’s habits' }))
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/habits')
    expect(await screen.findByText('You’re changing Kavi’s habits')).toBeVisible()
  })
})

describe('REQ-027 family timezone', () => {
  it('saves a new timezone; Save is off until it changes', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    const select = screen.getByRole('combobox', { name: 'Family timezone' })
    expect(select).toHaveValue('Europe/London')
    expect(select).toHaveAccessibleDescription(expect.stringContaining('Past check-ins keep'))
    const save = screen.getByRole('button', { name: 'Save timezone' })
    expect(save).toBeDisabled()

    await user.selectOptions(select, 'America/New_York')
    await user.click(save)
    expect(await screen.findByText('Saved! Days and weeks now follow New York.')).toBeVisible()
    expect(api.callsTo('PATCH /families/current')[0].body).toEqual({
      timezone: 'America/New_York',
    })
    expect(select).toHaveValue('America/New_York')
    expect(save).toBeDisabled()
  })

  it('a refused timezone (422) shows kind copy', async () => {
    const { api } = settingsServer(mum)
    api.use({ 'PATCH /families/current': () => problem(422) })
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Family timezone' }),
      'Asia/Tokyo',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Family timezone' }),
      'Europe/London',
    )
    expect(screen.getByRole('button', { name: 'Save timezone' })).toBeDisabled()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Family timezone' }),
      'Asia/Tokyo',
    )
    await user.click(screen.getByRole('button', { name: 'Save timezone' }))
    expect(
      await screen.findByText('That timezone didn’t save — try a nearby city instead.'),
    ).toBeVisible()
  })
})

describe('REQ-002 sign this device out', () => {
  it('ends the session and shows Passcode entry', async () => {
    const { api } = settingsServer(mum)
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(screen.getByRole('button', { name: 'Sign this device out' }))
    expect(await screen.findByLabelText('Family passcode')).toBeVisible()
    expect(api.callsTo('DELETE /sessions/current')).toHaveLength(1)
    expect(screen.queryByText(/signed out to keep things safe/)).not.toBeInTheDocument()
  })

  it('a failed sign-out stays put and says so', async () => {
    const { api } = settingsServer(mum)
    api.use({ 'DELETE /sessions/current': () => problem(500) })
    const { user } = renderApp({ route: '/parent/settings' })
    await membersRegion()

    await user.click(screen.getByRole('button', { name: 'Sign this device out' }))
    expect(await screen.findByText("We couldn't do that just now. Please try again.")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign this device out' })).toBeEnabled()
  })
})

describe('REQ-028 family settings are for parents only', () => {
  it('a load failure offers Try again', async () => {
    const { api } = settingsServer(dad)
    api.use({ 'GET /habits': () => problem(500) })
    const { user } = renderApp({ route: '/parent/settings' })

    expect(await screen.findByText("We couldn't load this just now.")).toBeVisible()
    api.use({ 'GET /habits': () => json(allHabits) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await membersRegion()).toBeInTheDocument()
  })
})
