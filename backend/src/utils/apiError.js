/**
 * Structured HTTP error handling.
 *
 * Every failure the API reports to the browser carries a status code, a safe
 * human message and an optional machine code. Stack traces, file paths,
 * driver messages and credentials never cross the boundary: an unexpected
 * error becomes a generic 500 with a request id, while the technical detail is
 * written to the server log where operators can see it.
 */

export class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code || null;
    this.details = details || null;
    this.expose = true;
  }
}

export const badRequest = (message, details) =>
  new ApiError(400, message, { code: "BAD_REQUEST", details });

export const validationError = (message, details) =>
  new ApiError(422, message, { code: "VALIDATION_FAILED", details });

export const unauthorized = (message = "Authentication required.") =>
  new ApiError(401, message, { code: "UNAUTHENTICATED" });

export const forbidden = (message = "Access denied. Insufficient permissions.") =>
  new ApiError(403, message, { code: "FORBIDDEN" });

export const notFound = (message = "Record not found.") =>
  new ApiError(404, message, { code: "NOT_FOUND" });

export const conflict = (message, details) =>
  new ApiError(409, message, { code: "CONFLICT", details });

export const gone = (message) => new ApiError(410, message, { code: "GONE" });

/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware instead of hanging the request.
 */
export function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Client-safe error serialisation. Known `ApiError`s keep their message;
 * anything else is logged with full detail and reported as an opaque 500.
 */
export function toErrorResponse(error, { logContext } = {}) {
  const requestId = `req_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code || undefined,
        details: error.details || undefined,
        requestId,
      },
    };
  }

  // Mongoose validation and duplicate-key failures are expected input
  // problems, not server faults, so they are reported precisely.
  if (error?.name === "ValidationError") {
    const details = Object.values(error.errors || {}).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    return {
      status: 422,
      body: {
        error: "Some submitted values are not valid.",
        code: "VALIDATION_FAILED",
        details,
        requestId,
      },
    };
  }
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || "value";
    return {
      status: 409,
      body: {
        error: `That ${field} is already in use.`,
        code: "DUPLICATE_KEY",
        requestId,
      },
    };
  }
  if (error?.name === "CastError") {
    return {
      status: 400,
      body: {
        error: `Invalid value supplied for ${error.path}.`,
        code: "INVALID_IDENTIFIER",
        requestId,
      },
    };
  }

  // A route that deliberately marks its own error as client-safe — a refused
  // upload, for example — keeps its message even though it is not an ApiError.
  // Nothing else reaches the browser with a driver or filesystem message.
  const exposedStatus = Number(error?.status || error?.statusCode);
  if (
    error?.expose === true &&
    Number.isInteger(exposedStatus) &&
    exposedStatus >= 400 &&
    exposedStatus < 500
  ) {
    return {
      status: exposedStatus,
      body: { error: error.message, code: error.code || undefined, requestId },
    };
  }

  // Middleware such as `express.static` reports client-side problems (a missing
  // asset, an unsupported media type) with a 4xx status and no useful message.
  // Those statuses are honoured with a generic, safe description. Application
  // errors that carry a 4xx status and a safe message are surfaced so the UI can
  // explain the real validation/authorization problem.
  const middlewareStatus = Number(error?.status || error?.statusCode);
  if (Number.isInteger(middlewareStatus) && middlewareStatus >= 400 && middlewareStatus < 500) {
    const safeMessage =
      typeof error?.message === "string" && error.message.trim() && error.expose !== false
        ? error.message.trim()
        : "The requested resource could not be delivered.";
    return {
      status: middlewareStatus,
      body: {
        error: safeMessage,
        code: error?.code || "REQUEST_FAILED",
        requestId,
      },
    };
  }

  console.error(`[${requestId}]${logContext ? ` ${logContext}` : ""} Unhandled error:`, error);
  return {
    status: 500,
    body: {
      error:
        "The server could not complete this request. Please try again, and report the reference below if it keeps happening.",
      code: "INTERNAL_ERROR",
      requestId,
    },
  };
}
