/**
 * Simple XSS Protection Test
 * Tests basic sanitization without needing TypeScript compilation
 */

import DOMPurify from 'isomorphic-dompurify';

console.log('🔒 Testing DOMPurify XSS Protection\n');

// Test vectors
const testVectors = [
  { input: '<script>alert("XSS")</script>Hello', expected: 'Hello', type: 'text' },
  { input: '<img src=x onerror=alert(1)>', expected: '', type: 'text' },
  { input: '<p>Safe <strong>text</strong></p>', shouldContain: '<strong>', type: 'html' },
  { input: '<script>alert(1)</script><p>Text</p>', shouldNotContain: '<script>', type: 'html' },
];

let passed = 0;
let failed = 0;

// Test plain text sanitization
console.log('Testing TEXT sanitization (should strip all HTML):\n');
testVectors.filter(t => t.type === 'text').forEach((test, i) => {
  const result = DOMPurify.sanitize(test.input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  }).trim();
  
  if (result === test.expected) {
    console.log(`  ✅ Test ${i + 1}: PASSED`);
    passed++;
  } else {
    console.log(`  ❌ Test ${i + 1}: FAILED`);
    console.log(`     Input: ${test.input}`);
    console.log(`     Expected: "${test.expected}"`);
    console.log(`     Got: "${result}"`);
    failed++;
  }
});

// Test HTML sanitization
console.log('\nTesting HTML sanitization (should allow safe tags):\n');
testVectors.filter(t => t.type === 'html').forEach((test, i) => {
  const result = DOMPurify.sanitize(test.input, {
    ALLOWED_TAGS: ['p', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'class']
  });
  
  let testPassed = false;
  if (test.shouldContain && result.includes(test.shouldContain)) {
    testPassed = true;
  } else if (test.shouldNotContain && !result.includes(test.shouldNotContain)) {
    testPassed = true;
  }
  
  if (testPassed) {
    console.log(`  ✅ Test ${i + 1}: PASSED`);
    passed++;
  } else {
    console.log(`  ❌ Test ${i + 1}: FAILED`);
    console.log(`     Input: ${test.input}`);
    console.log(`     Result: ${result}`);
    failed++;
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('✨ All tests passed! DOMPurify is working correctly.\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Please review the sanitization configuration.\n');
  process.exit(1);
}
