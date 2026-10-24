import { describe, expect, it } from 'vitest'
import { dad, habit, kavi, members, mia, mum, weekly } from '../test/fixtures'
import {
  emptyForm,
  formFromHabit,
  frequencyText,
  goalNoteValue,
  habitFormError,
  habitMeta,
  habitOwner,
  ownerQuery,
  pinFormError,
} from './habits'

describe('REQ-010 whose habits a screen shows', () => {
  it('a parent asking for a child works on the child’s habits', () => {
    const owner = habitOwner(mum, members, kavi.id)
    expect(owner).toEqual({ member: kavi, parentMode: true })
    expect(ownerQuery(owner)).toBe(`?member=${kavi.id}`)
  })

  it.each([
    ['nobody asked for', mum, null],
    ['the other parent', mum, dad.id],
    ['themselves', mum, mum.id],
    ['an unknown id', mum, 'nope'],
    ['a sibling, by a child', mia, kavi.id],
  ])('%s falls back to their own habits', (_, me, requested) => {
    const owner = habitOwner(me, members, requested)
    expect(owner).toEqual({ member: me, parentMode: false })
    expect(ownerQuery(owner)).toBe('')
  })

  it('uses the acting member when the list doesn’t have them', () => {
    expect(habitOwner(mia, [], null).member).toBe(mia)
  })
})

describe('REQ-008 how a habit is described', () => {
  it.each([
    [habit(mia, { goal_note: '20 minutes' }), '20 minutes · Every day'],
    [habit(mia), 'Every day'],
    [weekly(mia, 0, 1, { goal_note: 'Board game night' }), 'Board game night · Once a week'],
    [weekly(mia, 0, 3), '3 times a week'],
  ])('%#: active habits show the goal and how often', (h, text) => {
    expect(habitMeta(h)).toBe(text)
  })

  it('archived habits show when, and their best streak in days or weeks', () => {
    const daily = habit(mia, { archived: true, archived_on: '2026-07-13', best_streak: 14 })
    const week = weekly(mia, 0, 2, { archived: true, archived_on: null, best_streak: 1 })
    expect(habitMeta(daily)).toBe('Archived on Mon 13 Jul · best streak 14 days')
    expect(habitMeta(week)).toBe('best streak 1 week')
  })

  it('a weekly habit without a target reads as every day', () => {
    expect(frequencyText({ frequency: 'weekly', weekly_target: null })).toBe('Every day')
  })
})

describe('REQ-008 the editor’s browser checks match the server', () => {
  const form = (changes = {}) => ({ ...emptyForm(), title: 'Read', ...changes })

  it('a new form starts daily with a target of 3 ready for weekly', () => {
    expect(emptyForm()).toEqual({ title: '', goalNote: '', frequency: 'daily', target: 3 })
  })

  it('an existing habit fills the form', () => {
    const piano = weekly(mia, 0, 4, { title: 'Piano', goal_note: null })
    expect(formFromHabit(piano)).toEqual({
      title: 'Piano',
      goalNote: '',
      frequency: 'weekly',
      target: 4,
    })
    expect(formFromHabit(habit(mia, { title: 'Read' })).target).toBe(3)
  })

  it.each([
    [{ title: '' }, 'title', 'Give your habit a name'],
    [{ title: '   ' }, 'title', 'Give your habit a name'],
    [{ title: 'x'.repeat(41) }, 'title', 'Up to 40 characters'],
    [{ goalNote: 'x'.repeat(61) }, 'goalNote', expect.stringContaining('Up to 60')],
  ])('%o is caught before sending', (changes, field, message) => {
    expect(habitFormError(form(changes))).toEqual({ field, message })
  })

  it.each([
    { title: 'x'.repeat(40) },
    { title: `  ${'x'.repeat(40)}  ` },
    { title: '🐬'.repeat(40) },
    { goalNote: 'x'.repeat(60) },
  ])('%#: the limits count trimmed characters, like the server', (changes) => {
    expect(habitFormError(form(changes))).toBeNull()
  })

  it('a blank goal note is sent as null', () => {
    expect(goalNoteValue(form({ goalNote: '  ' }))).toBeNull()
    expect(goalNoteValue(form({ goalNote: ' 3 litres ' }))).toBe('3 litres')
  })
})

describe('REQ-005 My PIN browser checks', () => {
  const ok = { current: '1234', next: '5678', again: '5678' }

  it('a well-formed change passes', () => {
    expect(pinFormError(ok)).toBeNull()
  })

  it.each([
    [{ current: '' }, 'current'],
    [{ current: '12345' }, 'current'],
    [{ next: '12a4', again: '12a4' }, 'next'],
    [{ next: '567', again: '567' }, 'next'],
    [{ again: '5679' }, 'again'],
  ])('%o is caught on the %s field', (changes, field) => {
    expect(pinFormError({ ...ok, ...changes })?.field).toBe(field)
  })

  it('a mismatch uses the kind copy from the spec', () => {
    expect(pinFormError({ ...ok, again: '0000' })?.message).toBe(
      'Those two PINs don’t match yet — try typing the new one again',
    )
  })
})
