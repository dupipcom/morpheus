import validator from 'validator'
import * as DOMPurifyLib from 'isomorphic-dompurify'

const DOMPurify = DOMPurifyLib.default || DOMPurifyLib

/**
 * Sanitize user input to prevent XSS and injection attacks
 * Used for defense-in-depth on server-side
 * Uses DOMPurify to maintain human-readable characters while preventing XSS
 * 
 * @param text - The text to sanitize
 * @returns Sanitized text with all HTML stripped
 */
export function sanitizeText(text: string): string {
  if (!text) return ''
  
  // Trim whitespace
  let sanitized = text.trim()
  
  // Use DOMPurify with plain text configuration
  // This strips all HTML while keeping quotes and special chars readable
  sanitized = DOMPurify.sanitize(sanitized, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  })
  
  return sanitized
}

/**
 * Sanitize an object's string properties recursively
 * Useful for sanitizing form data or API request bodies
 * 
 * @param obj - Object to sanitize
 * @param fieldsToSanitize - Array of field names to sanitize as plain text
 * @returns New object with sanitized string values
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  fieldsToSanitize: string[] = []
): T {
  if (!obj || typeof obj !== 'object') return obj
  
  const sanitized: any = Array.isArray(obj) ? [] : {}
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      sanitized[key] = value
    } else if (typeof value === 'string') {
      // Sanitize if field is in the list, otherwise keep as-is
      sanitized[key] = fieldsToSanitize.includes(key) ? sanitizeText(value) : value
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, fieldsToSanitize)
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized as T
}

/**
 * Sanitize HTML content while preserving safe HTML tags
 * Used for rich text content
 */
export function sanitizeHTML(html: string): string {
  if (!html) return ''
  
  // Use DOMPurify to sanitize HTML content
  // DOMPurify automatically handles XSS prevention while preserving safe HTML
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 
      'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'span', 'div', 'img'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  })
  
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
