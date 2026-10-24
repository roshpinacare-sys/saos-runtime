import { performance } from 'perf_hooks';

// מחלקה למעקב אחר אובייקטים וניהול זיכרון
class MemoryTracker {
  constructor() {
    this.objects = new Map();
    this.memoryThreshold = 0.8; // 80% ניצולת זיכרון
    this.maxMemoryUsage = 0.85; // 85% ניצולת זיכרון מרבית
    this.eventLog = [];
    this.cleanupInterval = null;
  }

  // רישום אובייקט חדש במערכת
  registerObject(id, object, referrer = null) {
    const timestamp = performance.now();
    this.objects.set(id, {
      object,
      referrer,
      lastAccessed: timestamp,
      createdAt: timestamp,
      accessedCount: 0
    });
    this.logEvent(`Object registered: ${id}`);
  }

  // עדכון גישה לאובייקט
  accessObject(id) {
    const obj = this.objects.get(id);
    if (obj) {
      obj.lastAccessed = performance.now();
      obj.accessedCount++;
    }
  }

  // זיהוי אובייקטים שאינם בשימוש
  findUnusedObjects(thresholdMs = 60000) { // 60 שניות ברירת מחדל
    const currentTime = performance.now();
    const unusedObjects = [];
    
    for (const [id, obj] of this.objects) {
      const timeSinceAccess = currentTime - obj.lastAccessed;
      if (timeSinceAccess > thresholdMs) {
        unusedObjects.push({ id, ...obj });
      }
    }
    
    return unusedObjects;
  }

  // איסוף זיכרון פרואקטיבי
  proactiveMemoryCleanup() {
    const memUsage = process.memoryUsage();
    const heapUsedRatio = memUsage.heapUsed / memUsage.heapTotal;
    
    if (heapUsedRatio > this.memoryThreshold) {
      this.logEvent(`Memory threshold exceeded: ${(heapUsedRatio * 100).toFixed(2)}%`);
      
      // איסוף אובייקטים שאינם בשימוש
      const unusedObjects = this.findUnusedObjects();
      
      if (unusedObjects.length > 0) {
        this.logEvent(`Found ${unusedObjects.length} unused objects`);
        
        // מחיקת האובייקטים
        unusedObjects.forEach(obj => {
          this.objects.delete(obj.id);
          this.logEvent(`Cleaned up unused object: ${obj.id}`);
        });
      }
      
      // אם עדיין חורגים מהסף המרבי
      if (heapUsedRatio > this.maxMemoryUsage) {
        this.logEvent(`Critical memory usage: ${(heapUsedRatio * 100).toFixed(2)}% - triggering emergency cleanup`);
        this.emergencyCleanup();
      }
    }
  }

  // איסוף חירום
  emergencyCleanup() {
    const memUsage = process.memoryUsage();
    const heapUsedRatio = memUsage.heapUsed / memUsage.heapTotal;
    
    // מחיקת כל האובייקטים למעט האחרונים שגישנו אליהם
    const currentTime = performance.now();
    const recentObjects = [];
    
    for (const [id, obj] of this.objects) {
      const timeSinceAccess = currentTime - obj.lastAccessed;
      if (timeSinceAccess < 5000) { // 5 שניות
        recentObjects.push(id);
      }
    }
    
    // שמירת האובייקטים האחרונים
    const backup = new Map();
    recentObjects.forEach(id => {
      backup.set(id, this.objects.get(id));
    });
    
    // ניקוי מלא
    this.objects.clear();
    
    // שחזור האובייקטים האחרונים
    backup.forEach((obj, id) => {
      this.objects.set(id, obj);
    });
    
    this.logEvent(`Emergency cleanup completed. Kept ${recentObjects.length} recent objects`);
  }

  // רישום אירועים
  logEvent(message) {
    const timestamp = new Date().toISOString();
    const event = {
      timestamp,
      message,
      memoryUsage: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal * 100).toFixed(2) + '%'
      }
    };
    
    this.eventLog.push(event);
    
    // שמירת האירועים האחרונים 100
    if (this.eventLog.length > 100) {
      this.eventLog = this.eventLog.slice(-100);
    }
    
    console.log(`[${timestamp}] ${message}`);
  }

  // הפעלת מערכת המעקב
  start() {
    this.logEvent('Memory tracker started');
    
    // בדיקה קבועה כל 30 שניות
    this.cleanupInterval = setInterval(() => {
      this.proactiveMemoryCleanup();
    }, 30000);
  }

  // עצירת מערכת המעקב
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.logEvent('Memory tracker stopped');
  }

  // קבלת דוח על מצב הזיכרון
  getMemoryReport() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2) + '%',
      objectsTracked: this.objects.size,
      eventsLogged: this.eventLog.length,
      unusedObjects: this.findUnusedObjects().length
    };
  }
}

// ייצוא המחלקה לשימוש במערכת
export default MemoryTracker;

// דוגמה לשימוש במערכת
if (import.meta.url === `file://${process.argv[1]}`) {
  const tracker = new MemoryTracker();
  
  // הפעלת המערכת
  tracker.start();
  
  // יצירת אובייקטים לדוגמה
  const obj1 = { data: Array(1000000).fill('test') };
  tracker.registerObject('obj1', obj1);
  
  const obj2 = { data: Array(500000).fill('example') };
  tracker.registerObject('obj2', obj2);
  
  // גישה לאובייקט
  tracker.accessObject('obj1');
  
  // המתנה להפעלת האיסוף האוטומטי
  setTimeout(() => {
    console.log('\nMemory Report:');
    console.log(tracker.getMemoryReport());
    
    // עצירת המערכת
    tracker.stop();
  }, 35000);
}