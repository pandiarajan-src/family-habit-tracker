import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dad, habit, kavi, kaviHabits, mia, miaHabits, mum } from '../test/fixtures'
import { habitServer } from '../test/habitServer'
import { json, problem } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'

const swimming = habit(mia, {
  title: 'Swimming',
  archived: true,
  archived_on: '2026-07-13',
  best_streak: 14,
})

const list = (name: string) =>
  within(screen.getByRole('region', { name })).queryAllByRole('listitem')
const path = () => screen.getByLabelText('Current path')

async function openMine() {
  const server = habitServer(mia, [...miaHabits, swimming])
  const view = renderApp({ route: '/habits' })
  await screen.findByRole('heading', { level: 1, name: 'My habits' })
  return { ...server, ...view }
}

describe('REQ-008 My habits lists what I track', () => {
  it('shows the active count out of 20, and Add a habit opens the editor', async () => {
    const { user } = await openMine()

    expect(screen.getByText('5 of 20 active habits')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Add a habit' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Add a habit' })).toBeVisible()
    expect(path()).toHaveTextContent('/habits/new')
  })

  it('describes each habit by its goal and how often', async () => {
    await openMine()

    const active = list('Active')
    expect(active.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Reading',
      'Exercise',
      'Water',
      'Piano',
      'Family time',
    ])
    expect(within(active[0]).getByText('20 minutes · Every day')).toBeInTheDocument()
    expect(within(active[3]).getByText('15 minutes · 3 times a week')).toBeInTheDocument()
    expect(within(active[4]).getByText('Once a week')).toBeInTheDocument()
  })

  it('says so kindly when there are no habits yet', async () => {
    habitServer(mia, [])
    renderApp({ route: '/habits' })

    expect(await screen.findByText('No habits yet. Add your first one!')).toBeInTheDocument()
    expect(screen.getByText('0 of 20 active habits')).toBeInTheDocument()
  })

  it('offers a retry when the list cannot load', async () => {
    const { api } = habitServer(mia, miaHabits, { 'GET /habits': () => problem(500) })
    const { user } = renderApp({ route: '/habits' })

    await screen.findByText("We couldn't load the habits just now.")
    api.use({ 'GET /habits': () => json(miaHabits) })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Reading' })).toBeInTheDocument()
  })
})

describe('REQ-009 edit, archive and bring back from My habits', () => {
  it('each Edit link names its habit and opens the editor', async () => {
    const { user } = await openMine()

    await user.click(screen.getByRole('link', { name: 'Edit Piano' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit Piano' })).toBeVisible()
    expect(path()).toHaveTextContent(`/habits/${miaHabits[3].id}`)
  })

  it('archived habits rest below with their best streak and Bring back', async () => {
    await openMine()

    const [resting] = list('Archived')
    expect(within(resting).getByText('Archived on Mon 13 Jul · best streak 14 days')).toBeVisible()
    expect(
      screen.getByText(
        'Resting habits keep their history. Bring one back and it starts again from today.',
      ),
    ).toBeVisible()
  })

  it('Bring back moves a habit to Active and says its streak starts again', async () => {
    const { user, api } = await openMine()

    await user.click(screen.getByRole('button', { name: 'Bring back Swimming' }))

    expect(
      await screen.findByText('Swimming is back! Its streak starts again from today.'),
    ).toBeVisible()
    expect(api.callsTo(`PATCH /habits/${swimming.id}`)[0].body).toEqual({ archived: false })
    expect(list('Active')).toHaveLength(6)
    expect(list('Archived')).toHaveLength(0)
    expect(screen.getByText('6 of 20 active habits')).toBeInTheDocument()
  })

  it('Bring back at 20 active habits explains the limit', async () => {
    const { user, api } = await openMine()
    api.use({ [`PATCH /habits/${swimming.id}`]: () => problem(422) })

    await user.click(screen.getByRole('button', { name: 'Bring back Swimming' }))

    expect(await screen.findByText(/That's 20 active habits — the most there can be/)).toBeVisible()
    expect(list('Archived')).toHaveLength(1)
  })

  it('Bring back that fails for another reason asks to try again', async () => {
    const { user, api } = await openMine()
    api.use({ [`PATCH /habits/${swimming.id}`]: () => problem(500) })

    await user.click(screen.getByRole('button', { name: 'Bring back Swimming' }))

    expect(
      await screen.findByText("We couldn't save that just now. Please try again."),
    ).toBeVisible()
  })
})

describe('REQ-005 My habits links to My PIN', () => {
  it('Change my PIN opens My PIN', async () => {
    const { user } = await openMine()

    expect(screen.getByText('Your PIN keeps your check-ins yours.')).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Change my PIN' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'My PIN' })).toBeVisible()
  })
})

describe('REQ-010 a parent opens a child’s habits', () => {
  it('shows the child’s list with the banner, and asks only for the child’s habits', async () => {
    const { api } = habitServer(mum, [...kaviHabits])
    renderApp({ route: `/habits?member=${kavi.id}` })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kavi’s habits' })).toBeVisible()
    expect(screen.getByText('You’re changing Kavi’s habits')).toBeVisible()
    expect(
      screen.getByText('Kavi will see a note on My day for every change you make.'),
    ).toBeVisible()
    expect(api.callsTo('GET /habits').at(-1)?.query.get('member_id')).toBe(kavi.id)
    expect(screen.getByRole('link', { name: 'Add a habit' })).toHaveAttribute(
      'href',
      `/habits/new?member=${kavi.id}`,
    )
    expect(screen.getByRole('link', { name: 'Edit Tidy room' })).toHaveAttribute(
      'href',
      `/habits/${kaviHabits[0].id}?member=${kavi.id}`,
    )
    // The PIN link is the parent's own; resetting a child's PIN lives in Family settings.
    expect(screen.queryByRole('link', { name: 'Change my PIN' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Family settings' })).toHaveAttribute(
      'href',
      '/parent/settings',
    )
  })

  it.each([
    ['a parent asking for the other parent', mum, dad],
    ['a child asking for a sibling', mia, kavi],
  ])('%s gets their own list instead', async (_, acting, other) => {
    const { api } = habitServer(acting, [])
    renderApp({ route: `/habits?member=${other.id}` })

    expect(await screen.findByRole('heading', { level: 1, name: 'My habits' })).toBeVisible()
    expect(screen.queryByText(/You’re changing/)).not.toBeInTheDocument()
    expect(api.callsTo('GET /habits').at(-1)?.query.get('member_id')).toBe(acting.id)
  })
})
