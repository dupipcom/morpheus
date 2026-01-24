# DOMPurify XSS Protection Documentation

## Overview

This application uses [DOMPurify](https://github.com/cure53/DOMPurify) (`dompurify` package with `jsdom` for server-side support) to sanitize user input and prevent Cross-Site Scripting (XSS) attacks. This document explains how to use the sanitization utilities correctly throughout the codebase.

## Why DOMPurify?

DOMPurify is a DOM-only, super-fast, uber-tolerant XSS sanitizer for HTML, MathML, and SVG. It's:
- **Battle-tested**: Used by millions of websites
- **Isomorphic**: Works in both browser and Node.js environments
- **Configurable**: Allows fine-grained control over what's allowed
- **Actively maintained**: Regular security updates

## Available Sanitization Functions

All sanitization functions are located in `src/lib/utils/sanitize.ts`.

### 1. `sanitizeText(text: string): string`

Strips **all** HTML tags and attributes, returning only text content. Use this for plain text fields where no HTML formatting is allowed.

**Use cases:**
- User names (tasks, profiles, persons, things, events)
- Form input fields
- Plain text comments
- Any field that should never contain HTML

**Example:**
```typescript
import { sanitizeText } from '@/lib/utils/sanitize'

// API endpoint
const body = await request.json()
const sanitizedName = sanitizeText(body.name)

await prisma.task.create({
  data: {
    name: sanitizedName, // Safe from XSS
    // ...
  }
})
```

**Security guarantees:**
- Removes all HTML tags: `<script>`, `<img>`, `<iframe>`, etc.
- Removes all event handlers: `onclick`, `onerror`, `onload`, etc.
- Removes JavaScript protocols: `javascript:`, `data:`, etc.
- Preserves text content, quotes, and special characters
- Trims whitespace

### 2. `sanitizeHTML(html: string): string`

Sanitizes HTML content while preserving safe formatting tags. Use this for rich text content from editors.

**Use cases:**
- Rich text editor content (notes, descriptions)
- Job submission notes
- Review comments
- Any content from Lexical editor

**Example:**
```typescript
import { sanitizeHTML } from '@/lib/utils/sanitize'

// API endpoint
const body = await request.json()
const sanitizedContent = sanitizeHTML(body.content)

await prisma.note.create({
  data: {
    content: sanitizedContent, // Preserves safe HTML, blocks XSS
    // ...
  }
})
```

**Allowed tags:**
- Formatting: `p`, `br`, `strong`, `em`, `u`, `s`, `span`, `div`
- Headings: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- Lists: `ul`, `ol`, `li`
- Links: `a` (with safe href)
- Quotes: `blockquote`
- Code: `code`, `pre`
- Images: `img` (with safe src)

**Allowed attributes:**
- `href` (sanitized URLs only)
- `src` (sanitized URLs only)
- `alt`, `title`
- `class`, `id`

**Blocked:**
- Script tags: `<script>`, `<style>`
- Event handlers: `onclick`, `onerror`, etc.
- Dangerous protocols: `javascript:`, `data:`, `vbscript:`
- Frames: `<iframe>`, `<frame>`, `<object>`, `<embed>`
- Forms: `<form>`, `<input>`, `<button>`

### 3. `sanitizeEmail(email: string): string`

Validates and normalizes email addresses.

**Example:**
```typescript
import { sanitizeEmail } from '@/lib/utils/sanitize'

try {
  const cleanEmail = sanitizeEmail(userInput)
  // Use cleanEmail
} catch (error) {
  // Invalid email - show error to user
}
```

### 4. `sanitizeURL(url: string): string`

Validates URLs and ensures they use safe protocols (http/https only).

**Example:**
```typescript
import { sanitizeURL } from '@/lib/utils/sanitize'

try {
  const safeUrl = sanitizeURL(userInput)
  // Use safeUrl
} catch (error) {
  // Invalid or dangerous URL
}
```

### 5. `sanitizeObject<T>(obj: T, fieldsToSanitize: string[]): T`

Recursively sanitizes specified fields in an object.

**Example:**
```typescript
import { sanitizeObject } from '@/lib/utils/sanitize'

const body = await request.json()
const sanitized = sanitizeObject(body, ['name', 'bio', 'description'])
// Only 'name', 'bio', and 'description' fields are sanitized
```

## When to Sanitize

### ✅ Always Sanitize (Server-Side)

Sanitize **all** user input on the **server-side** in API routes before storing in the database:

1. **Form inputs** - task names, list names, profile data
2. **Rich text content** - notes, comments, descriptions
3. **User-generated content** - anything a user can type

**Why server-side?**
- Defense-in-depth: Never trust client-side validation
- Database integrity: Store only clean data
- API security: Protect against API misuse

### ⚠️ Always Wrap `dangerouslySetInnerHTML`

When rendering HTML content on the client, **always** sanitize it first:

```typescript
// ❌ UNSAFE - Never do this
<div dangerouslySetInnerHTML={{ __html: note.content }} />

// ✅ SAFE - Always sanitize
import { sanitizeHTML } from '@/lib/utils/sanitize'
<div dangerouslySetInnerHTML={{ __html: sanitizeHTML(note.content) }} />
```

**Even if sanitized server-side**, wrap `dangerouslySetInnerHTML` for:
- Defense-in-depth
- Protection against database compromise
- Safety during development/testing

## Implementation Checklist

When adding a new API endpoint that accepts user input:

- [ ] Import sanitization functions
- [ ] Identify which fields contain user input
- [ ] Determine if fields should be plain text or HTML
- [ ] Sanitize each field before database operations
- [ ] Add input validation (length, format)
- [ ] Test with XSS payloads

When adding a new component that renders user content:

- [ ] Check if content contains HTML
- [ ] If using `dangerouslySetInnerHTML`, wrap with `sanitizeHTML`
- [ ] Test rendering with XSS payloads
- [ ] Consider using text content instead of HTML when possible

## Testing for XSS Vulnerabilities

### Common XSS Test Payloads

Test your sanitization with these vectors:

```javascript
// Script tags
'<script>alert("XSS")</script>'

// Event handlers
'<img src=x onerror=alert(1)>'
'<body onload=alert(1)>'

// JavaScript protocol
'<a href="javascript:alert(1)">Click</a>'

// SVG-based
'<svg onload=alert(1)>'

// Data protocol
'<img src="data:text/html,<script>alert(1)</script>">'
```

### Automated Tests

Run the test suite:

```bash
npm test src/lib/utils/__tests__/sanitize.test.ts
```

The test suite covers:
- XSS vector prevention
- Safe HTML preservation
- Edge cases (empty, null, unicode)
- Email/URL validation

## Best Practices

### ✅ DO

1. **Sanitize on the server** - Never trust client-side sanitization
2. **Sanitize before storing** - Store clean data in the database
3. **Use appropriate function** - `sanitizeText` for text, `sanitizeHTML` for rich content
4. **Wrap dangerouslySetInnerHTML** - Always sanitize before rendering HTML
5. **Test with XSS vectors** - Verify your sanitization works

### ❌ DON'T

1. **Don't trust client input** - Always sanitize server-side
2. **Don't skip sanitization** - Even if you think input is "safe"
3. **Don't create your own sanitizer** - Use DOMPurify
4. **Don't use innerHTML** - Use React's JSX or `dangerouslySetInnerHTML` with sanitization
5. **Don't allow all tags** - Whitelist only necessary tags

## Examples from the Codebase

### API Route Example

```typescript
// src/app/api/v1/tasks/route.ts
import { sanitizeText } from '@/lib/utils/sanitize'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, area, listId } = body
  
  // Sanitize user input
  const sanitizedName = sanitizeText(name)
  
  const task = await prisma.task.create({
    data: {
      name: sanitizedName,
      area,
      listId
    }
  })
  
  return NextResponse.json({ task })
}
```

### Component Example

```typescript
// src/components/jobDetailsCard.tsx
import { sanitizeHTML } from '@/lib/utils/sanitize'

export function JobDetailsCard({ job }: Props) {
  return (
    <div>
      {job.requesterNotes.map((note) => (
        <div
          key={note.id}
          dangerouslySetInnerHTML={{ __html: sanitizeHTML(note.content) }}
        />
      ))}
    </div>
  )
}
```

## Security Considerations

### Defense in Depth

We apply multiple layers of security:

1. **Input validation** - Check length, format, required fields
2. **Server-side sanitization** - Clean data before storage
3. **Client-side sanitization** - Sanitize before rendering
4. **Content Security Policy** - Browser-level protection (if configured)

### Regular Updates

- Keep `dompurify` and `jsdom` updated
- Monitor security advisories
- Review and update allowed tags/attributes as needed

### Reporting Security Issues

If you discover a sanitization bypass or XSS vulnerability:

1. **Do not** create a public issue
2. Report privately to the security team
3. Provide:
   - Attack vector/payload
   - Affected endpoints/components
   - Steps to reproduce
   - Suggested fix

## Additional Resources

- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

## Updates and Maintenance

Last updated: 2026-01-24

**Recent changes:**
- Added `sanitizeObject` utility for batch sanitization
- Enhanced test coverage with XSS vectors
- Added sanitization to all API endpoints
- Wrapped all `dangerouslySetInnerHTML` usage

**Next steps:**
- Consider Content Security Policy headers
- Add automated security scanning
- Regular dependency updates
