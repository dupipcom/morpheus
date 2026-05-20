import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNoteRelevanceScore,
  normalizeNoteSortBy,
  sortNotes,
} from '../noteRelevance'

// Fixed reference time used across recency-sensitive tests
const NOW = new Date('2026-01-01T12:00:00.000Z')

test('calculateNoteRelevanceScore favors close and existing friends interactions', () => {
  // Use now === createdAt so recency factor is 1.0 and we can assert the social score clearly
  const createdAt = '2026-01-01T12:00:00.000Z'
  const note = {
    createdAt,
    likes: [{ userId: 'closeFriend' }, { userId: 'friend' }, { userId: 'stranger' }],
    comments: [{ userId: 'closeFriend' }, { userId: 'friend' }],
  }

  const score = calculateNoteRelevanceScore(note, {
    closeFriendUserIds: ['closeFriend'],
    friendUserIds: ['friend'],
    now: NOW,
  })

  // likes = 2 + 1.5 + 1 = 4.5 => 4.5 * 0.3 = 1.35
  // comments = 2 + 1.5 = 3.5 => 3.5 * 0.7 = 2.45
  // socialScore = 3.8; recencyFactor = 1.0 (just created)
  // total = (3.8 + 1) * 1.0 = 4.8
  assert.equal(score, 4.8)
})

test('calculateNoteRelevanceScore ignores self-likes and self-comments', () => {
  const createdAt = '2026-01-01T12:00:00.000Z'
  const note = {
    createdAt,
    likes: [{ userId: 'currentUser' }, { userId: 'friend' }],
    comments: [{ userId: 'currentUser' }, { userId: 'stranger' }],
  }

  const scoreWithSelf = calculateNoteRelevanceScore(note, {
    friendUserIds: ['friend'],
    now: NOW,
  })

  const scoreWithoutSelf = calculateNoteRelevanceScore(note, {
    friendUserIds: ['friend'],
    currentUserId: 'currentUser',
    now: NOW,
  })

  // Self-interactions should be excluded, so score must be lower when filtering
  assert.ok(
    scoreWithoutSelf < scoreWithSelf,
    `Expected score with self-filtering (${scoreWithoutSelf}) < score without (${scoreWithSelf})`
  )

  // Without self-filtering: likes = FRIEND_WEIGHT(1.5) + BASE_WEIGHT(1) = 2.5, comments = BASE_WEIGHT(1) + BASE_WEIGHT(1) = 2
  // With self-filtering: likes = FRIEND_WEIGHT(1.5) (friend only), comments = BASE_WEIGHT(1) (stranger only)
  // socialWithoutSelf = 1.5 * LIKE_WEIGHT(0.3) + 1 * COMMENT_WEIGHT(0.7) = 0.45 + 0.7 = 1.15
  // total = (1.15 + RECENCY_BASE(1)) * recencyFactor(1.0) = 2.15
  assert.equal(scoreWithoutSelf, 2.15)
})

test('calculateNoteRelevanceScore gives much higher score to fresh content', () => {
  // Fresh note: 0 hours old, no social interactions
  const freshNote = {
    createdAt: NOW.toISOString(),
    likes: [],
    comments: [],
  }

  // Old note: 1 week old, many social interactions
  const oneWeekAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
  const oldNote = {
    createdAt: oneWeekAgo.toISOString(),
    likes: [{ userId: 'closeFriend' }, { userId: 'friend' }, { userId: 'stranger' }],
    comments: [{ userId: 'closeFriend' }, { userId: 'friend' }],
  }

  const context = {
    closeFriendUserIds: ['closeFriend'],
    friendUserIds: ['friend'],
    now: NOW,
  }

  const freshScore = calculateNoteRelevanceScore(freshNote, context)
  const oldScore = calculateNoteRelevanceScore(oldNote, context)

  assert.ok(
    freshScore > oldScore,
    `Expected fresh score (${freshScore}) > old score (${oldScore})`
  )
})

test('calculateNoteRelevanceScore works correctly when no user is logged in', () => {
  const createdAt = '2026-01-01T12:00:00.000Z'
  const note = {
    createdAt,
    likes: [{ userId: 'someone' }],
    comments: [{ userId: 'someone' }],
  }

  // No currentUserId, no friends — should not throw and return a positive score
  const score = calculateNoteRelevanceScore(note, { now: NOW })

  assert.ok(score > 0, `Expected positive score, got ${score}`)
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
