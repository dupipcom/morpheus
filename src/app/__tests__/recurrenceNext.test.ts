import test from 'node:test'
import assert from 'node:assert/strict'
import {
  nextOccurrenceAfter,
  deriveDateStatus,
  taskOccursOnDate,
  getWeekRange,
} from '../../lib/services/task/recurrenceService'

// 2026-08-16 is a Sunday; 2026-08-10 is the Monday of that week
const TASK = { rrule: 'FREQ=DAILY', dtstart: '2026-08-16', status: 'OPEN' as const }

test('nextOccurrenceAfter: daily task advances one day', () => {
  assert.equal(nextOccurrenceAfter(TASK, '2026-08-16'), '2026-08-17')
})

test('nextOccurrenceAfter: weekly BYDAY skips non-occurrence days', () => {
  const weekly = { ...TASK, rrule: 'FREQ=WEEKLY;BYDAY=MO,TH', dtstart: '2026-08-10' }
  // Completed Thursday -> next is Monday
  assert.equal(nextOccurrenceAfter(weekly, '2026-08-13'), '2026-08-17')
})

test('nextOccurrenceAfter: legacy WEEKLY without BYDAY advances one day', () => {
  const legacy = { ...TASK, rrule: 'FREQ=WEEKLY;INTERVAL=1' }
  assert.equal(nextOccurrenceAfter(legacy, '2026-08-16'), '2026-08-17')
})

test('nextOccurrenceAfter: UNTIL exhausted returns null', () => {
  const until = { ...TASK, rrule: 'FREQ=DAILY;UNTIL=20260817T000000Z' }
  assert.equal(nextOccurrenceAfter(until, '2026-08-17'), null)
})

test('nextOccurrenceAfter: COUNT exhausted returns null', () => {
  const counted = { ...TASK, rrule: 'FREQ=DAILY;COUNT=1' }
  assert.equal(nextOccurrenceAfter(counted, '2026-08-16'), null)
})

test('nextOccurrenceAfter: one-off task (no rrule) returns null', () => {
  assert.equal(nextOccurrenceAfter({ ...TASK, rrule: null }, '2026-08-16'), null)
})

test('nextOccurrenceAfter: unparseable rule advances one day (appears all dates)', () => {
  const garbage = { ...TASK, rrule: 'NOT-A-RULE' }
  assert.equal(nextOccurrenceAfter(garbage, '2026-08-16'), '2026-08-17')
})

test('deriveDateStatus: OPEN with no accepted jobs stays OPEN', () => {
  assert.equal(deriveDateStatus({ status: 'OPEN' }, 0), 'OPEN')
})

test('deriveDateStatus: partial count is IN_PROGRESS', () => {
  assert.equal(deriveDateStatus({ status: 'OPEN' }, 1, 2), 'IN_PROGRESS')
})

test('deriveDateStatus: count reaching times is DONE', () => {
  assert.equal(deriveDateStatus({ status: 'OPEN' }, 2, 2), 'DONE')
})

test('deriveDateStatus: one-off COMPLETED/DONE stays completed without jobs', () => {
  assert.equal(deriveDateStatus({ status: 'COMPLETED', rrule: null }, 0), 'COMPLETED')
  assert.equal(deriveDateStatus({ status: 'DONE', rrule: null }, 0), 'DONE')
})

test('deriveDateStatus: recurring COMPLETED below target is not completed', () => {
  // Regression: a recurring occurrence reduced below its counter must never
  // display as completed (drink water 0/3 bug)
  assert.equal(deriveDateStatus({ status: 'COMPLETED', rrule: 'FREQ=DAILY' }, 0, 3), 'OPEN')
  assert.equal(deriveDateStatus({ status: 'COMPLETED', rrule: 'FREQ=DAILY' }, 1, 3), 'IN_PROGRESS')
  assert.equal(deriveDateStatus({ status: 'DONE', rrule: 'FREQ=DAILY' }, 2, 3), 'IN_PROGRESS')
})

test('deriveDateStatus: COMPLETED/DONE kept when count meets target', () => {
  assert.equal(deriveDateStatus({ status: 'COMPLETED', rrule: 'FREQ=DAILY' }, 3, 3), 'COMPLETED')
  assert.equal(deriveDateStatus({ status: 'DONE', rrule: 'FREQ=DAILY' }, 3, 3), 'DONE')
})

test('deriveDateStatus: manual READY/STEADY/IN_PROGRESS preserved without jobs', () => {
  assert.equal(deriveDateStatus({ status: 'READY' }, 0), 'READY')
  assert.equal(deriveDateStatus({ status: 'STEADY' }, 0), 'STEADY')
  assert.equal(deriveDateStatus({ status: 'IN_PROGRESS' }, 0), 'IN_PROGRESS')
})

test('taskOccursOnDate: COMPLETED task hidden in recurring lists, visible on completion day', () => {
  const completed = { ...TASK, status: 'COMPLETED' as const, completedOn: '2026-08-16' }
  assert.equal(taskOccursOnDate(completed, '2026-08-16', false), true)
  assert.equal(taskOccursOnDate(completed, '2026-08-17', false), false)
  // One-off lists still show COMPLETED tasks on any date
  assert.equal(taskOccursOnDate(completed, '2026-08-17', true), true)
})

test('taskOccursOnDate: one-off task appears on all dates', () => {
  const oneOff = { ...TASK, rrule: null }
  assert.equal(taskOccursOnDate(oneOff, '2026-08-16'), true)
  assert.equal(taskOccursOnDate(oneOff, '2030-01-01'), true)
})

test('taskOccursOnDate: rrule occurrence check on exact date', () => {
  assert.equal(taskOccursOnDate(TASK, '2026-08-16', false), true)
  assert.equal(taskOccursOnDate(TASK, '2026-08-17', false), true) // daily
})

test('getWeekRange: Sunday belongs to the week starting Monday', () => {
  const range = getWeekRange('2026-08-16') // Sunday
  assert.equal(range.weekStart, '2026-08-10')
  assert.equal(range.weekEnd, '2026-08-16')
  assert.equal(range.allDates.length, 7)
})
