/**
 * Structured application logger.
 *
 * Emits one JSON object per line so logs are queryable without a log
 * aggregation dependency. Values are written verbatim; callers must never pass
 * passwords, tokens or confidential student records.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = String(process.env.LOG_LEVEL || "info").toLowerCase();
const threshold = LEVELS[configuredLevel] ?? LEVELS.info;

function emit(level, message, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message, fields) => emit("debug", message, fields),
  info: (message, fields) => emit("info", message, fields),
  warn: (message, fields) => emit("warn", message, fields),
  error: (message, fields) => emit("error", message, fields),
  child(baseFields = {}) {
    return {
      debug: (message, fields) => emit("debug", message, { ...baseFields, ...fields }),
      info: (message, fields) => emit("info", message, { ...baseFields, ...fields }),
      warn: (message, fields) => emit("warn", message, { ...baseFields, ...fields }),
      error: (message, fields) => emit("error", message, { ...baseFields, ...fields }),
    };
  },
};

export default logger;