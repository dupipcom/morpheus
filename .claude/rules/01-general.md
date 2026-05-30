# General Project Rules

## Project Overview
Morpheus is a fintech productivity platform built with Next.js 15, Prisma/MongoDB, Clerk auth, and Payload CMS. It handles sensitive financial data and must comply with multiple regulatory frameworks.

## Code Quality Standards

### TypeScript
- Use strict TypeScript (`strict: true` is enabled)
- Always define explicit types for function parameters and return values
- Prefer interfaces over type aliases for object shapes
- Use `unknown` instead of `any` when type is truly unknown
- Export types from dedicated `types.ts` files in service directories

### File Organization
- Keep files under 500 lines; split into service layers if larger
- Use barrel exports (`index.ts`) for cleaner imports
- Organize by feature, not by file type
- Place shared utilities in `src/lib/utils/`
- Place services in `src/lib/services/{feature}/`

### Naming Conventions
- Files: `camelCase.ts` for utilities, `PascalCase.tsx` for components
- Functions: `camelCase` for regular functions, `PascalCase` for React components
- Constants: `SCREAMING_SNAKE_CASE`
- Types/Interfaces: `PascalCase`
- Database fields: `camelCase`

### Import Order
1. External packages (react, next, etc.)
2. Internal aliases (`@/lib/`, `@/components/`)
3. Relative imports
4. Type imports (use `import type` when only importing types)

## Architecture Principles

### MVC Pattern
- **Model**: Prisma schema + service layer (`src/lib/services/`)
- **View**: React components (`src/components/`, `src/views/`)
- **Controller**: API routes (`src/app/api/`) + server actions

### Separation of Concerns
- API routes handle HTTP only: parse request, validate auth, call service, return response
- Services contain business logic: validation, calculations, database operations
- Components handle UI only: rendering, user interactions, local state
- Hooks handle data fetching and state management

### Error Handling
- Always use try-catch in async functions
- Return structured error responses: `{ error: string, code?: string }`
- Log errors with context but never expose internal details to clients
- Use HTTP status codes correctly: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)

## Development Workflow

### Before Making Changes
1. Read existing code to understand patterns
2. Check for existing utilities that solve the problem
3. Understand the data flow and dependencies
4. Consider security and compliance implications

### Code Changes
- Prefer editing existing files over creating new ones
- Don't add features beyond what was requested
- Don't refactor unrelated code
- Keep changes minimal and focused
- Add comments only where logic isn't self-evident

### Testing Considerations
- Consider edge cases and error scenarios
- Test with authenticated and unauthenticated users
- Verify visibility controls work correctly
- Check for SQL/NoSQL injection vulnerabilities
