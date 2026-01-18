import { emit } from '@tauri-apps/api/event';
import { formatDateTimeToBeijing } from '../utils/timeUtils';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
}

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: ((logs: LogEntry[]) => void)[] = [];
  private readonly MAX_LOGS = 1000;

  private generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  private formatTimestamp(): string {
    return formatDateTimeToBeijing(Date.now(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-');
  }

  private formatMessage(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }

  private addLog(level: LogLevel, ...args: any[]): void {
    const message = this.formatMessage(args);
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: this.formatTimestamp(),
      level,
      message,
      details: args.length > 1 ? args : undefined
    };

    this.logs.push(entry);

    // Maintain max log limit
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }

    // Store in localStorage for cross-window sharing
    try {
      const storedLogs = JSON.parse(localStorage.getItem('matrix-logs') || '[]');
      storedLogs.push(entry);
      if (storedLogs.length > this.MAX_LOGS) {
        storedLogs.splice(0, storedLogs.length - this.MAX_LOGS);
      }
      localStorage.setItem('matrix-logs', JSON.stringify(storedLogs));
    } catch (error) {
      // Ignore localStorage errors
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener([...this.logs]);
      } catch (error) {
        console.error('Logger listener error:', error);
      }
    });

    // Emit Tauri event for multi-window support
    try {
      emit('log-message', entry);
    } catch (error) {
      // Ignore emit errors in environments without Tauri
    }
  }

  // Public methods
  info(...args: any[]): void {
    this.addLog('info', ...args);
  }

  warn(...args: any[]): void {
    this.addLog('warn', ...args);
  }

  error(...args: any[]): void {
    this.addLog('error', ...args);
  }

  success(...args: any[]): void {
    this.addLog('success', ...args);
  }

  clear(): void {
    this.logs = [];
    this.listeners.forEach(listener => {
      try {
        listener([]);
      } catch (error) {
        console.error('Logger listener error:', error);
      }
    });
  }

  // Subscription methods
  subscribe(callback: (logs: LogEntry[]) => void): () => void {
    this.listeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Get current logs
  getLogs(): LogEntry[] {
    return [...this.logs];
  }
}

// Export singleton instance
export const logger = new LoggerService();