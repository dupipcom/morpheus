import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNoteRelevanceScore,
  normalizeNoteSortBy,
  sortNotes,
} from '../noteRelevance'

test('calculateNoteRelevanceScore favors close and existing friends interactions', () => {
  const note = {
    createdAt: '2026-01-01T00:00:00.000Z',
    likes: [{ userId: 'closeFriend' }, { userId: 'friend' }, { userId: 'stranger' }],
    comments: [{ userId: 'closeFriend' }, { userId: 'friend' }],
  }

  const score = calculateNoteRelevanceScore(note, {
    closeFriendUserIds: ['closeFriend'],
    friendUserIds: ['friend'],
  })

  // likes = 2 + 1.5 + 1 = 4.5 => 1.35
  // comments = 2 + 1.5 = 3.5 => 2.45
  assert.equal(score, 3.8)
})

test('normalizeNoteSortBy defaults to date when invalid', () => {
  assert.equal(normalizeNoteSortBy('most_relevant'), 'most_relevant')
  assert.equal(normalizeNoteSortBy('date'), 'date')
  assert.equal(normalizeNoteSortBy('unsupported'), 'date')
})

test('sortNotes sorts by relevance then createdAt for ties', () => {
  const notes = [
    { createdAt: '2026-01-02T00:00:00.000Z', relevanceScore: 2 },
    { createdAt: '2026-01-03T00:00:00.000Z', relevanceScore: 2 },
    { createdAt: '2026-01-01T00:00:00.000Z', relevanceScore: 5 },
  ]

  const sorted = sortNotes(notes, 'most_relevant')

  assert.deepEqual(sorted.map(note => note.createdAt), [
    '2026-01-01T00:00:00.000Z',
    '2026-01-03T00:00:00.000Z',
    '2026-01-02T00:00:00.000Z',
  ])
})
