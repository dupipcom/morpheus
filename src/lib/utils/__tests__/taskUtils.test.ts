import test from 'node:test'
import assert from 'node:assert/strict'
import { getCounterWindow, rruleFrequency } from '../taskUtils'

test('rruleFrequency extracts the FREQ value case-insensitively', () => {
  assert.equal(rruleFrequency('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'), 'WEEKLY')
  assert.equal(rruleFrequency('freq=daily'), 'DAILY')
})

test('rruleFrequency returns null for one-off or malformed rules', () => {
  assert.equal(rruleFrequency(null), null)
  assert.equal(rruleFrequency(''), null)
  assert.equal(rruleFrequency('INTERVAL=2'), null)
})

test('getCounterWindow uses the exact date for DAILY tasks', () => {
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=DAILY' }, '2026-08-16'), { start: '2026-08-16', end: '2026-08-16' })
})

test('getCounterWindow uses the exact date for one-off tasks (no rrule)', () => {
  assert.deepEqual(getCounterWindow({ rrule: null }, '2026-08-16'), { start: '2026-08-16', end: '2026-08-16' })
})

test('getCounterWindow uses the ISO week (Mon-Sun) for WEEKLY tasks', () => {
  // 2026-08-16 is a Sunday → week runs Mon 2026-08-10 .. Sun 2026-08-16
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=WEEKLY' }, '2026-08-16'), { start: '2026-08-10', end: '2026-08-16' })
  // Mid-week date keeps the same window
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=WEEKLY' }, '2026-08-12'), { start: '2026-08-10', end: '2026-08-16' })
})

test('getCounterWindow handles year-crossing weekly windows', () => {
  // 2026-12-31 is a Thursday → week runs Mon 2026-12-28 .. Sun 2027-01-03
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=WEEKLY' }, '2026-12-31'), { start: '2026-12-28', end: '2027-01-03' })
})

test('getCounterWindow uses the calendar month for MONTHLY tasks', () => {
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=MONTHLY' }, '2026-08-16'), { start: '2026-08-01', end: '2026-08-31' })
  // Leap-year February
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=MONTHLY' }, '2028-02-10'), { start: '2028-02-01', end: '2028-02-29' })
  // Non-leap February
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=MONTHLY' }, '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' })
})

test('getCounterWindow uses the calendar year for YEARLY tasks', () => {
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=YEARLY' }, '2026-08-16'), { start: '2026-01-01', end: '2026-12-31' })
})

test('getCounterWindow falls back to the exact date for unknown frequencies', () => {
  assert.deepEqual(getCounterWindow({ rrule: 'FREQ=HOURLY' }, '2026-08-16'), { start: '2026-08-16', end: '2026-08-16' })
})
