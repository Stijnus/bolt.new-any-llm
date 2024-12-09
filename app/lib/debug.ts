export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  category: 'network' | 'state' | 'user' | 'system' | 'error';
  message: string;
  data?: any;
  trace?: string;
};

class DebugManager {
  private static _instance: DebugManager | null = null;
  private _logs: LogEntry[] = [];
  private _maxLogs: number = 100;
  private _maxDataSize: number = 50 * 1024;
  private _isEnabled: boolean = false;
  private _listeners: Set<(entry: LogEntry) => void> = new Set();
  private _originalFetch: typeof fetch | null = null;
  private _originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  private _cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this._isEnabled = localStorage.getItem('devDebugEnabled') === 'true';

    if (this._isEnabled) {
      this._setupDebugMode();
    }
  }

  private _setupDebugMode() {
    this._interceptNetworkCalls();
    this._interceptConsole();
    this._setupErrorListeners();
    this._monitorStateChanges();
  }

  private _teardownDebugMode() {
    this._restoreNetworkCalls();
    this._restoreConsole();
    this._removeErrorListeners();
  }

  private _interceptNetworkCalls() {
    if (typeof window === 'undefined') {
      return;
    }

    this._originalFetch = window.fetch;
    window.fetch = this._fetch.bind(this);
  }

  private _monitorNetwork() {
    this._interceptNetworkCalls();
  }

  private async _fetch(...args: Parameters<typeof fetch>): Promise<Response> {
    const startTime = performance.now();
    const requestId = Math.random().toString(36).substring(7);
    const [url, options] = args;

    try {
      this._log('info', 'network', `API Request [${requestId}]`, {
        url,
        method: options?.method || 'GET',
      });

      const originalResponse = await this._originalFetch!.apply(window, args);
      const duration = performance.now() - startTime;

      this._log('info', 'network', `API Response [${requestId}]`, {
        duration: `${duration.toFixed(2)}ms`,
        status: originalResponse.status,
        statusText: originalResponse.statusText,
      });

      return originalResponse;
    } catch (error: unknown) {
      const duration = performance.now() - startTime;

      if (error instanceof Error) {
        this._log('error', 'network', `API Error [${requestId}]`, {
          duration: `${duration.toFixed(2)}ms`,
          error: error.message,
        });
      } else {
        this._log('error', 'network', `API Error [${requestId}]`, {
          duration: `${duration.toFixed(2)}ms`,
          error: 'An unknown error occurred',
        });
      }

      throw error;
    }
  }

  private _restoreNetworkCalls() {
    if (this._originalFetch) {
      window.fetch = this._originalFetch;
      this._originalFetch = null;
    }
  }

  private _interceptConsole() {
    console.log = (...args) => {
      this._log('debug', 'system', args[0], args.slice(1));
      this._originalConsole.log.apply(console, args);
    };

    console.info = (...args) => {
      this._log('info', 'system', args[0], args.slice(1));
      this._originalConsole.info.apply(console, args);
    };

    console.warn = (...args) => {
      this._log('warn', 'system', args[0], args.slice(1));
      this._originalConsole.warn.apply(console, args);
    };

    console.error = (...args) => {
      this._log('error', 'system', args[0], args.slice(1));
      this._originalConsole.error.apply(console, args);
    };
  }

  private _restoreConsole() {
    Object.assign(console, this._originalConsole);
  }

  private _setupErrorListeners() {
    if (typeof window === 'undefined') {
      return;
    }

    window.onerror = (message, source, lineno, colno) => {
      this._log('error', 'error', 'Uncaught Error', {
        message,
        source,
        lineno,
        colno,
      });
      return false;
    };

    window.onunhandledrejection = (event) => {
      this._log('error', 'error', 'Unhandled Promise Rejection', {
        reason: event.reason,
      });
    };
  }

  private _removeErrorListeners() {
    if (typeof window === 'undefined') {
      return;
    }

    window.onerror = null;
    window.onunhandledrejection = null;
  }

  private _monitorStateChanges() {
    const originalSetItem = localStorage.setItem;

    localStorage.setItem = (key: string, value: string) => {
      this._log('info', 'state', 'LocalStorage Update', { key, value });
      originalSetItem.call(localStorage, key, value);
    };

    try {
      const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');

      if (cookieDesc?.set) {
        const originalSetter = cookieDesc.set;
        const debugManager = this;
        Object.defineProperty(document, 'cookie', {
          ...cookieDesc,
          set(this: Document, value: string) {
            debugManager._log('info', 'state', 'Cookie Update', { value });
            return originalSetter.call(this, value);
          },
        });
      }
    } catch {
      this._log('warn', 'system', 'Failed to set up cookie monitoring');
    }
  }

  static getInstance(): DebugManager {
    if (!DebugManager._instance) {
      DebugManager._instance = new DebugManager();
    }

    return DebugManager._instance;
  }

  enable() {
    this._isEnabled = true;
    localStorage.setItem('devDebugEnabled', 'true');
    this._setupDebugMode();

    this._cleanupInterval = setInterval(
      () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        this._logs = this._logs.filter((log) => new Date(log.timestamp) > oneHourAgo);
      },
      5 * 60 * 1000,
    );

    this._log('info', 'system', 'Debug Mode Enabled', {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  }

  disable() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    this._log('info', 'system', 'Debug Mode Disabled');
    this._isEnabled = false;
    localStorage.setItem('devDebugEnabled', 'false');
    this._teardownDebugMode();
    this._logs = [];
  }

  private _log(level: LogLevel, category: LogEntry['category'], message: string, data?: any, trace?: string) {
    if (!this._isEnabled) {
      return;
    }

    const truncateData = (obj: any, maxSize: number = this._maxDataSize): any => {
      const size = new TextEncoder().encode(JSON.stringify(obj)).length;

      if (size <= maxSize) {
        return obj;
      }

      if (typeof obj === 'string') {
        return obj.substring(0, Math.floor(maxSize / 2)) + '... [truncated]';
      }

      if (Array.isArray(obj)) {
        return obj.slice(0, 10).map((item) => truncateData(item, maxSize / 10));
      }

      if (obj && typeof obj === 'object') {
        const truncated: any = {};
        let currentSize = 0;

        for (const [key, value] of Object.entries(obj)) {
          if (currentSize >= maxSize) {
            break;
          }

          truncated[key] = truncateData(value, maxSize / 4);
          currentSize += new TextEncoder().encode(JSON.stringify(truncated[key])).length;
        }

        return truncated;
      }

      return obj;
    };

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message: String(message).substring(0, 1000),
      data: data ? truncateData(data) : undefined,
      trace: trace ? trace.split('\n').slice(0, 5).join('\n') : undefined,
    };

    this._logs.unshift(entry);

    if (this._logs.length > this._maxLogs) {
      this._logs.pop();
    }

    this._listeners.forEach((listener) => listener(entry));
  }

  debug(message: string, data?: any) {
    this._log('debug', 'system', message, data);
  }

  info(message: string, data?: any) {
    this._log('info', 'system', message, data);
  }

  warn(message: string, data?: any, trace?: string) {
    this._log('warn', 'system', message, data, trace);
  }

  error(message: string, data?: any) {
    this._log('error', 'system', message, data);
  }

  logUserAction(action: string, data?: any) {
    this._log('info', 'user', action, data);
  }

  logStateChange(component: string, data: { previous: any; current: any }) {
    this._log('info', 'state', `State Change: ${component}`, data);
  }

  getLogs(): LogEntry[] {
    return [...this._logs];
  }

  getLogsByCategory(category: LogEntry['category']): LogEntry[] {
    return this._logs.filter((log) => log.category === category);
  }

  clearLogs() {
    this._logs = [];
    this._log('info', 'system', 'Logs cleared');
  }

  addListener(callback: (entry: LogEntry) => void) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  isDebugEnabled(): boolean {
    return this._isEnabled;
  }
}

export const debug = DebugManager.getInstance();
