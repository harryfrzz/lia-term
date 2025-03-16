use std::env;
use std::path::PathBuf;
use tauri::command;
use std::process::Command;

#[command]
pub fn get_current_directory() -> String {
    env::current_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

#[command]
pub fn change_directory(path: &str) -> String {
    let current_dir = env::current_dir().unwrap_or_default();
    let new_dir = if path.starts_with("/") || 
                   (path.len() > 1 && path.chars().nth(1) == Some(':')) {
        // Absolute path
        PathBuf::from(path)
    } else {
        // Relative path
        current_dir.join(path)
    };
    
    match env::set_current_dir(&new_dir) {
        Ok(_) => get_current_directory(),
        Err(e) => format!("Failed to change directory: {}", e)
    }
}

#[command]
pub fn execute_command(command_name: &str, args: Vec<&str>, working_dir: &str) -> String {
    let mut command = Command::new(command_name);
    command.args(args);
    
    // Set the working directory
    command.current_dir(working_dir);
    
    match command.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            
            if !stderr.is_empty() {
                return stderr;
            }
            stdout
        },
        Err(e) => format!("Failed to execute command: {}", e)
    }
}