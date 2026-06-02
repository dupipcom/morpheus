import test from 'node:test'
import assert from 'node:assert/strict'
import { getDefaultProfileNotesVisibility } from '../profileNotesVisibility'

test('defaults own profile notes visibility to public only', () => {
  assert.deepEqual(getDefaultProfileNotesVisibility(true), ['PUBLIC'])
})

test('defaults non-own profile notes visibility to broad visibility set', () => {
  assert.deepEqual(getDefaultProfileNotesVisibility(false), ['PUBLIC', 'FRIENDS', 'CLOSE_FRIENDS', 'PRIVATE', 'AI_ENABLED'])
})
