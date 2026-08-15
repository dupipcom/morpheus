import test from 'node:test'
import assert from 'node:assert/strict'
import { getNoteVisibilitiesForScope, resolveNoteVisibilityFilter } from '../noteAccess'

test('PRIVATE scope grants full note access (undefined filter)', () => {
  assert.equal(getNoteVisibilitiesForScope('PRIVATE'), undefined)
})

test('AI_ENABLED scope unlocks everything except PRIVATE notes', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('AI_ENABLED'), [
    'AI_ENABLED',
    'FRIENDS',
    'CLOSE_FRIENDS',
    'PUBLIC',
    'DOC_ENABLED'
  ])
})

test('FRIENDS scope unlocks friend tier plus DOC_ENABLED', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('FRIENDS'), [
    'FRIENDS',
    'CLOSE_FRIENDS',
    'PUBLIC',
    'DOC_ENABLED'
  ])
})

test('CLOSE_FRIENDS scope unlocks close-friend tier plus DOC_ENABLED', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('CLOSE_FRIENDS'), [
    'CLOSE_FRIENDS',
    'PUBLIC',
    'DOC_ENABLED'
  ])
})

test('PUBLIC scope unlocks PUBLIC and DOC_ENABLED only', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('PUBLIC'), ['PUBLIC', 'DOC_ENABLED'])
})

test('DOC_ENABLED scope is defensive least privilege: doc notes only', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('DOC_ENABLED'), ['DOC_ENABLED'])
})

test('resolveNoteVisibilityFilter uses the broadest granted scope', () => {
  assert.deepEqual(resolveNoteVisibilityFilter(['PUBLIC', 'FRIENDS'], null), [
    'FRIENDS',
    'CLOSE_FRIENDS',
    'PUBLIC',
    'DOC_ENABLED'
  ])
})

test('resolveNoteVisibilityFilter falls back to the legacy scope field', () => {
  assert.deepEqual(resolveNoteVisibilityFilter([], 'PUBLIC'), ['PUBLIC', 'DOC_ENABLED'])
})

test('resolveNoteVisibilityFilter returns full access for empty scopes', () => {
  assert.equal(resolveNoteVisibilityFilter([], null), undefined)
})
