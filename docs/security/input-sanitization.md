# Input Sanitization Security (Bug #227)

## Overview

This document outlines the input sanitization strategy implemented to prevent XSS and injection attacks across the Morpheus application.

## Sanitization Utilities

Located in: `src/lib/utils/sanitize.ts`

### Functions

#### `sanitizeText(text: string): string`
- **Purpose**: Sanitize plain text user input
- **Use Case**: Comments, simple text fields, names
- **Method**: Uses DOMPurify to strip all HTML while keeping content human-readable (preserves quotes, slashes, etc.)
- **Benefits**: Prevents XSS while maintaining readability of special characters

#### `sanitizeHTML(html: string): string`
- **Purpose**: Sanitize rich text HTML content
- **Use Case**: Notes, rich text editor content
- **Method**: Uses DOMPurify with allowlist of safe HTML tags and attributes
- **Allowed Tags**: p, br, strong, em, u, s, a, ul, ol, li, blockquote, code, pre, h1-h6, span, div, img
- **Allowed Attributes**: href, src, alt, title, class, id
- **Security**: Automatically removes script tags, event handlers, and dangerous protocols (javascript:, data:, etc.)

#### `sanitizeEmail(email: string): string`
- **Purpose**: Validate and normalize email addresses
- **Throws**: Error if email is invalid

#### `sanitizeURL(url: string): string`
- **Purpose**: Validate URLs and ensure safe protocols
- **Allowed Protocols**: http, https only
- **Throws**: Error if URL is invalid

## Implementation Status

### ✅ Completed
- ✅ `src/lib/services/job/noteHelper.ts` - Job submission notes
- ✅ `src/app/api/v1/notes/route.ts` - Note creation
- ✅ `src/app/api/v1/comments/route.ts` - Comment creation

### 📋 Recommended for Future Implementation

#### High Priority
- Note updates, comment updates, profile bio, task names, list names

## Best Practices

1. **Always sanitize on the server side**
2. **Sanitize before database insertion**
3. **Use appropriate sanitization for content type**

## Dependencies

- `validator` - Input validation (email, URL)
- `dompurify` - HTML sanitization (works in both browser and Node.js)
- `jsdom` - DOM implementation for Node.js server-side sanitization (dev dependency, only used server-side)
  - Provides comprehensive XSS protection
  - Maintains human-readable text (preserves quotes, slashes, etc.)
  - Configurable allowlist for HTML tags and attributes
