import { EventEmitter } from 'events';

/**
 * CircuitBreaker - מנגנון למניעת שגיאות מצטברות עם הגדרות גמישות
 */
class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 60000;
    this.monitoringInterval = options.monitoringInterval || 30000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.timeoutId = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        this.emit('stateChange', 'HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.successes++;
    
    if (this.state === 'HALF_OPEN' && this.successes >= this.successThreshold) {
      this.state = 'CLOSED';
      this.emit('stateChange', 'CLOSED');
    }
  }

  onFailure() {
    this.failures++;
    this.successes = 0;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN' || this.state === 'CLOSED') {
      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        this.emit('stateChange', 'OPEN');
        this.startTimeout();
      }
    }
  }

  startTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    this.timeoutId = setTimeout(() => {
      if (this.state === 'OPEN') {
        this.state = 'HALF_OPEN';
        this.emit('stateChange', 'HALF_OPEN');
      }
    }, this.timeout);
  }
}

/**
 * ExponentialBackoff - מנגנון לחישוב זמני המתנה מעריכי
 */
class ExponentialBackoff {
  constructor(options = {}) {
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.jitter = options.jitter || true;
    this.attempts = 0;
  }

  nextDelay() {
    let delay = this.initialDelay * Math.pow(this.factor, this.attempts);
    
    if (delay > this.maxDelay) {
      delay = this.maxDelay;
    }
    
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    this.attempts++;
    return delay;
  }

  reset() {
    this.attempts = 0;
  }
}

/**
 * ErrorHandler - מחליף ל-artery-pacer.mjs עם טיפול מתקדם בשגיאות
 */
class ErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker || {});
    this.backoff = new ExponentialBackoff(options.backoff || {});
    this.maxRetries = options.maxRetries || 3;
    this.fallbackFn = options.fallbackFn || null;
    this.errorHandlers = new Map();
    
    // הגדרת ברירת מחדל לטיפול בשגיאות
    this.setErrorHandler('default', (error, context) => {
      this.emit('error', error, context);
    });
  }

  /**
   * הגדרת טיפול מותאם לסוג שגיאה ספציפי
   * @param {string} errorType - סוג השגיאה
   * @param {Function} handler - פונקציית הטיפול
   */
  setErrorHandler(errorType, handler) {
    this.errorHandlers.set(errorType, handler);
  }

  /**
   * ביצוע פונקציה עם טיפול מתקדם בשגיאות
   * @param {Function} fn - הפונקציה לביצוע
   * @param {Object} context - הקשר עם נתונים נלווים
   * @param {Object} options - אפשרויות עודפות לביצוע
   * @returns {Promise} - תוצאת הביצוע
   */
  async execute(fn, context = {}, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    const currentContext = { ...context, timestamp: Date.now() };
    
    const executeWithRetry = async (attempt = 0) => {
      try {
        const result = await this.circuitBreaker.execute(() => fn());
        this.backoff.reset();
        return result;
      } catch (error) {
        const errorType = error.constructor.name;
        const handler = this.errorHandlers.get(errorType) || this.errorHandlers.get('default');
        
        // קריאה לטיפול המתאים
        await handler(error, currentContext);
        
        // בדיקת ניתוב מחדש אוטומטי
        if (this.shouldRetry(error, attempt, maxRetries)) {
          const delay = this.backoff.nextDelay();
          this.emit('retry', { attempt, delay, error });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return executeWithRetry(attempt + 1);
        }
        
        // בדיקת ברירת מחדל
        if (this.fallbackFn) {
          this.emit('fallback', error);
          return this.fallbackFn(error, currentContext);
        }
        
        throw error;
      }
    };
    
    return executeWithRetry();
  }

  /**
   * החלטה האם לנסות שוב לאחר שגיאה
   * @param {Error} error - השגיאה שהתרחשה
   * @param {number} attempt - מספר הניסיון הנוכחי
   * @param {number} maxRetries - מספר הניסיונות המרבי
   * @returns {boolean} - האם לנסות שוב
   */
  shouldRetry(error, attempt, maxRetries) {
    // לא מנסים שוב אם הגענו למספר הניסיונות המרבי
    if (attempt >= maxRetries) {
      return false;
    }
    
    // לא מנסים שוב אם השגיאה היא טיפוסית (לא ניתן לתקן על ידי ניסיון חוזר)
    if (error.name === 'TypeError' || error.name === 'SyntaxError') {
      return false;
    }
    
    // מנסים שוב אם זו שגיאת רשת או זמן המתנת
    return error.name === 'NetworkError' || 
           error.name === 'TimeoutError' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ETIMEDOUT';
  }

  /**
   * קבלת מצב מנתב המעגלים הנוכחי
   * @returns {string} - מצב המנתב
   */
  getCircuitState() {
    return this.circuitBreaker.state;
  }

  /**
   * איפוס מצב המנתב
   */
  resetCircuit() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.successes = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.backoff.reset();
    this.emit('circuitReset');
  }
}

// ייצור ממשק API תואם ל-artery-pacer.mjs
const createErrorHandler = (options = {}) => {
  return new ErrorHandler(options);
};

export { ErrorHandler, CircuitBreaker, ExponentialBackoff, createErrorHandler };
