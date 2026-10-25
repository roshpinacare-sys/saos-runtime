import { readdirSync, statSync, copyFileSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { join, relative, dirname, basename } from 'path';

// Configuration
const SOURCE_DIR = 'fabric';
const TARGET_DIR = 'engine';
const IMPORT_MAPPING_FILE = 'import-mapping.json';
const RELOCATION_SCRIPT = 'relocate-engine.mjs';

// Engine subdirectory structure
const ENGINE_STRUCTURE = {
  'core': ['pacer', 'heartbeat', 'circuit-breaker'],
  'utils': ['crypto', 'validation', 'format'],
  'adapters': ['blurt', 'hive', 'steem'],
  'config': ['nodes', 'thresholds', 'secrets']
};

// Step 1: Identify all relevant engine files in fabric/
function identifyEngineFiles() {
  const engineFiles = [];
  const fabricFiles = readdirSync(SOURCE_DIR, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.mjs'))
    .map(file => join(SOURCE_DIR, file));

  // Filter for files that appear to be engine-related
  const engineKeywords = ['artery', 'pacer', 'circuit', 'heartbeat', 'evolution', 'digest'];
  
  for (const filePath of fabricFiles) {
    const content = readFileSync(filePath, 'utf8');
    const fileName = basename(filePath);
    
    if (engineKeywords.some(keyword => fileName.includes(keyword) || content.includes(keyword))) {
      engineFiles.push(filePath);
    }
  }

  return engineFiles;
}

// Step 2: Create standard engine/ directory structure
function createEngineStructure() {
  if (!existsSync(TARGET_DIR)) {
    mkdirSync(TARGET_DIR, { recursive: true });
  }

  for (const [subdir, subdirs] of Object.entries(ENGINE_STRUCTURE)) {
    const fullPath = join(TARGET_DIR, subdir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }

    for (const subsubdir of subdirs) {
      const subFull = join(fullPath, subsubdir);
      if (!existsSync(subFull)) {
        mkdirSync(subFull, { recursive: true });
      }
    }
  }
}

// Step 3: Map files to appropriate engine subdirectories
function mapFilesToStructure(engineFiles) {
  const fileMap = {};
  
  for (const filePath of engineFiles) {
    const fileName = basename(filePath);
    let targetSubdir = 'core'; // Default
    
    // Determine appropriate subdirectory based on file name/content
    if (fileName.includes('artery') || fileName.includes('pacer')) {
      targetSubdir = join('core', 'pacer');
    } else if (fileName.includes('heartbeat')) {
      targetSubdir = join('core', 'heartbeat');
    } else if (fileName.includes('circuit')) {
      targetSubdir = join('core', 'circuit-breaker');
    } else if (fileName.includes('blurt')) {
      targetSubdir = join('adapters', 'blurt');
    } else if (fileName.includes('hive')) {
      targetSubdir = join('adapters', 'hive');
    } else if (fileName.includes('steem')) {
      targetSubdir = join('adapters', 'steem');
    } else if (fileName.includes('config') || fileName.includes('nodes')) {
      targetSubdir = join('config', 'nodes');
    }
    
    fileMap[filePath] = join(TARGET_DIR, targetSubdir, fileName);
  }

  return fileMap;
}

// Step 4: Copy files and update imports
function copyAndUpdateImports(fileMap) {
  const importMap = {};
  
  for (const [source, target] of Object.entries(fileMap)) {
    // Copy file
    copyFileSync(source, target);
    
    // Read and update imports
    const content = readFileSync(target, 'utf8');
    const updatedContent = content.replace(
      new RegExp(`import.*from\s+['"]\.\./fabric/`, 'g'),
      (match) => {
        const relativePath = match.split("'")[1].split('"')[1];
        const newRelativePath = relative(dirname(target), join(TARGET_DIR, relativePath.replace('../', '')));
        return match.replace(/fabric\//, `${newRelativePath}/`);
      }
    );
    
    writeFileSync(target, updatedContent);
    
    // Record mapping for reference
    importMap[source] = {
      target,
      oldPath: source,
      newPath: target
    };
  }

  return importMap;
}

// Step 5: Create relocation script
function createRelocationScript(fileMap) {
  const scriptContent = `#!/usr/bin/env node

// Relocation script for moving engine functionality from fabric/ to engine/
// Run this script after verifying the migration is complete

import { readdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const SOURCE_DIR = '${SOURCE_DIR}';
const TARGET_DIR = '${TARGET_DIR}';

console.log('Starting cleanup of fabric/ directory...');

// Remove all moved files from fabric/
for (const source in ${JSON.stringify(fileMap, null, 2)}) {
  const relativePath = relative(SOURCE_DIR, source);
  const fullPath = join(SOURCE_DIR, relativePath);
  
  if (existsSync(fullPath)) {
    rmSync(fullPath);
    console.log('Removed:', fullPath);
  }
}

// Remove empty subdirectories
function removeEmptyDirs(dir) {
  if (!existsSync(dir)) return;
  
  const items = readdirSync(dir, { recursive: false });
  
  for (const item of items) {
    const fullPath = join(dir, item);
    
    if (statSync(fullPath).isDirectory()) {
      removeEmptyDirs(fullPath);
      
      try {
        if (readdirSync(fullPath).length === 0) {
          rmSync(fullPath);
          console.log('Removed empty directory:', fullPath);
        }
      } catch (e) {
        // Directory already removed
      }
    }
  }
}

removeEmptyDirs(SOURCE_DIR);

console.log('Cleanup complete. Verify that fabric/ is empty and can be removed.');
console.log('Remember to update any remaining references to fabric/ in other files.');
`;

  writeFileSync(RELOCATION_SCRIPT, scriptContent);
  console.log(`Created relocation script: ${RELOCATION_SCRIPT}`);
}

// Step 6: Generate import mapping file
function generateImportMapping(fileMap) {
  const mapping = {
    timestamp: new Date().toISOString(),
    source: SOURCE_DIR,
    target: TARGET_DIR,
    files: Object.values(fileMap).map(({ oldPath, newPath }) => ({
      oldPath,
      newPath,
      relativePath: relative(process.cwd(), newPath)
    })),
    notes: [
      'This mapping shows all files moved from fabric/ to engine/',
      'Update all import statements to use the new engine/ paths',
      'After verification, run relocate-engine.mjs to clean up fabric/'
    ]
  };

  writeFileSync(IMPORT_MAPPING_FILE, JSON.stringify(mapping, null, 2));
  console.log(`Created import mapping: ${IMPORT_MAPPING_FILE}`);
}

// Main execution
function main() {
  console.log('Starting engine migration from fabric/ to engine/...');
  
  const engineFiles = identifyEngineFiles();
  console.log(`Found ${engineFiles.length} potential engine files in fabric/`);
  
  createEngineStructure();
  console.log('Created engine/ directory structure');
  
  const fileMap = mapFilesToStructure(engineFiles);
  console.log(`Mapped ${Object.keys(fileMap).length} files to engine/ structure`);
  
  const importMap = copyAndUpdateImports(fileMap);
  console.log('Copied files and updated imports');
  
  createRelocationScript(fileMap);
  generateImportMapping(importMap);
  
  console.log('\nMigration complete!');
  console.log('1. Review the generated import mapping file');
  console.log('2. Update any remaining import references in other files');
  console.log('3. After verification, run relocate-engine.mjs to clean up fabric/');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { identifyEngineFiles, createEngineStructure, mapFilesToStructure, copyAndUpdateImports, createRelocationScript, generateImportMapping };