import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateRange, getWeekDateRange } from '../helpers'

test('formatDateRange returns same-month range', () => {
  assert.equal(formatDateRange('2024-04-08', '2024-04-14'), 'Apr 8–14')
})

test('formatDateRange returns cross-month range', () => {
  assert.equal(formatDateRange('2024-03-25', '2024-03-31'), 'Mar 25–31')
})

test('formatDateRange returns range spanning two months', () => {
  assert.equal(formatDateRange('2024-03-25', '2024-04-01'), 'Mar 25–Apr 1')
})

test('formatDateRange handles single day (same start and end)', () => {
  assert.equal(formatDateRange('2024-04-08', '2024-04-08'), 'Apr 8–8')
})

test('getWeekDateRange returns correct range for ISO week', () => {
  // Week 15 of 2024 runs Mon Apr 8 – Sun Apr 14
  assert.equal(getWeekDateRange(2024, 15), 'Apr 8–14')
})

test('getWeekDateRange handles week ending at month boundary', () => {
  // Week 13 of 2024 runs Mon Mar 25 – Sun Mar 31 (ends exactly at month boundary)
  assert.equal(getWeekDateRange(2024, 13), 'Mar 25–31')
})

test('getWeekDateRange handles week spanning two months', () => {
  // Week 9 of 2024 runs Mon Feb 26 – Sun Mar 3
  assert.equal(getWeekDateRange(2024, 9), 'Feb 26–Mar 3')
})

test('getWeekDateRange handles week 1 of year', () => {
  // ISO week 1 of 2024 runs Mon Jan 1 – Sun Jan 7
  assert.equal(getWeekDateRange(2024, 1), 'Jan 1–7')
})
