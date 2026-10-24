import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { kavi, kaviHabits, mia, miaHabits, mum } from '../test/fixtures'
import { habitServer } from '../test/habitServer'
import { problem } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'

const [reading, , , piano] = miaHabits
const path = () => screen.getByLabelText('Current path')

async function openNew(route = '/habits/new') {
  const server = habitServer(mia, [...miaHabits])
  const view = renderApp({ route })
  await screen.findByRole('heading', { level: 1, name: 'Add a habit' })
  return { ...server, ...view }
}

async function openEdit(title: string, id: string) {
  const server = habitServer(mia, [...miaHabits])
  const view = renderApp({ route: `/habits/${id}` })
  await screen.findByRole('heading', { level: 1, name: `Edit ${title}` })
  return { ...server, ...view }
}

describe('REQ-008 create a habit', () => {
  it('creates a weekly "Piano, 3 times a week" and returns to My habits', async () => {
    const { user, api } = await openNew()

    await user.type(screen.getByLabelText('Title'), 'Piano')
    await user.type(screen.getByLabelText(/Goal note/), '15 minutes')
    await user.click(screen.getByRole('button', { name: 'Weekly' }))
    await user.selectOptions(screen.getByLabelText('Times per week'), '3 times')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Piano is on the list. Have fun with it!')).toBeVisible()
    expect(api.callsTo('POST /habits')[0].body).toEqual({
      member_id: mia.id,
      title: 'Piano',
      goal_note: '15 minutes',
      frequency: 'weekly',
      weekly_target: 3,
    })
    expect(path()).toHaveTextContent(/^\/habits$/)
    expect(screen.getByText('6 of 20 active habits')).toBeInTheDocument()
  })

  it('a daily habit has no target, and a blank goal note is left out', async () => {
    const { user, api } = await openNew()

    expect(screen.getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Times per week')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Title'), '  Stretch  ')
    await user.type(screen.getByLabelText(/Goal note/), '   ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Stretch is on the list. Have fun with it!')
    expect(api.callsTo('POST /habits')[0].body).toEqual({
      member_id: mia.id,
      title: 'Stretch',
      goal_note: null,
      frequency: 'daily',
    })
  })

  it('keeps the title to 40 characters and the goal note to 60', async () => {
    await openNew()

    expect(screen.getByLabelText('Title')).toHaveAttribute('maxLength', '40')
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Up to 40 characters')
    expect(screen.getByLabelText(/Goal note/)).toHaveAttribute('maxLength', '60')
  })

  it('a missing title gets a kind nudge and nothing is sent', async () => {
    const { user, api } = await openNew()

    await user.type(screen.getByLabelText('Title'), '   ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const title = screen.getByLabelText('Title')
    expect(screen.getByText('Give your habit a name')).toBeVisible()
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveFocus()
    expect(api.callsTo('POST /habits')).toHaveLength(0)

    await user.type(title, 'Read')
    expect(screen.queryByText('Give your habit a name')).not.toBeInTheDocument()
  })

  it('the 20-habit limit (422) is explained, and the form stays', async () => {
    const { user, api } = await openNew()
    api.use({ 'POST /habits': () => problem(422) })

    await user.type(screen.getByLabelText('Title'), 'Juggling')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(
        "That's 20 active habits — the most there can be. Archive one to make room for a new one.",
      ),
    ).toBeVisible()
    expect(screen.getByLabelText('Title')).toHaveValue('Juggling')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('any other failure asks to try again', async () => {
    const { user, api } = await openNew()
    api.use({ 'POST /habits': () => problem(500) })

    await user.type(screen.getByLabelText('Title'), 'Juggling')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText("We couldn't save that just now. Please try again."),
    ).toBeVisible()
  })

  it('Cancel goes back to My habits without saving', async () => {
    const { user, api } = await openNew()

    await user.type(screen.getByLabelText('Title'), 'Juggling')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'My habits' })).toBeVisible()
    expect(api.callsTo('POST /habits')).toHaveLength(0)
  })
})

describe('REQ-009 edit, archive or delete a habit', () => {
  it('shows the habit as it is, with how often fixed', async () => {
    await openEdit('Piano', piano.id)

    expect(screen.getByLabelText('Title')).toHaveValue('Piano')
    expect(screen.getByLabelText(/Goal note/)).toHaveValue('15 minutes')
    expect(screen.getByLabelText('Times per week')).toHaveDisplayValue('3 times')
    expect(screen.getByText('To change how often, add a new habit.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Daily' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Times per week')).toHaveAccessibleDescription(
      'A new target counts from this week. Past weeks keep theirs.',
    )
  })

  it('saves a new title, goal and target', async () => {
    const { user, api } = await openEdit('Piano', piano.id)

    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Piano practice')
    await user.clear(screen.getByLabelText(/Goal note/))
    await user.selectOptions(screen.getByLabelText('Times per week'), '4 times')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Piano practice is saved.')).toBeVisible()
    expect(api.callsTo(`PATCH /habits/${piano.id}`)[0].body).toEqual({
      title: 'Piano practice',
      goal_note: null,
      weekly_target: 4,
    })
    expect(screen.getByText('4 times a week')).toBeVisible()
  })

  it('a daily habit is saved without a target', async () => {
    const { user, api } = await openEdit('Reading', reading.id)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Reading is saved.')
    expect(api.callsTo(`PATCH /habits/${reading.id}`)[0].body).toEqual({
      title: 'Reading',
      goal_note: '20 minutes',
    })
  })

  it('Archive puts the habit to rest and returns to the list', async () => {
    const { user, api } = await openEdit('Reading', reading.id)

    await user.click(screen.getByRole('button', { name: 'Archive' }))

    expect(
      await screen.findByText('Reading is resting in Archived. Its history is kept.'),
    ).toBeVisible()
    expect(api.callsTo(`PATCH /habits/${reading.id}`)[0].body).toEqual({ archived: true })
    const archived = within(screen.getByRole('region', { name: 'Archived' }))
    expect(archived.getByRole('heading', { name: 'Reading' })).toBeVisible()
  })

  it('an archived habit offers Bring back instead, with the 20 limit explained', async () => {
    const resting = { ...reading, archived: true, archived_on: '2026-10-01' }
    const { api } = habitServer(mia, [resting])
    const { user } = renderApp({ route: `/habits/${reading.id}` })
    await screen.findByRole('heading', { level: 1, name: 'Edit Reading' })
    api.use({ [`PATCH /habits/${reading.id}`]: () => problem(422) })

    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bring back' }))

    expect(await screen.findByText(/That's 20 active habits/)).toBeVisible()
  })

  it('Bring back from the editor returns to the list with the habit active', async () => {
    const resting = { ...reading, archived: true, archived_on: '2026-10-01' }
    const { api } = habitServer(mia, [resting])
    const { user } = renderApp({ route: `/habits/${reading.id}` })
    await screen.findByRole('heading', { level: 1, name: 'Edit Reading' })

    await user.click(screen.getByRole('button', { name: 'Bring back' }))

    expect(
      await screen.findByText('Reading is back! Its streak starts again from today.'),
    ).toBeVisible()
    expect(api.callsTo(`PATCH /habits/${reading.id}`)[0].body).toEqual({ archived: false })
    expect(screen.getByText('1 of 20 active habits')).toBeInTheDocument()
  })

  it('Delete asks first; "Keep" sends nothing and puts focus back', async () => {
    const { user, api } = await openEdit('Piano', piano.id)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Piano for good?' })
    expect(dialog).toHaveAccessibleDescription(
      'This removes all of Piano’s check-ins and streak savers. Gems already spent stay spent, and earned gems are worked out again. If you might want it later, archive it instead.',
    )
    expect(within(dialog).getByRole('button', { name: 'Keep Piano' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Keep Piano' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.callsTo(`DELETE /habits/${piano.id}`)).toHaveLength(0)
    await expect.poll(() => screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('Escape closes the confirmation too', async () => {
    const { user } = await openEdit('Piano', piano.id)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('"Yes, delete" removes the habit and returns to the list', async () => {
    const { user, api } = await openEdit('Piano', piano.id)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete Piano' }))

    expect(await screen.findByText('Piano is deleted.')).toBeVisible()
    expect(api.callsTo(`DELETE /habits/${piano.id}`)).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Piano' })).not.toBeInTheDocument()
  })

  it('a habit removed meanwhile says it is gone', async () => {
    const { user, api } = await openEdit('Piano', piano.id)
    api.use({ [`DELETE /habits/${piano.id}`]: () => problem(404) })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete Piano' }))

    expect(await screen.findByText("That habit isn't here any more.")).toBeVisible()
  })

  it('an unknown habit id says it is gone, with a way back', async () => {
    habitServer(mia, [], { 'GET /habits/unknown': () => problem(404) })
    renderApp({ route: '/habits/unknown' })

    expect(await screen.findByText("That habit isn't here any more.")).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my habits' })).toHaveAttribute(
      'href',
      '/habits',
    )
  })

  it('a load failure offers a retry', async () => {
    const { api } = habitServer(mia, [...miaHabits])
    api.use({ [`GET /habits/${piano.id}`]: () => problem(500) })
    const { user } = renderApp({ route: `/habits/${piano.id}` })

    await screen.findByText("We couldn't load the habits just now.")
    api.use({ [`GET /habits/${piano.id}`]: () => Response.json(piano) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit Piano' })).toBeVisible()
  })
})

describe('REQ-010 a parent changes a child’s habits', () => {
  it('adds a habit for the child, with the banner, and returns to the child’s list', async () => {
    const { api } = habitServer(mum, [...kaviHabits])
    const { user } = renderApp({ route: `/habits/new?member=${kavi.id}` })

    await screen.findByRole('heading', { level: 1, name: 'Add a habit for Kavi' })
    expect(screen.getByText('You’re changing Kavi’s habits')).toBeVisible()
    await user.type(screen.getByLabelText('Title'), 'Water')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Kavi’s habits' })).toBeVisible()
    expect(api.callsTo('POST /habits')[0].body).toMatchObject({ member_id: kavi.id })
    expect(path()).toHaveTextContent(/^\/habits$/)
    expect(screen.getByText('Water is on the list. Have fun with it!')).toBeVisible()
  })

  it('edits a child’s habit from a link without ?member', async () => {
    const [tidy] = kaviHabits
    const { api } = habitServer(mum, [...kaviHabits])
    const { user } = renderApp({ route: `/habits/${tidy.id}` })

    await screen.findByRole('heading', { level: 1, name: 'Edit Tidy room' })
    expect(screen.getByText('You’re changing Kavi’s habits')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to Kavi’s habits' })).toHaveAttribute(
      'href',
      `/habits?member=${kavi.id}`,
    )
    await user.type(screen.getByLabelText(/Goal note/), '10 minutes')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Tidy room is saved.')
    expect(api.callsTo(`PATCH /habits/${tidy.id}`)[0].body).toMatchObject({
      goal_note: '10 minutes',
    })
  })

  it('a child opening a sibling’s habit sees whose it is and no form', async () => {
    const [tidy] = kaviHabits
    habitServer(mia, [...kaviHabits])
    renderApp({ route: `/habits/${tidy.id}` })

    expect(await screen.findByText('Only Kavi can change Kavi’s habits.')).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
