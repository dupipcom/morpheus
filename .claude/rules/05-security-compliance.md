# Security & Compliance Rules

## Regulatory Framework

This application must comply with:
- **GDPR** (General Data Protection Regulation) - EU data protection
- **DORA** (Digital Operational Resilience Act) - EU financial sector
- **MiCA** (Markets in Crypto-Assets) - EU crypto regulation
- **ISO 27001** - Information security management
- **HIPAA** - Health data protection (if health data involved)
- **SOC II** - Security, availability, processing integrity
- **PCI DSS** - Payment card data protection

## Authentication & Authorization

### Authentication Requirements
- All API routes must verify authentication via Clerk
- Never trust client-provided user IDs
- Always derive user identity from auth token
- Implement session timeout for sensitive operations

```typescript
// Required pattern for all protected routes
const { userId } = await auth()
if (!userId) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Authorization Checks
- Verify resource ownership before any operation
- Check role-based permissions (OWNER, COLLABORATOR, MANAGER)
- Validate visibility rules for data access
- Log authorization failures

```typescript
// Check ownership
if (resource.userId !== user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Check membership
const isMember = resource.users.some(u => u.userId === user.id)
if (!isMember) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

## Data Protection (GDPR)

### Personal Data Handling
- Minimize data collection (collect only what's needed)
- Implement data retention policies
- Support data portability (export user data)
- Support right to erasure (delete user data)
- Implement consent management

### PII Fields
These fields are considered PII and require special handling:
- Email addresses
- Names (first, last)
- Phone numbers
- Physical addresses
- Financial data (balances, transactions)
- Health/mood data
- Location data
- Profile pictures

### Data Minimization
```typescript
// Only select needed fields
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    // Only include PII fields when necessary
    // email: true, // Only if needed
  }
})

// Never log PII
console.log('User action:', { userId: user.id }) // OK
console.log('User action:', user) // NEVER - may contain PII
```

## Input Validation & Sanitization

### Required Validations
```typescript
// Validate all inputs
function validateInput(body: unknown): Result {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid request body' }
  }

  const { email, amount } = body as Record<string, unknown>

  // Type validation
  if (email && typeof email !== 'string') {
    return { error: 'Email must be a string' }
  }

  // Format validation
  if (email && !isValidEmail(email)) {
    return { error: 'Invalid email format' }
  }

  // Range validation
  if (amount !== undefined) {
    const num = parseFloat(String(amount))
    if (isNaN(num) || num < 0) {
      return { error: 'Amount must be a positive number' }
    }
  }

  return { data: { email, amount } }
}
```

### Injection Prevention
- Never interpolate user input into queries
- Use Prisma's parameterized queries
- Sanitize HTML output to prevent XSS
- Validate ObjectId format before database queries

```typescript
// SAFE - parameterized
await prisma.user.findMany({
  where: { name: { contains: searchTerm } }
})

// NEVER - string interpolation
// await prisma.$queryRaw`SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`
```

## Financial Data Security (PCI/DORA)

### Sensitive Financial Fields
- Account balances (`availableBalance`, `stash`, `equity`)
- Transaction amounts
- Wallet addresses
- Payment credentials

### Financial Data Rules
- Never log financial amounts in production
- Encrypt sensitive data at rest
- Use TLS for all API communications
- Implement audit trails for financial operations
- Validate all financial calculations server-side

```typescript
// Always recalculate on server - never trust client values
const serverCalculatedAmount = calculateAmount(items)
if (clientAmount !== serverCalculatedAmount) {
  return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
}
```

## Audit Logging (ISO 27001/SOC II)

### What to Log
- Authentication events (login, logout, failed attempts)
- Authorization failures
- Data modifications (create, update, delete)
- Financial transactions
- Admin actions
- Security-relevant errors

### Log Format
```typescript
// Structured logging
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  event: 'user.data.update',
  userId: user.id,
  resourceType: 'profile',
  resourceId: profile.id,
  action: 'update',
  // Never log the actual data changes for PII
}))
```

## Error Handling

### Secure Error Responses
```typescript
// SAFE - generic message
return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

// NEVER - reveals system information
// return NextResponse.json({ error: `User ${email} not found in database` }, { status: 401 })
```

### Error Logging
```typescript
try {
  // operation
} catch (error) {
  // Log full error internally
  console.error('Operation failed:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    userId: user?.id,
    operation: 'updateProfile'
  })

  // Return generic message to client
  return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
}
```

## Secrets Management

### Environment Variables
- Store secrets in `.env.local` (never commit)
- Use `.env.public` for non-sensitive defaults
- Access via `process.env.VARIABLE_NAME`
- Never log or expose environment variables

### API Keys & Tokens
- Rotate regularly
- Use minimum required permissions
- Never expose in client-side code
- Never commit to version control
