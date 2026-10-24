import { setInterval } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// סף התראה לניצולת זיכרון (85%)
const MEMORY_THRESHOLD = 0.85;

// ניטור זיכרון אקטיבי
class MemoryMonitor {
  constructor() {
    this.heapUsage = process.memoryUsage();
    this.maxMemory = this.heapUsage.heapTotal;
    this.tempObjects = new Map();
    this.objectCounter = 0;
    this.monitoringInterval = null;
    this.cleanupInterval = null;
    this.logBuffer = [];
  }

  // קבלת ניצולת הזיכרון הנוכחית
  getMemoryUsage() {
    const currentUsage = process.memoryUsage();
    const usageRatio = currentUsage.heapUsed / currentUsage.heapTotal;
    return {
      used: currentUsage.heapUsed,
      total: currentUsage.heapTotal,
      ratio: usageRatio
    };
  }

  // יצירת אובייקט זמני עם מזהה ייחודי
  createTempObject(data, ttl = 300000) { // ברירת מחדל: 5 דקות
    const id = `temp_${++this.objectCounter}_${Date.now()}`;
    const object = {
      id,
      data,
      createdAt: Date.now(),
      ttl,
      hash: createHash('sha256').update(JSON.stringify(data)).digest('hex')
    };
    
    this.tempObjects.set(id, object);
    return id;
  }

  // זיהוי אובייקטים זמניים שפג תוקפם
  identifyExpiredObjects() {
    const now = Date.now();
    const expired = [];
    
    for (const [id, obj] of this.tempObjects) {
      if (now - obj.createdAt > obj.ttl) {
        expired.push(id);
      }
    }
    
    return expired;
  }

  // טיהור אובייקטים זמניים
  cleanupExpiredObjects() {
    const expired = this.identifyExpiredObjects();
    const cleaned = [];
    
    for (const id of expired) {
      const obj = this.tempObjects.get(id);
      if (obj) {
        this.tempObjects.delete(id);
        cleaned.push({ id, hash: obj.hash });
        this.log(`Cleaned expired object: ${id}`);
      }
    }
    
    return cleaned;
  }

  // טיהור זיכרון כאשר הניצולת עולה על הסף
  forceCleanup() {
    const usage = this.getMemoryUsage();
    
    if (usage.ratio > MEMORY_THRESHOLD) {
      this.log(`Memory usage exceeded threshold (${(usage.ratio * 100).toFixed(2)}%). Starting cleanup.`);
      
      // טיהור אובייקטים פגומים תחילה
      const cleanedExpired = this.cleanupExpiredObjects();
      
      // אם עדיין מעל הסף, טיהור אובייקטים זמניים אקראיים
      const remainingObjects = Array.from(this.tempObjects.keys());
      if (remainingObjects.length > 0 && usage.ratio > MEMORY_THRESHOLD) {
        const toClean = Math.floor(remainingObjects.length * 0.3); // טיהור 30% מהאובייקטים
        const cleanedRandom = [];
        
        for (let i = 0; i < toClean; i++) {
          const randomIndex = Math.floor(Math.random() * remainingObjects.length);
          const id = remainingObjects.splice(randomIndex, 1)[0];
          const obj = this.tempObjects.get(id);
          if (obj) {
            this.tempObjects.delete(id);
            cleanedRandom.push({ id, hash: obj.hash });
            this.log(`Force cleaned object: ${id}`);
          }
        }
        
        return { cleanedExpired, cleanedRandom };
      }
      
      return { cleanedExpired, cleanedRandom: [] };
    }
    
    return { cleanedExpired: [], cleanedRandom: [] };
  }

  // רישום לוג מינימלי
  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logBuffer.push(logEntry);
    
    // שמירת הלוגים לקובץ
    if (this.logBuffer.length >= 10) {
      this.saveLogs();
    }
  }

  // שמירת לוגים לקובץ
  saveLogs() {
    const logPath = join(process.cwd(), 'state', 'memory-monitor-logs.json');
    
    try {
      const logData = {
        timestamp: new Date().toISOString(),
        logs: this.logBuffer
      };
      
      // יצירת תיקייה אם לא קיימת
      const stateDir = join(process.cwd(), 'state');
      if (!existsSync(stateDir)) {
        import('node:fs').then(fs => {
          fs.mkdirSync(stateDir, { recursive: true });
          writeFileSync(logPath, JSON.stringify(logData, null, 2));
        });
      } else {
        writeFileSync(logPath, JSON.stringify(logData, null, 2));
      }
      
      // ניקוי הבאפר
      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to save logs:', error);
    }
  }

  // בדיקת עומס מקבילי
  async runParallelLoadTest(concurrentTasks = 5) {
    this.log(`Starting parallel load test with ${concurrentTasks} tasks`);
    
    const startTime = Date.now();
    const results = [];
    
    // יצירת משימות מקביליות
    const tasks = Array(concurrentTasks).fill().map(async (_, i) => {
      const taskId = `load_test_${i}`;
      
      // יצירת אובייקטים רבים לסימולציית עומס
      for (let j = 0; j < 1000; j++) {
        const data = {
          taskId,
          iteration: j,
          payload: 'x'.repeat(1024) // 1KB נתונים לכל אובייקט
        };
        
        const id = this.createTempObject(data, 60000); // TTL של 1 דקה
        results.push({ taskId, iteration: j, objectId: id });
      }
      
      // בדיקת זיכרון באמצעות
      const usage = this.getMemoryUsage();
      this.log(`Task ${taskId} memory usage: ${(usage.ratio * 100).toFixed(2)}%`);
      
      // המתנה קצרה לסימולציית עבודה
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // הפעלת כל המשימות במקביל
    await Promise.all(tasks);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    this.log(`Parallel load test completed in ${duration}ms`);
    
    // טיהור האובייקטים שנוצרו בבדיקה
    this.cleanupExpiredObjects();
    
    return {
      duration,
      tasksCreated: results.length,
      finalMemoryUsage: this.getMemoryUsage()
    };
  }

  // התחלת המערכת
  start() {
    this.log('Starting memory monitoring system');
    
    // ניטור רציף כל 30 שניות
    this.monitoringInterval = setInterval(async () => {
      const usage = this.getMemoryUsage();
      this.log(`Memory usage: ${(usage.ratio * 100).toFixed(2)}%`);
      
      // בדיקה אם חורגים מהסף
      if (usage.ratio > MEMORY_THRESHOLD) {
        this.forceCleanup();
      }
    }, 30000);
    
    // טיהור קבוע של אובייקטים פגומים כל דקה
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredObjects();
    }, 60000);
    
    return this;
  }

  // עצירת המערכת
  stop() {
    this.log('Stopping memory monitoring system');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // שמירת הלוגים האחרונים
    this.saveLogs();
  }
}

// ייצוא המחלקה לשימוש במערכת
export default MemoryMonitor;

// קוד להפעלה ישירה (לבדיקות)
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new MemoryMonitor().start();
  
  // הוספת טיפול ביציאה נקודתית
  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });
  
  // יצירת כמה אובייקטים לדוגמה
  for (let i = 0; i < 5; i++) {
    const data = {
      sample: `Sample data ${i}`,
      timestamp: Date.now(),
      payload: 'x'.repeat(2048)
    };
    monitor.createTempObject(data, 120000);
  }
  
  // המתנה להפעלת בדיקות
  console.log('Memory monitor running. Press Ctrl+C to stop.');
  
  // הפעלת בדיקת עומס מקבילי אחרי 5 שניות
  setTimeout(async () => {
    console.log('\nRunning parallel load test...');
    const result = await monitor.runParallelLoadTest(3);
    console.log('Load test result:', result);
  }, 5000);
}