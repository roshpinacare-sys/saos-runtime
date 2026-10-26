// ewma-circuit-breaker.mjs - מודול בקרת קצב וטיפול בשגיאות מבוזר
// יישום מחדש של מנגנון EWMA circuit-breaker עם יכולות fail-closed
// התבסס על snippets מקבצי fabric: cmvnp1gi/ewma-circuit-breaker-artery-pacer-mjs.js

class EWMA {
  constructor(alpha) {
    this.alpha = alpha; // מקדם EWMA (0 < alpha < 1)
    this.value = 0; // ערך EWMA הנוכחי
  }

  update(newValue) {
    this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    return this.value;
  }

  getValue() {
    return this.value;
  }
}

class CircuitBreaker {
  constructor({
    threshold = 0.5, // סף התראה
    windowSize = 100, // גודל חלון הזמן לחישוב EWMA
    openTimeout = 60000, // זמן פתיחה מחדש במילישניות
    alpha = 0.1, // מקדם EWMA
    minRequests = 10, // מינימום בקשות לפני הפעלת ה-breaker
  }) {
    this.threshold = threshold;
    this.windowSize = windowSize;
    this.openTimeout = openTimeout;
    this.alpha = alpha;
    this.minRequests = minRequests;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.requests = 0;
    this.lastFailureTime = 0;
    this.ewma = new EWMA(alpha);
    this.requestTimes = [];
  }

  async execute(fn, ...args) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.openTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const startTime = Date.now();
      const result = await fn(...args);
      const responseTime = Date.now() - startTime;
      
      this.recordSuccess(responseTime);
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordSuccess(responseTime) {
    this.successes++;
    this.requests++;
    this.requestTimes.push({
      time: Date.now(),
      success: true,
      responseTime
    });
    
    // עדכן EWMA עם זמן התגובה המוצלח
    this.ewma.update(responseTime);
    
    // שמור רק על בקשות אחרונות בחלון הזמן
    this.pruneRequestTimes();
    
    // אם במצב HALF_OPEN והיו הצלחות, סגור מחדש
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failures = 0;
    }
    
    // בדוק אם צריך לסגור מחדש את ה-breaker
    this.checkState();
  }

  recordFailure() {
    this.failures++;
    this.requests++;
    this.lastFailureTime = Date.now();
    
    this.requestTimes.push({
      time: Date.now(),
      success: false
    });
    
    // שמור רק על בקשות אחרונות בחלון הזמן
    this.pruneRequestTimes();
    
    // אם היו מספיק ניסיונות, פתח את ה-breaker
    if (this.requests >= this.minRequests) {
      this.state = 'OPEN';
    }
  }

  pruneRequestTimes() {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(
      req => now - req.time < this.windowSize
    );
  }

  checkState() {
    if (this.state === 'CLOSED' && this.requests >= this.minRequests) {
      const failureRate = this.failures / this.requests;
      if (failureRate > this.threshold) {
        this.state = 'OPEN';
      }
    }
  }

  getState() {
    return this.state;
  }

  getStats() {
    const now = Date.now();
    const recentFailures = this.requestTimes.filter(
      req => !req.success && now - req.time < this.windowSize
    ).length;
    
    const recentRequests = this.requestTimes.length;
    const failureRate = recentRequests > 0 ? recentFailures / recentRequests : 0;
    
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requests: this.requests,
      failureRate,
      ewmaResponseTime: this.ewma.getValue(),
      minRequests: this.minRequests,
      threshold: this.threshold
    };
  }
}

// ייצור מופע גלובלי של ה-Circuit Breaker
const circuitBreaker = new CircuitBreaker({
  threshold: 0.5, // סף התראה של 50% כשלונות
  windowSize: 100, // חלון זמן של 100 בקשות
  openTimeout: 60000, // פתיחה מחדש אחרי 60 שניות
  alpha: 0.1, // מקדם EWMA
  minRequests: 10 // מינימום 10 בקשות לפני הפעלת ה-breaker
});

// API לשימוש על ידי הסוכנים
const CircuitBreakerAPI = {
  // הפעלת פונקציה עם בקרת קצב
  async execute(fn, ...args) {
    return circuitBreaker.execute(fn, ...args);
  },
  
  // קבלת סטטיסטיקות
  getStats() {
    return circuitBreaker.getStats();
  },
  
  // קבלת מצב ה-breaker
  getState() {
    return circuitBreaker.getState();
  },
  
  // עדכון הגדרות
  updateSettings(newSettings) {
    Object.assign(circuitBreaker, newSettings);
  },
  
  // איפוס ה-breaker
  reset() {
    circuitBreaker.state = 'CLOSED';
    circuitBreaker.failures = 0;
    circuitBreaker.successes = 0;
    circuitBreaker.requests = 0;
    circuitBreaker.lastFailureTime = 0;
    circuitBreaker.ewma = new EWMA(circuitBreaker.alpha);
    circuitBreaker.requestTimes = [];
  }
};

// ייצור ייצוא מודול
export default CircuitBreakerAPI;

// דוגמאות לבדיקות יחידה (להוסף בקובץ נפרד)
// describe('CircuitBreaker', () => {
//   let breaker;
//   
//   beforeEach(() => {
//     breaker = new CircuitBreaker({
//       threshold: 0.5,
//       windowSize: 100,
//       openTimeout: 100,
//       minRequests: 5
//     });
//   });
//   
//   it('should start in CLOSED state', () => {
//     expect(breaker.getState()).toBe('CLOSED');
//   });
//   
//   it('should transition to OPEN after exceeding threshold', async () => {
//     // הוסף בדיקות לסימולציה של כשלונות
//   });
//   
//   it('should reset after timeout', async () => {
//     // הוסף בדיקות לסימולציה של זמן המתנה
//   });
// });

// דוגמה לשימוש בסוכן
// async function exampleUsage() {
//   try {
//     const result = await CircuitBreakerAPI.execute(
//       someApiCall, // פונקציה להפעלה
//       'param1', 'param2' // פרמטרים
//     );
//     console.log('Success:', result);
//   } catch (error) {
//     console.error('Failed:', error.message);
//     // טיפול בשגיאה או ניסיון חלופי
//   }
//   
//   // קבלת סטטיסטיקות
//   const stats = CircuitBreakerAPI.getStats();
//   console.log('Circuit Breaker Stats:', stats);
// }
