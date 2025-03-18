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

#[tauri::command]
pub fn execute_command(command_name: &str, args: Vec<String>, working_dir: &str) -> String {
    use std::process::{Command, Stdio};
    
    let mut command = Command::new(command_name);
    
    // Add all arguments
    command.args(args);
    
    // Set working directory
    command.current_dir(working_dir);
    
    // Critical for Windows: ensure no window appears
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    
    // Redirect stdout and stderr
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    
    // Execute the command and handle output
    match command.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            
            if !stderr.is_empty() {
                return stderr;
            }
            stdout
        },
        Err(e) => format!("Error executing command: {}", e),
    }
}