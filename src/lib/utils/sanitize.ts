import validator from 'validator'

/**
 * Sanitize user input to prevent XSS and injection attacks
 * Used for defense-in-depth on server-side
 */
export function sanitizeText(text: string): string {
  if (!text) return ''
  
  // Trim whitespace
  let sanitized = text.trim()
  
  // Escape HTML to prevent XSS
  sanitized = validator.escape(sanitized)
  
  return sanitized
}

/**
 * Sanitize HTML content while preserving safe HTML tags
 * Used for rich text content
 */
export function sanitizeHTML(html: string): string {
  if (!html) return ''
  
  // For rich text, we need a more sophisticated approach
  // This is a basic implementation - production should use DOMPurify
  // or similar library
  
  // Unescape first to handle already-escaped content
  let sanitized = validator.unescape(html)
  
  // Strip script tags and event handlers
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '')
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '')
  
  return sanitized
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  if (!email) return ''
  
  const trimmed = email.trim().toLowerCase()
  
  if (!validator.isEmail(trimmed)) {
    throw new Error('Invalid email address')
  }
  
  return validator.normalizeEmail(trimmed) || trimmed
}

/**
 * Sanitize URL
 */
export function sanitizeURL(url: string): string {
  if (!url) return ''
  
  const trimmed = url.trim()
  
  if (!validator.isURL(trimmed, {
    protocols: ['http', 'https'],
    require_protocol: true
  })) {
    throw new Error('Invalid URL')
  }
  
  return trimmed
}
