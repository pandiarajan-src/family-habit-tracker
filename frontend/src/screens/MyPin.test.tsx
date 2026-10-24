import { act, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { boardRoutes, mia } from '../test/fixtures'
import { mockApi, passcode401, pin401, problem } from '../test/mockApi'
import { renderApp } from '../test/renderWithProviders'

const ROUTE = `PUT /members/${mia.id}/credentials`

async function openMyPin() {
  const api = mockApi({ ...boardRoutes(mia), [ROUTE]: () => new Response(null, { status: 204 }) })
  const view = renderApp({ route: '/my-pin' })
  await screen.findByRole('heading', { level: 1, name: 'My PIN' })
  return { api, ...view }
}

const current = () => screen.getByLabelText('Current PIN')
const next = () => screen.getByLabelText('New PIN')
const again = () => screen.getByLabelText('Type the new PIN again')
const save = () => screen.getByRole('button', { name: 'Save my PIN' })

describe('REQ-005 change my own PIN', () => {
  it('shows the three PIN fields, the 4-number hint and the forgot-PIN note', async () => {
    await openMyPin()

    for (const field of [current(), next(), again()]) {
      expect(field).toHaveAttribute('type', 'password')
      expect(field).toHaveAttribute('inputMode', 'numeric')
      expect(field).toHaveAttribute('maxLength', '4')
    }
    expect(next()).toHaveAccessibleDescription('Exactly 4 numbers')
    expect(screen.getByText('Forgot your PIN?')).toBeVisible()
    expect(screen.getByText('A parent can reset it for you in Family settings.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to my habits' })).toHaveAttribute(
      'href',
      '/habits',
    )
  })

  it('sits under the My habits tab, where it is reached from', async () => {
    await openMyPin()

    const tabs = screen.getByRole('navigation', { name: 'Main' })
    expect(within(tabs).getByRole('link', { name: 'My habits' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(tabs).getByRole('link', { name: 'My day' })).not.toHaveAttribute('aria-current')
  })

  it('sends the new PIN with the current one, then clears the form', async () => {
    const { user, api } = await openMyPin()

    await user.type(current(), '1234')
    await user.type(next(), '5678')
    await user.type(again(), '5678')
    await user.click(save())

    expect(
      await screen.findByText('Your new PIN is saved! Use it next time you check in.'),
    ).toBeVisible()
    expect(api.callsTo(ROUTE)[0].body).toEqual({ pin: '5678', current_pin: '1234' })
    expect(current()).toHaveValue('')
    expect(next()).toHaveValue('')
    expect(again()).toHaveValue('')
  })

  it('PINs that don’t match get a kind message and nothing is sent', async () => {
    const { user, api } = await openMyPin()

    await user.type(current(), '1234')
    await user.type(next(), '5678')
    await user.type(again(), '5679')
    await user.click(save())

    expect(
      screen.getByText('Those two PINs don’t match yet — try typing the new one again'),
    ).toBeVisible()
    expect(again()).toHaveAttribute('aria-invalid', 'true')
    expect(again()).toHaveFocus()
    expect(api.callsTo(ROUTE)).toHaveLength(0)
  })

  it.each([
    ['current', '12', '5678', 'Type your current PIN — it’s 4 numbers'],
    ['new', '1234', '12a4', 'Your new PIN needs exactly 4 numbers'],
  ])('a %s PIN that isn’t 4 numbers is caught before sending', async (_, cur, pin, message) => {
    const { user, api } = await openMyPin()

    await user.type(current(), cur)
    await user.type(next(), pin)
    await user.type(again(), pin)
    await user.click(save())

    expect(screen.getByText(message)).toBeVisible()
    expect(api.callsTo(ROUTE)).toHaveLength(0)
  })

  it('a wrong current PIN (401 MemberPIN) clears that field and stays here', async () => {
    const { user, api } = await openMyPin()
    api.use({ [ROUTE]: pin401 })

    await user.type(current(), '9999')
    await user.type(next(), '5678')
    await user.type(again(), '5678')
    await user.click(save())

    expect(await screen.findByText('That current PIN didn’t match — have another go')).toBeVisible()
    expect(current()).toHaveValue('')
    expect(current()).toHaveFocus()
    expect(next()).toHaveValue('5678')
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/my-pin')
  })

  it('a 429 pauses the form and suggests asking a parent', async () => {
    const { user, api } = await openMyPin()
    api.use({ [ROUTE]: () => problem(429) })

    await user.type(current(), '9999')
    await user.type(next(), '5678')
    await user.type(again(), '5678')
    await user.click(save())

    expect(
      await screen.findByText('Let’s take a break — ask a parent, or try again in 5 minutes.'),
    ).toBeVisible()
    expect(save()).toBeDisabled()
    expect(current()).toBeDisabled()
  })

  it('the form opens again when the lockout ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = mockApi({
      ...boardRoutes(mia),
      [ROUTE]: () => problem(429, { 'Retry-After': '60' }),
    })
    const { user } = renderApp({ route: '/my-pin', fakeTimers: true })
    await screen.findByRole('heading', { level: 1, name: 'My PIN' })

    await user.type(current(), '9999')
    await user.type(next(), '5678')
    await user.type(again(), '5678')
    await user.click(save())
    expect(
      await screen.findByText('Let’s take a break — ask a parent, or try again in 1 minute.'),
    ).toBeVisible()

    act(() => vi.advanceTimersByTime(60_000))

    expect(save()).toBeEnabled()
    expect(screen.queryByText(/Let’s take a break/)).not.toBeInTheDocument()
    expect(api.callsTo(ROUTE)).toHaveLength(1)
  })

  it('an ended session (401 FamilyPasscode) goes to Passcode entry', async () => {
    const { user, api } = await openMyPin()
    api.use({ [ROUTE]: passcode401, 'GET /sessions/current': passcode401 })

    await user.type(current(), '1234')
    await user.type(next(), '5678')
    await user.type(again(), '5678')
    await user.click(save())

    expect(await screen.findByRole('button', { name: 'Unlock' })).toBeVisible()
  })

  it('any other failure asks to try again', async () => {
    const { user, api } = await openMyPin()
    api.use({ [ROUTE]: () => problem(500) })

    await user.type(current(), '1234')
    await user.type(next(), '5678')
    await user.type(again(), '5678')
    await user.click(save())

    expect(
      await screen.findByText("We couldn't save your PIN just now. Please try again."),
    ).toBeVisible()
    expect(save()).toBeEnabled()
  })
})
