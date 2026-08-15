import test from 'node:test'
import assert from 'node:assert/strict'
import { getNoteVisibilitiesForScope, resolveNoteVisibilityFilter } from '../noteAccess'

// getNoteVisibilitiesForScope — direct 1:1 mapping, no hierarchical expansion

test('AI_ENABLED scope (legacy delegation) maps to legacy AI_ENABLED visibility notes', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('AI_ENABLED'), ['AI_ENABLED'])
})

test('PRIVATE scope maps to PRIVATE notes only (plus legacy AI_ENABLED visibility)', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('PRIVATE'), ['PRIVATE', 'AI_ENABLED'])
})

test('FRIENDS scope maps to FRIENDS notes only', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('FRIENDS'), ['FRIENDS'])
})

test('CLOSE_FRIENDS scope maps to CLOSE_FRIENDS notes only', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('CLOSE_FRIENDS'), ['CLOSE_FRIENDS'])
})

test('PUBLIC scope maps to PUBLIC notes only', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('PUBLIC'), ['PUBLIC'])
})

test('DOC_ENABLED scope maps to DOC_ENABLED notes only', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('DOC_ENABLED'), ['DOC_ENABLED'])
})

test('unknown scope returns empty list', () => {
  assert.deepEqual(getNoteVisibilitiesForScope('BOGUS'), [])
})

// resolveNoteVisibilityFilter — union of direct scope mappings

test('PRIVATE + FRIENDS delegates see PRIVATE, AI_ENABLED (legacy), and FRIENDS notes', () => {
  assert.deepEqual(
    resolveNoteVisibilityFilter(['PRIVATE', 'FRIENDS'], null)?.slice().sort(),
    ['AI_ENABLED', 'FRIENDS', 'PRIVATE']
  )
})

test('PUBLIC + FRIENDS delegates see only PUBLIC and FRIENDS notes', () => {
  assert.deepEqual(
    resolveNoteVisibilityFilter(['PUBLIC', 'FRIENDS'], null)?.slice().sort(),
    ['FRIENDS', 'PUBLIC']
  )
})

test('resolveNoteVisibilityFilter falls back to the legacy scope field', () => {
  assert.deepEqual(resolveNoteVisibilityFilter([], 'PUBLIC'), ['PUBLIC'])
})

test('resolveNoteVisibilityFilter returns undefined (full owner access) for empty scopes', () => {
  assert.equal(resolveNoteVisibilityFilter([], null), undefined)
})
