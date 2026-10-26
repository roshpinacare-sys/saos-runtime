import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// Configuration
const CONFIG = {
  agentsDir: 'agents',
  templateDir: 'templates/agent',
  ledgerPath: 'learning/ledger.jsonl',
  backupDir: 'backups/agents',
  logDir: 'logs/agent-backup',
  manifestPath: 'agents/manifest.json'
};

// Ensure required directories exist
[CONFIG.backupDir, CONFIG.logDir].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Load agent manifest
function loadManifest() {
  try {
    const manifestPath = join(CONFIG.agentsDir, 'manifest.json');
    if (existsSync(manifestPath)) {
      return JSON.parse(readFileSync(manifestPath, 'utf-8'));
    }
    return { agents: [] };
  } catch (error) {
    console.error('Error loading manifest:', error);
    return { agents: [] };
  }
}

// Load ledger
function loadLedger() {
  try {
    const ledgerContent = readFileSync(CONFIG.ledgerPath, 'utf-8');
    return ledgerContent.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (error) {
    console.error('Error loading ledger:', error);
    return [];
  }
}

// Check if agent exists
function agentExists(agentName) {
  const agentPath = join(CONFIG.agentsDir, agentName);
  return existsSync(agentPath);
}

// Create backup of agent
function backupAgent(agentName) {
  const agentPath = join(CONFIG.agentsDir, agentName);
  const backupPath = join(CONFIG.backupDir, `${agentName}-${Date.now()}.tar.gz`);
  
  // In a real implementation, this would create a compressed backup
  // For this example, we'll just copy the directory
  const backupContent = `Backup of agent ${agentName} created at ${new Date().toISOString()}`;
  writeFileSync(backupPath, backupContent);
  
  return backupPath;
}

// Create agent from template
function createAgentFromTemplate(agentName, params) {
  const templatePath = join(CONFIG.templateDir, 'template.json');
  
  try {
    const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
    
    // Replace template placeholders with actual values
    const agentConfig = {
      ...template,
      name: agentName,
      createdAt: new Date().toISOString(),
      params: params
    };
    
    // Create agent directory
    const agentPath = join(CONFIG.agentsDir, agentName);
    if (!existsSync(agentPath)) {
      mkdirSync(agentPath, { recursive: true });
    }
    
    // Write agent config
    writeFileSync(join(agentPath, 'config.json'), JSON.stringify(agentConfig, null, 2));
    
    // Create other necessary files based on template
    ['README.md', 'tools-manifest.md', 'worklog.md'].forEach(file => {
      const templateFile = join(CONFIG.templateDir, file);
      if (existsSync(templateFile)) {
        let content = readFileSync(templateFile, 'utf-8');
        // Replace placeholders if needed
        writeFileSync(join(agentPath, file), content);
      }
    });
    
    return agentConfig;
  } catch (error) {
    console.error(`Error creating agent ${agentName}:`, error);
    return null;
  }
}

// Log backup activity
function logBackupActivity(agentName, action, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    agent: agentName,
    action,
    details
  };
  
  const logPath = join(CONFIG.logDir, `backup-${Date.now()}.json`);
  writeFileSync(logPath, JSON.stringify(logEntry, null, 2));
  
  // Also append to central log
  const centralLogPath = join(CONFIG.logDir, 'activity.jsonl');
  writeFileSync(centralLogPath, JSON.stringify(logEntry) + '\n', { flag: 'a' });
  
  return logPath;
}

// Main backup mechanism
function backupMissingAgents() {
  const manifest = loadManifest();
  const ledger = loadLedger();
  const backupReport = [];
  
  // Get expected agents from manifest
  const expectedAgents = manifest.agents.map(agent => agent.name);
  
  // Check each expected agent
  for (const agentName of expectedAgents) {
    if (!agentExists(agentName)) {
      console.log(`Agent ${agentName} is missing. Starting backup process...`);
      
      // Find agent parameters in ledger
      const agentLedgerEntry = ledger.find(entry => 
        entry.type === 'agent' && entry.name === agentName
      );
      
      if (agentLedgerEntry) {
        // Create backup before creating new agent
        const backupPath = backupAgent(agentName);
        
        // Create agent from template
        const newAgent = createAgentFromTemplate(agentName, agentLedgerEntry.params || {});
        
        if (newAgent) {
          // Log the activity
          const logPath = logBackupActivity(
            agentName, 
            'backup-and-restore', 
            { backupPath, agentConfig: newAgent }
          );n          
          backupReport.push({
            agent: agentName,
            status: 'success',
            backupPath,
            logPath,
            restoredAt: newAgent.createdAt
          });
          
          console.log(`Successfully backed up and restored agent ${agentName}`);
        } else {
          backupReport.push({
            agent: agentName,
            status: 'failed',
            error: 'Failed to create agent from template'
          });
          
          console.error(`Failed to restore agent ${agentName}`);
        }
      } else {
        backupReport.push({
          agent: agentName,
          status: 'failed',
          error: 'Agent not found in ledger'
        });
        
        console.error(`No ledger entry found for agent ${agentName}`);
      }
    } else {
      console.log(`Agent ${agentName} exists. No action needed.`);
      backupReport.push({
        agent: agentName,
        status: 'exists',
        message: 'Agent already exists'
      });
    }
  }
  
  // Write backup report
  const reportPath = join(CONFIG.backupDir, `backup-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(backupReport, null, 2));
  
  return {
    reportPath,
    timestamp: new Date().toISOString(),
    summary: {
      total: expectedAgents.length,
      backedUp: backupReport.filter(r => r.status === 'success').length,
      failed: backupReport.filter(r => r.status === 'failed').length,
      existed: backupReport.filter(r => r.status === 'exists').length
    }
  };
}

// Run the backup mechanism
const result = backupMissingAgents();
console.log('Backup process completed:', result);

// Export for use as module
export { backupMissingAgents, loadManifest, loadLedger, agentExists, backupAgent, createAgentFromTemplate, logBackupActivity };