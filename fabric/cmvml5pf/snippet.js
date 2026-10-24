import { createHash } from 'crypto';

// מערכת ניטור זיכרון בזמן-אמת
class MemoryMonitor {
  constructor() {
    this.threshold = 0.8; // 80% מהזיכרון הזמין
    this.currentUsage = 0;
    this.tasks = new Map();
    this.taskPriority = new Map();
    this.compressionQueue = [];
  }

  // עדכון מצב הזיכרון הנוכחי
  updateMemoryUsage() {
    // במערכת ממשית, נשתמש ב-API של Node.js כדי לקבל נתוני זיכרון
    // לדוגמה: const memoryUsage = process.memoryUsage();
    // כאן מדמים עדכון זיכרון
    this.currentUsage = Math.random();
    return this.currentUsage;
  }

  // בדיקה אם הסף הקריטי הושג
  isThresholdExceeded() {
    return this.currentUsage >= this.threshold;
  }

  // הוספת משימה למערכת
  addTask(taskId, taskData, priority) {
    this.tasks.set(taskId, taskData);
    this.taskPriority.set(taskId, priority);
  }

  // מנגנון דחיסה פרואקטיבי
  proactiveCompression() {
    if (this.isThresholdExceeded()) {
      console.log(`סף זיכרון חריג: ${this.currentUsage.toFixed(2)} מעל ${this.threshold}`);
      this.selectTasksForCompression();
      this.executeCompression();
    }
  }

  // אלגוריתם עדיפות לבחירת משימות לדחיסה
  selectTasksForCompression() {
    // מיון משימות לפי עדיפות (נמוכה יותר = יותר ניתנת לדחיסה)
    const sortedTasks = Array.from(this.taskPriority.entries())
      .sort((a, b) => a[1] - b[1]);

    // בחירת 30% מהמשימות הפחות חשובות לדחיסה
    const compressionRatio = 0.3;
    const numTasksToCompress = Math.floor(sortedTasks.length * compressionRatio);

    this.compressionQueue = sortedTasks
      .slice(0, numTasksToCompress)
      .map(([taskId]) => taskId);

    console.log(`נבחרו ${this.compressionQueue.length} משימות לדחיסה`);
  }

  // ביצוע דחיסה של המשימות הנבחרות
  executeCompression() {
    this.compressionQueue.forEach(taskId => {
      const taskData = this.tasks.get(taskId);
      if (taskData) {
        // דחיסה פשוטה - המרת המשימה לפורמט דחוס
        const compressedData = this.compressTask(taskData);
        this.tasks.set(taskId, compressedData);
        console.log(`משימה ${taskId} דוחסה`);
      }
    });
    
    // ריקוד התור לאחר הדחיסה
    this.compressionQueue = [];
  }

  // דחיסת משימה (דוגמה פשוטה)
  compressTask(taskData) {
    // במערכת ממשית, נשתמש באלגוריתם דחיסה יעיל
    // לדוגמה: LZ-String, gzip וכו'
    const serialized = JSON.stringify(taskData);
    const hash = createHash('sha256').update(serialized).digest('hex');
    
    return {
      compressed: true,
      hash,
      size: serialized.length,
      timestamp: Date.now()
    };
  }

  // מערכת פיצול דינמי של משימות גדולות
  splitLargeTasks() {
    const largeTaskThreshold = 1000; // גודל בבתים
    
    for (const [taskId, taskData] of this.tasks.entries()) {
      if (this.getTaskSize(taskData) > largeTaskThreshold) {
        const subTasks = this.createSubTasks(taskData);
        
        // החלפת המשימה הגדולה במשימות קטנות יותר
        this.tasks.delete(taskId);
        this.taskPriority.delete(taskId);
        
        subTasks.forEach((subTask, index) => {
          const subTaskId = `${taskId}_sub_${index}`;
          this.addTask(subTaskId, subTask, this.taskPriority.get(taskId) || 1);
        });
        
        console.log(`משימה ${taskId} פוצלה ל-${subTasks.length} תת-משימות`);
      }
    }
  }

  // יצירת תת-משימות
  createSubTasks(taskData) {
    // במערכת ממשית, יישום מתאים לפיצול המשימה
    // לדוגמה: חלוקה לפי קטעי נתונים או פעולות
    const subTasks = [];
    const chunkSize = 100;
    
    for (let i = 0; i < taskData.data.length; i += chunkSize) {
      subTasks.push({
        ...taskData,
        data: taskData.data.slice(i, i + chunkSize),
        chunkIndex: Math.floor(i / chunkSize)
      });
    }
    
    return subTasks;
  }

  // קבלת גודל המשימה
  getTaskSize(taskData) {
    if (taskData.compressed) {
      return taskData.size || 0;
    }
    return JSON.stringify(taskData).length;
  }

  // ממשק API לניהול זיכרון
  getMemoryStatus() {
    return {
      currentUsage: this.currentUsage,
      threshold: this.threshold,
      tasksCount: this.tasks.size,
      compressionQueueLength: this.compressionQueue.length,
      timestamp: Date.now()
    };
  }
}

// דוגמה לשימוש במערכת
const memoryMonitor = new MemoryMonitor();

// הוספת משימות לדוגמה
for (let i = 0; i < 20; i++) {
  const priority = Math.floor(Math.random() * 10) + 1;
  memoryMonitor.addTask(`task_${i}`, {
    id: i,
    data: new Array(1000).fill(Math.random().toString(36)),
    timestamp: Date.now()
  }, priority);
}

// סימולציה של עומס זיכרון גובר
setInterval(() => {
  memoryMonitor.updateMemoryUsage();
  memoryMonitor.proactiveCompression();
  memoryMonitor.splitLargeTasks();
  
  // הדפסת מצב המערכת כל 5 שניות
  if (Date.now() % 5000 < 100) {
    console.log('מצב המערכת:', memoryMonitor.getMemoryStatus());
  }
}, 1000);

// ייצוא המערכת לשימוש במנוע העיבוד המקבילי
export default MemoryMonitor;