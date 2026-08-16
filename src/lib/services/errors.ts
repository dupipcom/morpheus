import { NextResponse } from 'next/server'

/**
 * Structured HTTP error thrown by services and caught by route handlers.
 * Carries an HTTP status, a machine-readable code (e.g. 'FORBIDDEN', 'P2002'),
 * and a user-safe message.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Convert an ApiError into a NextResponse. Body follows the v1 convention
 * ({ error: string }) with the machine-readable code added alongside.
 */
export function toResponse(error: ApiError): NextResponse {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  )
}
