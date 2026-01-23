# Input Sanitization Security (Bug #227)

## Overview

This document outlines the input sanitization strategy implemented to prevent XSS and injection attacks across the Morpheus application.

## Sanitization Utilities

Located in: `src/lib/utils/sanitize.ts`

### Functions

#### `sanitizeText(text: string): string`
- **Purpose**: Sanitize plain text user input
- **Use Case**: Comments, simple text fields, names
- **Method**: Escapes HTML entities using validator.escape()

#### `sanitizeHTML(html: string): string`
- **Purpose**: Sanitize rich text HTML content
- **Use Case**: Notes, rich text editor content
- **Method**: Removes script tags, event handlers, and javascript: protocols

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

- `validator` - Input validation and sanitization
