type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 200;
const logBuffer: LogEntry[] = [];
const logListeners: Set<(entry: LogEntry) => void> = new Set();

export function getLogBuffer(): LogEntry[] {
  return logBuffer;
}

export function onLogEntry(listener: (entry: LogEntry) => void): () => void {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const entry: LogEntry = { timestamp: ts, level, message, data };

  // Console output
  const text = data
    ? `[${ts}] [${level}] ${message} ${JSON.stringify(data)}`
    : `[${ts}] [${level}] ${message}`;

  if (level === "ERROR") {
    console.error(text);
  } else {
    console.log(text);
  }

  // Buffer for dashboard
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
  }

  // Notify listeners
  for (const listener of logListeners) {
    listener(entry);
  }
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log("INFO", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("WARN", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("ERROR", msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => log("DEBUG", msg, data),
};
