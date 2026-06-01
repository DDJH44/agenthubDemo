export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  private formatMessage(level: string, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${context}]` : '';
    return `[${timestamp}] [${level}]${contextStr} ${message}`;
  }

  debug(message: string, context?: string): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, context));
    }
  }

  info(message: string, context?: string): void {
    if (this.level <= LogLevel.INFO) {
      console.info(this.formatMessage('INFO', message, context));
    }
  }

  warn(message: string, context?: string): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, context));
    }
  }

  error(message: string, error?: Error, context?: string): void {
    if (this.level <= LogLevel.ERROR) {
      const errorMessage = error ? `${message}: ${error.message}` : message;
      console.error(this.formatMessage('ERROR', errorMessage, context));
      if (error?.stack) {
        console.error(error.stack);
      }
    }
  }
}

export const logger = new Logger(LogLevel.DEBUG);