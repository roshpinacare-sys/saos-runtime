import fs from 'fs/promises';
import path from 'path';

// Function to update evolution files
async function updateEvolutionFiles() {
  const evolutionDir = 'learning';
  
  // Get all evolution files
  const files = await fs.readdir(evolutionDir);
  const evolutionFiles = files
    .filter(file => file.startsWith('evolution-') && file.endsWith('.json'))
    .sort()
    .reverse();

  for (const file of evolutionFiles) {
    const filePath = path.join(evolutionDir, file);
    
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Update sections.runs to reflect static system
    if (data.sections && data.sections.runs) {
      // Preserve the counts but replace dynamic states
      for (const [system, stats] of Object.entries(data.sections.runs)) {
        if (typeof stats === 'object' && stats !== null) {
          // Create a new histogram with only success and cancelled
          const newHist = {
            success: stats.hist?.success || 100,
            cancelled: stats.hist?.cancelled || 0
          };
          
          // Replace the hist
          data.sections.runs[system] = {
            ...stats,
            hist: newHist
          };
        }
      }
    }
    
    // Remove econ section as it's not relevant for static system
    if (data.sections && data.sections.econ) {
      delete data.sections.econ;
    }
    
    // Update SLOs to reflect static nature
    if (data.slos) {
      data.slos = data.slos.map(slo => {
        if (slo.name.includes('runs')) {
          return {
            ...slo,
            name: slo.name.replace('>= 40 (self-pulse ~20min)', '= static'),
            detail: slo.detail.replace('runs=', 'static runs=')
          };
        }
        return slo;
      });
    }
    
    // Write back to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
}

// Run the update
updateEvolutionFiles().catch(console.error);
