import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const BACKUP_DIR = path.join(__dirname, 'temp/backups');
const BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const RESPONSE_TIMEOUT = 30 * 1000; // 30 seconds
const BACKUP_RETENTION = 24 * 60 * 60 * 1000; // 24 hours

// Global state
let backupTimer;
let isHealthy = true;
let lastBackupTime = 0;
let lastResponseTime = Date.now();

// Initialize backup directory
async function initBackupDir() {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }
}

// Create backup of the current module
async function createBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `artery-pacer-${timestamp}.mjs`);
    
    // Read current module
    const currentModule = await fs.readFile(__filename, 'utf-8');
    
    // Create backup with metadata
    const backupContent = {
      version: '1.0.0',
      timestamp,
      source: 'saos-runtime/artery-pacer.mjs',
      hash: createHash('sha256').update(currentModule).digest('hex'),
      content: currentModule
    };
    
    // Write backup
    await fs.writeFile(backupPath, JSON.stringify(backupContent, null, 2));
    
    // Update last backup time
    lastBackupTime = Date.now();
    
    // Log backup creation
    logEvent(`Backup created at ${backupPath}`);
    
    // Clean up old backups
    await cleanupOldBackups();
    
    return true;
  } catch (error) {
    logEvent(`Backup creation failed: ${error.message}`);
    return false;
  }
}

// Clean up old backups
async function cleanupOldBackups() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > BACKUP_RETENTION) {
        await fs.unlink(filePath);
        logEvent(`Deleted old backup: ${filePath}`);
      }
    }
  } catch (error) {
    logEvent(`Cleanup failed: ${error.message}`);
  }
}

// Check if module is responsive
async function checkHealth() {
  try {
    // Simulate health check - in real implementation, this would check actual functionality
    const response = await Promise.race([
      new Promise(resolve => setTimeout(() => resolve(false), RESPONSE_TIMEOUT)),
      new Promise(resolve => {
        // Simulate a quick response
        setTimeout(() => resolve(true), 100);
      })
    ]);
    
    if (response) {
      lastResponseTime = Date.now();
      isHealthy = true;
      return true;
    } else {
      isHealthy = false;
      return false;
    }
  } catch (error) {
    isHealthy = false;
    logEvent(`Health check failed: ${error.message}`);
    return false;
  }
}

// Recover from backup
async function recoverFromBackup() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files
      .filter(file => file.startsWith('artery-pacer-') && file.endsWith('.mjs'))
      .sort();
    
    if (backupFiles.length === 0) {
      throw new Error('No backups available for recovery');
    }
    
    // Get the most recent backup
    const latestBackup = backupFiles[backupFiles.length - 1];
    const backupPath = path.join(BACKUP_DIR, latestBackup);
    
    // Read backup
    const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));
    
    // Verify backup
    const currentContent = await fs.readFile(__filename, 'utf-8');
    const currentHash = createHash('sha256').update(currentContent).digest('hex');
    
    if (currentHash !== backupData.hash) {
      // Content differs, restore from backup
      await fs.writeFile(__filename, backupData.content);
      logEvent(`Recovered from ${backupPath}`);
      return true;
    }
    
    logEvent(`Current version matches latest backup (${latestBackup})`);
    return true;
  } catch (error) {
    logEvent(`Recovery failed: ${error.message}`);
    return false;
  }
}

// Log events
function logEvent(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}`;
  
  // In a real implementation, this would write to a central log
  console.log(logEntry);
}

// API for managing backups
export const backupAPI = {
  // Create manual backup
  async createManualBackup() {
    return await createBackup();
  },
  
  // List available backups
  async listBackups() {
    try {
      const files = await fs.readdir(BACKUP_DIR);
      const backups = [];
      
      for (const file of files) {
        if (file.startsWith('artery-pacer-') && file.endsWith('.mjs')) {
          const filePath = path.join(BACKUP_DIR, file);
          const stats = await fs.stat(filePath);
          
          backups.push({
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime.toISOString()
          });
        }
      }
      
      return backups.sort((a, b) => 
        new Date(b.created) - new Date(a.created)
      );
    } catch (error) {
      logEvent(`Failed to list backups: ${error.message}`);
      return [];
    }
  },
  
  // Restore from specific backup
  async restoreBackup(backupName) {
    try {
      const backupPath = path.join(BACKUP_DIR, backupName);
      
      if (!(await fs.access(backupPath).then(() => true).catch(() => false))) {
        throw new Error('Backup not found');
      }
      
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));
      await fs.writeFile(__filename, backupData.content);
      
      logEvent(`Restored from ${backupName}`);
      return true;
    } catch (error) {
      logEvent(`Restore failed: ${error.message}`);
      return false;
    }
  },
  
  // Get health status
  getHealthStatus() {
    return {
      isHealthy,
      lastBackupTime: new Date(lastBackupTime).toISOString(),
      lastResponseTime: new Date(lastResponseTime).toISOString(),
      timeSinceLastBackup: Date.now() - lastBackupTime,
      timeSinceLastResponse: Date.now() - lastResponseTime
    };
  }
};

// Initialize backup system
async function init() {
  await initBackupDir();
  
  // Create initial backup
  await createBackup();
  
  // Start periodic backup
  backupTimer = setInterval(async () => {
    if (isHealthy) {
      await createBackup();
    }
  }, BACKUP_INTERVAL);
  
  // Start health check
  setInterval(async () => {
    if (!await checkHealth()) {
      logEvent('Module unresponsive, attempting recovery...');
      await recoverFromBackup();
    }
  }, RESPONSE_TIMEOUT);
  
  logEvent('Artery pacer backup system initialized');
}

// Graceful shutdown
function shutdown() {
  if (backupTimer) {
    clearInterval(backupTimer);
  }
  logEvent('Artery pacer backup system shut down');
}

// Initialize on load
init();

// Export for graceful shutdown
export { shutdown };
