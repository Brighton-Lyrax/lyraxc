/**
 * Base error type for all Lyraxc domain/application errors.
 *
 * Extending a common class lets the HTTP and CLI layers translate errors into
 * appropriate responses (status codes, exit codes) in a single place.
 */
export class AppError extends Error {
  /** Machine-readable error code, e.g. `VALIDATION_ERROR`. */
  public readonly code: string;
  /** Suggested HTTP status code for API responses. */
  public readonly statusCode: number;
  /** Optional structured context for logging/debugging. */
  public readonly details?: unknown;

  constructor(
    message: string,
    options: { code?: string; statusCode?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? 'APP_ERROR';
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/** Raised when user input or configuration fails validation. */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 400, details });
  }
}

/** Raised when a requested resource (session, task) does not exist. */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, { code: 'NOT_FOUND', statusCode: 404 });
  }
}

/** Raised when the agent is not permitted to perform an action (e.g. blocked domain). */
export class SafetyError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'SAFETY_VIOLATION', statusCode: 403, details });
  }
}

/** Raised when a browser operation fails. */
export class BrowserError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'BROWSER_ERROR', statusCode: 502, details });
  }
}

/** Raised when the LLM planner fails or returns an invalid plan. */
export class PlannerError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'PLANNER_ERROR', statusCode: 502, details });
  }
}

/** Type guard to detect our own errors. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Normalize any thrown value into an Error instance. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : JSON.stringify(value));
}
