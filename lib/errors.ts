import { NextResponse } from 'next/server';

/**
 * Typed errors thrown by the service layer.
 *
 * Services know what went wrong but not how it should be reported: an HTTP route
 * turns these into status codes, an MCP tool turns them into an `isError` result.
 * Keeping the mapping out of the services is what lets both callers share one
 * implementation.
 */
export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 400, 'validation_error');
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = 'Not found') {
    super(message, 404, 'not_found');
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'forbidden');
  }
}

/** 409. Used for worker-slot exhaustion and for illegal state transitions. */
export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, 409, 'conflict');
  }
}

export class CapacityError extends ConflictError {}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Map a thrown value onto a JSON response. Unknown errors are logged with their
 * context and reported as a generic 500 -- service errors are safe to surface,
 * arbitrary exceptions are not.
 */
export function toErrorResponse(error: unknown, context: string, fallbackMessage: string) {
  if (isServiceError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context}:`, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/** The same mapping for a non-HTTP caller (MCP tools, the agent loop). */
export function toErrorMessage(error: unknown, context: string, fallbackMessage: string): string {
  if (isServiceError(error)) return error.message;
  console.error(`${context}:`, error);
  return fallbackMessage;
}
