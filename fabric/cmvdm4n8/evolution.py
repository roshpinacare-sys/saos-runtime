import json
import os
import re
from pathlib import Path

def sanitize_evolution_file(file_path):
    """
    Sanitizes an evolution JSON file by removing misleading metrics related to
    memory leaks (runs, hist, in_progress, pending, failure).
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Check if the file has the expected structure
        if 'sections' not in data or 'runs' not in data['sections']:
            return False, "File does not have the expected structure"
        
        # Remove the runs section entirely
        if 'runs' in data['sections']:
            del data['sections']['runs']
        
        # Remove any other misleading metrics
        misleading_metrics = ['in_progress', 'pending', 'failure', 'hist', 'runs']
        for section in data.get('sections', {}).values():
            if isinstance(section, dict):
                for metric in misleading_metrics:
                    section.pop(metric, None)
        
        # Write back to file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        return True, "File sanitized successfully"
    except Exception as e:
        return False, f"Error processing file: {str(e)}"

def validate_json_file(file_path):
    """
    Validates that a JSON file is properly formatted.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            json.load(f)
        return True, "Valid JSON"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON: {str(e)}"
    except Exception as e:
        return False, f"Error validating file: {str(e)}"

def process_evolution_files(directory):
    """
    Processes all evolution JSON files in the specified directory.
    """
    directory = Path(directory)
    if not directory.exists() or not directory.is_dir():
        print(f"Directory {directory} does not exist or is not a directory")
        return
    
    evolution_files = list(directory.glob('evolution-*.json'))
    if not evolution_files:
        print("No evolution files found in the directory")
        return
    
    print(f"Found {len(evolution_files)} evolution files to process")
    
    for file_path in evolution_files:
        print(f"\nProcessing {file_path.name}...")
        
        # Sanitize the file
        success, message = sanitize_evolution_file(file_path)
        if not success:
            print(f"Sanitization failed: {message}")
            continue
        
        print("Sanitization successful")
        
        # Validate the file
        success, message = validate_json_file(file_path)
        if not success:
            print(f"Validation failed: {message}")
        else:
            print("Validation successful")

if __name__ == "__main__":
    # Set the directory path
    learning_directory = "learning"
    
    # Process all evolution files
    process_evolution_files(learning_directory)