import { sanitizeText, sanitizeHTML, sanitizeEmail, sanitizeURL, sanitizeObject } from '../sanitize'

describe('sanitizeText', () => {
  it('should strip all HTML tags from plain text input', () => {
    const input = '<script>alert("XSS")</script>Hello World'
    const result = sanitizeText(input)
    expect(result).toBe('Hello World')
    expect(result).not.toContain('<script>')
  })

  it('should preserve special characters and quotes', () => {
    const input = 'Hello "World" & Co.'
    const result = sanitizeText(input)
    expect(result).toBe('Hello "World" & Co.')
  })

  it('should remove malicious event handlers', () => {
    const input = '<img src=x onerror="alert(1)">'
    const result = sanitizeText(input)
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('alert')
  })

  it('should handle empty strings', () => {
    expect(sanitizeText('')).toBe('')
    expect(sanitizeText(null as any)).toBe('')
    expect(sanitizeText(undefined as any)).toBe('')
  })

  it('should trim whitespace', () => {
    const input = '  Hello World  '
    const result = sanitizeText(input)
    expect(result).toBe('Hello World')
  })

  it('should prevent XSS through various vectors', () => {
    const xssVectors = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      'javascript:alert(1)',
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
    ]

    xssVectors.forEach(vector => {
      const result = sanitizeText(vector)
      expect(result).not.toContain('alert')
      expect(result).not.toContain('javascript:')
      expect(result).not.toContain('onerror')
      expect(result).not.toContain('onload')
      expect(result).not.toContain('onfocus')
    })
  })

  it('should handle unicode and special characters safely', () => {
    const input = 'Hello 世界 🌍 <script>alert(1)</script>'
    const result = sanitizeText(input)
    expect(result).toContain('世界')
    expect(result).toContain('🌍')
    expect(result).not.toContain('<script>')
  })
})

describe('sanitizeHTML', () => {
  it('should preserve safe HTML tags', () => {
    const input = '<p>Hello <strong>World</strong></p>'
    const result = sanitizeHTML(input)
    expect(result).toContain('<p>')
    expect(result).toContain('<strong>')
    expect(result).toContain('Hello')
  })

  it('should remove dangerous tags while preserving content', () => {
    const input = '<p>Safe text</p><script>alert("XSS")</script>'
    const result = sanitizeHTML(input)
    expect(result).toContain('Safe text')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
  })

  it('should strip malicious event handlers from allowed tags', () => {
    const input = '<p onclick="alert(1)">Click me</p>'
    const result = sanitizeHTML(input)
    expect(result).toContain('<p>')
    expect(result).toContain('Click me')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('alert')
  })

  it('should allow safe links but sanitize javascript: protocol', () => {
    const safe = '<a href="https://example.com">Link</a>'
    const unsafe = '<a href="javascript:alert(1)">Bad Link</a>'
    
    const safeResult = sanitizeHTML(safe)
    const unsafeResult = sanitizeHTML(unsafe)
    
    expect(safeResult).toContain('href="https://example.com"')
    expect(unsafeResult).not.toContain('javascript:')
  })

  it('should preserve text formatting tags', () => {
    const input = '<p><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <s>Strike</s></p>'
    const result = sanitizeHTML(input)
    expect(result).toContain('<strong>')
    expect(result).toContain('<em>')
    expect(result).toContain('<u>')
    expect(result).toContain('<s>')
  })

  it('should handle lists correctly', () => {
    const input = '<ul><li>Item 1</li><li>Item 2</li></ul>'
    const result = sanitizeHTML(input)
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
    expect(result).toContain('Item 1')
  })

  it('should handle nested tags safely', () => {
    const input = '<p>Hello <strong><em>World</em></strong></p>'
    const result = sanitizeHTML(input)
    expect(result).toContain('<p>')
    expect(result).toContain('<strong>')
    expect(result).toContain('<em>')
  })

  it('should handle empty or null input', () => {
    expect(sanitizeHTML('')).toBe('')
    expect(sanitizeHTML(null as any)).toBe('')
    expect(sanitizeHTML(undefined as any)).toBe('')
  })
})

describe('sanitizeEmail', () => {
  it('should accept valid email addresses', () => {
    const validEmails = [
      'test@example.com',
      'user.name@example.co.uk',
      'user+tag@example.com',
      'test123@test-domain.com'
    ]

    validEmails.forEach(email => {
      expect(() => sanitizeEmail(email)).not.toThrow()
    })
  })

  it('should normalize email addresses', () => {
    const result = sanitizeEmail('  TEST@EXAMPLE.COM  ')
    expect(result).toBe('test@example.com')
  })

  it('should reject invalid email addresses', () => {
    const invalidEmails = [
      'not-an-email',
      '@example.com',
      'user@',
      'user @example.com',
    ]

    invalidEmails.forEach(email => {
      expect(() => sanitizeEmail(email)).toThrow('Invalid email address')
    })
  })

  it('should handle empty input', () => {
    expect(sanitizeEmail('')).toBe('')
  })
})

describe('sanitizeURL', () => {
  it('should accept valid HTTPS URLs', () => {
    const result = sanitizeURL('https://example.com')
    expect(result).toBe('https://example.com')
  })

  it('should accept valid HTTP URLs', () => {
    const result = sanitizeURL('http://example.com')
    expect(result).toBe('http://example.com')
  })

  it('should reject javascript: protocol', () => {
    expect(() => sanitizeURL('javascript:alert(1)')).toThrow('Invalid URL')
  })

  it('should reject data: protocol', () => {
    expect(() => sanitizeURL('data:text/html,<script>alert(1)</script>')).toThrow('Invalid URL')
  })

  it('should reject URLs without protocol', () => {
    expect(() => sanitizeURL('example.com')).toThrow('Invalid URL')
  })

  it('should handle empty input', () => {
    expect(sanitizeURL('')).toBe('')
  })

  it('should trim whitespace from URLs', () => {
    const result = sanitizeURL('  https://example.com  ')
    expect(result).toBe('https://example.com')
  })
})

describe('sanitizeObject', () => {
  it('should sanitize specified string fields', () => {
    const input = {
      name: '<script>alert(1)</script>John',
      email: 'test@example.com',
      bio: '<img src=x onerror=alert(1)>Developer'
    }
    const result = sanitizeObject(input, ['name', 'bio'])
    
    expect(result.name).toBe('John')
    expect(result.name).not.toContain('<script>')
    expect(result.bio).toBe('Developer')
    expect(result.bio).not.toContain('onerror')
    expect(result.email).toBe('test@example.com') // Not sanitized
  })

  it('should handle nested objects', () => {
    const input = {
      user: {
        name: '<script>alert(1)</script>John',
        profile: {
          bio: '<img onerror=alert(1)>Dev'
        }
      }
    }
    const result = sanitizeObject(input, ['name', 'bio'])
    
    expect(result.user.name).toBe('John')
    expect(result.user.profile.bio).toBe('Dev')
  })

  it('should preserve non-string values', () => {
    const input = {
      name: '<script>alert(1)</script>John',
      age: 30,
      active: true,
      nothing: null,
      undef: undefined
    }
    const result = sanitizeObject(input, ['name'])
    
    expect(result.name).toBe('John')
    expect(result.age).toBe(30)
    expect(result.active).toBe(true)
    expect(result.nothing).toBeNull()
    expect(result.undef).toBeUndefined()
  })

  it('should not sanitize fields not in the list', () => {
    const input = {
      name: '<script>John</script>',
      rawHtml: '<div>Keep this</div>'
    }
    const result = sanitizeObject(input, ['name'])
    
    expect(result.name).toBe('John')
    expect(result.rawHtml).toBe('<div>Keep this</div>')
  })

  it('should handle empty objects', () => {
    const result = sanitizeObject({}, ['name'])
    expect(result).toEqual({})
  })

  it('should handle null and undefined input', () => {
    expect(sanitizeObject(null as any, ['name'])).toBe(null)
    expect(sanitizeObject(undefined as any, ['name'])).toBe(undefined)
  })
})
