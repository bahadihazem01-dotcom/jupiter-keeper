type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry = data
    ? `[${timestamp()}] [${level}] ${message} ${JSON.stringify(data)}`
    : `[${timestamp()}] [${level}] ${message}`;

  if (level === "ERROR") {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log("INFO", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("WARN", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("ERROR", msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => log("DEBUG", msg, data),
};
