import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

function App() {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentDirectory, setCurrentDirectory] = useState<string>('C:\\'); // Default directory
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null); // Add this line for input reference
  
  // Auto-scroll to bottom of terminal output
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  // Focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch initial directory when component mounts
  useEffect(() => {
    const getInitialDirectory = async () => {
      try {
        const dir = await invoke<string>('get_current_directory');
        setCurrentDirectory(dir);
      } catch (error) {
        console.error("Failed to get initial directory:", error);
      }
    };
    
    getInitialDirectory();
  }, []);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };
  
  const executeCommand = async () => {
    if (!input.trim()) return;
    
    setIsProcessing(true);
    setOutput(prev => [...prev, `${currentDirectory}> ${input}`]);
    
    // Handle clear command
    const trimmedInput = input.trim().toLowerCase();
    if (trimmedInput === 'clear' || trimmedInput === 'cls') {
      // Clear screen after a brief delay to show the command
      setTimeout(() => {
        setOutput([]);
        setIsProcessing(false);
        setInput('');
        inputRef.current?.focus(); // Focus input after clearing
      }, 100);
      return;
    }
    
    try {
      // Handle cd command specially to track directory changes
      if (trimmedInput.startsWith('cd ')) {
        const newPath = input.trim().substring(3);
        const result = await invoke<string>('change_directory', {
          path: newPath
        });
        
        // Update current directory
        setCurrentDirectory(result);
        
        if (result.trim()) {
          setOutput(prev => [...prev, result]);
        }
      } else {
        // Regular command execution
        let shellName = 'powershell';  // Default to cmd on Windows
        let args: string[] = [];
        
        // On Unix-like systems, use bash
        if (navigator.userAgent.includes('Linux') || navigator.userAgent.includes('Mac')) {
          shellName = 'bash';
          args = [input]; // Pass the full command as one argument
        } else {
          // For Windows, split the command
          if (input.toLowerCase().startsWith('powershell ')) {
            shellName = 'powershell';
            
            // Get the actual PowerShell command
            const powershellCommand = input.substring('powershell '.length);
            
            // Simple handling for all PowerShell commands without special formatting for ls
            args = [
              '-NoProfile',
              '-ExecutionPolicy', 'Bypass',
              '-Command', 
              powershellCommand
            ];
          } else {
            args = input.split(' ');
          }
        }
        
        const result = await invoke<string>('execute_command', {
          commandName: shellName,
          args: args,
          workingDir: currentDirectory
        });
        
        if (result.trim()) {
          setOutput(prev => [...prev, result]);
        }
      }
    } catch (error) {
      setOutput(prev => [...prev, `Failed to execute command: ${error}`]);
    } finally {
      setIsProcessing(false);
      setInput('');
      // Focus the input element after command execution
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isProcessing) {
      executeCommand();
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-black text-green-400 p-2 font-mono">
      <div data-tauri-drag-region className="w-full h-12 bg-white"></div>
      <div className="flex-1 overflow-auto mb-4">
        {output.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap">{line}</div>
        ))}
        <div ref={outputEndRef} />
      </div>
      
      <div className="flex items-center">
        <span className="mr-2">{currentDirectory}</span>
        <input
          ref={inputRef} // Add this line
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none"
          placeholder="Enter command..."
          disabled={isProcessing}
          autoFocus // Add this to ensure initial focus
        />
      </div>
    </div>
  );
}

export default App;