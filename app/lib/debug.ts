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
  private _maxLogs: number = 1000;
  private _isEnabled: boolean = false;
  private _listeners: Set<(entry: LogEntry) => void> = new Set();
  private _originalFetch: typeof fetch | null = null;
  private _originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

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
      // Log request
      this._log('info', 'network', `API Request [${requestId}]`, {
        url,
        method: options?.method || 'GET',
        headers: options?.headers,
        body: options?.body ? JSON.parse(options.body as string) : undefined,
      });

      // Call the original fetch with the correct 'this' context
      const originalResponse = await this._originalFetch!.apply(window, args);
      const duration = performance.now() - startTime;

      // Create a clone for logging purposes
      const responseForLogging = originalResponse.clone();

      // Read and log the response data
      let responseData;

      try {
        responseData = await responseForLogging.json();
      } catch {
        try {
          responseData = await responseForLogging.text();
        } catch {
          responseData = 'Could not read response body';
        }
      }

      // Log response
      this._log('info', 'network', `API Response [${requestId}]`, {
        duration: `${duration.toFixed(2)}ms`,
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers: Object.fromEntries(originalResponse.headers.entries()),
        data: responseData,
      });

      // Return the original response which hasn't been read yet
      return originalResponse;
    } catch {
      const duration = performance.now() - startTime;
      this._log('error', 'network', `API Error [${requestId}]`, {
        duration: `${duration.toFixed(2)}ms`,
      });
      throw new Error(`API Error [${requestId}]`);
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
    // Monitor localStorage changes
    const originalSetItem = localStorage.setItem;

    localStorage.setItem = (key: string, value: string) => {
      this._log('info', 'state', 'LocalStorage Update', { key, value });
      originalSetItem.call(localStorage, key, value);
    };

    // Monitor cookie changes
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
    this._log('info', 'system', 'Debug Mode Enabled', {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    });
  }

  disable() {
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

    // Sanitize data to handle Error objects and circular references
    const sanitizeData = (obj: any): any => {
      try {
        if (obj instanceof Error) {
          return {
            name: obj.name,
            message: obj.message,
            stack: obj.stack,
          };
        }

        if (Array.isArray(obj)) {
          return obj.map((item) => sanitizeData(item));
        }

        if (obj && typeof obj === 'object') {
          const sanitized: any = {};

          for (const key in obj) {
            try {
              sanitized[key] = sanitizeData(obj[key]);
            } catch {
              sanitized[key] = '[Unable to serialize]';
            }
          }

          return sanitized;
        }

        return obj;
      } catch {
        return '[Unable to serialize data]';
      }
    };

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message: String(message),
      data: data ? sanitizeData(data) : undefined,
      trace: trace || new Error().stack?.split('\n').slice(1).join('\n') || undefined,
    };

    this._logs.push(entry);

    if (this._logs.length > this._maxLogs) {
      this._logs.shift();
    }

    this._listeners.forEach((listener) => listener(entry));
  }

  // Public logging methods
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

  // User interaction logging
  logUserAction(action: string, data?: any) {
    this._log('info', 'user', action, data);
  }

  // State change logging
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
