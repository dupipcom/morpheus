import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeHtmlEntities } from '../htmlEntities'

test('decodeHtmlEntities decodes named and numeric entities', () => {
  assert.equal(
    decodeHtmlEntities('Tom &amp; Jerry &#39;The Movie&#39; &#x1F600;'),
    'Tom & Jerry \'The Movie\' 😀'
  )
})

test('decodeHtmlEntities handles double-encoded entities', () => {
  assert.equal(decodeHtmlEntities('Fish &amp;amp; Chips &amp;#39;special&amp;#39;'), 'Fish & Chips \'special\'')
})

test('decodeHtmlEntities keeps unknown entities unchanged', () => {
  assert.equal(decodeHtmlEntities('Example &unknown; value'), 'Example &unknown; value')
})

test('decodeHtmlEntities leaves malformed or semicolon-less entities unchanged', () => {
  assert.equal(
    decodeHtmlEntities('Bad &#xZZZZ; and &amp and &#99999999999; and &#x110000;'),
    'Bad &#xZZZZ; and &amp and &#99999999999; and &#x110000;'
  )
})

test('decodeHtmlEntities applies a bounded number of decode passes', () => {
  assert.equal(decodeHtmlEntities('&amp;amp;amp;amp;amp;'), '&amp;amp;')
})
