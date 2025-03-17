import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Define interface for terminal tab
interface TerminalTab {
  id: string;
  input: string;
  output: string[];
  isProcessing: boolean;
  currentDirectory: string;
}

function App() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const window = getCurrentWindow();
  
  // Initialize the first tab on component mount
  useEffect(() => {
    const initialTabId = Date.now().toString();
    setTabs([{
      id: initialTabId,
      input: '',
      output: [],
      isProcessing: false,
      currentDirectory: 'C:\\', // Default directory
    }]);
    setActiveTabId(initialTabId);
  }, []);

  // Get the currently active tab
  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // Auto-scroll to bottom of terminal output
  useEffect(() => {
    if (activeTab) {
      outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab?.output]);

  // Focus input when component mounts or active tab changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeTabId]);

  // Fetch initial directory when a new tab is created
  useEffect(() => {
    if (!activeTab) return;

    const getInitialDirectory = async () => {
      try {
        const dir = await invoke<string>('get_current_directory');
        updateActiveTab({ currentDirectory: dir });
      } catch (error) {
        console.error("Failed to get initial directory:", error);
      }
    };
    
    // Only fetch if we have the default directory
    if (activeTab.currentDirectory === 'C:\\') {
      getInitialDirectory();
    }
  }, [activeTabId]);

  // Focus input when window gains focus
  useEffect(() => {
    // Skip if no active tab
    if (!activeTab) return;
    
    const focusHandler = () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    };
    
    // Listen for window focus events
    const unlisten = window.listen('tauri://focus', focusHandler);
    
    // Clean up listener
    return () => {
      unlisten.then(unlistenFn => unlistenFn());
    };
  }, [activeTab]);

  // Helper to update active tab
  const updateActiveTab = (updates: Partial<TerminalTab>) => {
    setTabs(currentTabs => 
      currentTabs.map(tab => 
        tab.id === activeTabId ? { ...tab, ...updates } : tab
      )
    );
  };

  const addNewTab = async () => {
    const newTabId = Date.now().toString();
    let initialDir = 'C:\\';
    
    try {
      initialDir = await invoke<string>('get_current_directory');
    } catch (error) {
      console.error("Failed to get directory for new tab:", error);
    }
    
    const newTab: TerminalTab = {
      id: newTabId,
      input: '',
      output: [],
      isProcessing: false,
      currentDirectory: initialDir,
    };
    
    setTabs(currentTabs => [...currentTabs, newTab]);
    setActiveTabId(newTabId);
  };

  const closeTab = (tabId: string) => {
    // Don't close the last tab
    if (tabs.length <= 1) return;
    
    setTabs(currentTabs => currentTabs.filter(tab => tab.id !== tabId));
    
    // If we're closing the active tab, activate the previous one
    if (activeTabId === tabId) {
      const tabIndex = tabs.findIndex(tab => tab.id === tabId);
      const newActiveIndex = tabIndex === 0 ? 1 : tabIndex - 1;
      setActiveTabId(tabs[newActiveIndex].id);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTab) return;
    updateActiveTab({ input: e.target.value });
  };
  
  const executeCommand = async () => {
    if (!activeTab) return;
    if (!activeTab.input.trim()) return;
    
    updateActiveTab({
      isProcessing: true,
      output: [...activeTab.output, `${activeTab.currentDirectory}> ${activeTab.input}`]
    });
    
    // Handle clear command
    const trimmedInput = activeTab.input.trim().toLowerCase();
    if (trimmedInput === 'clear' || trimmedInput === 'cls') {
      // Clear screen after a brief delay to show the command
      setTimeout(() => {
        updateActiveTab({
          output: [],
          isProcessing: false,
          input: ''
        });
        inputRef.current?.focus(); // Focus input after clearing
      }, 100);
      return;
    }
    
    try {
      // Handle cd command specially to track directory changes
      if (trimmedInput.startsWith('cd ')) {
        const newPath = activeTab.input.trim().substring(3);
        const result = await invoke<string>('change_directory', {
          path: newPath
        });
        
        // Update current directory
        updateActiveTab({ currentDirectory: result });
        
        if (result.trim()) {
          const updatedOutput = [...activeTab.output, result];
          updateActiveTab({ output: updatedOutput });
        }
      } else {
        // Regular command execution
        let shellName = 'powershell';  // Default to cmd on Windows
        let args: string[] = [];
        
        // On Unix-like systems, use bash
        if (navigator.userAgent.includes('Linux') || navigator.userAgent.includes('Mac')) {
          shellName = 'bash';
          args = [activeTab.input]; // Pass the full command as one argument
        } else {
          // For Windows, split the command
          if (activeTab.input.toLowerCase().startsWith('powershell ')) {
            shellName = 'powershell';
            
            // Get the actual PowerShell command
            const powershellCommand = activeTab.input.substring('powershell '.length);
            
            // Simple handling for all PowerShell commands without special formatting for ls
            args = [
              '-NoProfile',
              '-ExecutionPolicy', 'Bypass',
              '-Command', 
              powershellCommand
            ];
          } else {
            args = activeTab.input.split(' ');
          }
        }
        
        const result = await invoke<string>('execute_command', {
          commandName: shellName,
          args: args,
          workingDir: activeTab.currentDirectory
        });
        
        if (result.trim()) {
          updateActiveTab({ output: [...activeTab.output, result] });
        }
      }
    } catch (error) {
      updateActiveTab({
        output: [...activeTab.output, `Failed to execute command: ${error}`]
      });
    } finally {
      updateActiveTab({
        isProcessing: false,
        input: ''
      });
      // Focus the input element after command execution
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeTab && e.key === 'Enter' && !activeTab.isProcessing) {
      executeCommand();
    }
  };

  // Handle double-click on topbar to maximize/restore window
  const handleTopbarDoubleClick = () => {
    window.toggleMaximize();
  };
  
  // If no active tab, show loading or placeholder
  if (!activeTab) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  
  return (
    <div className="flex mt-10 flex-col h-screen bg-[#000000] text-purple-500 p-2 font-mono">
      {/* Topbar - Add data-tauri-drag-region to make the topbar draggable */}
      <div 
        className="flex items-center w-full h-10 bg-transparent border-b border-[rgb(19,19,19)] backdrop-blur-2xl overflow-hidden select-none fixed top-0 left-0" 
        data-tauri-drag-region
        onDoubleClick={handleTopbarDoubleClick}
      >
        <div className="flex-1 flex items-center overflow-x-auto" data-tauri-drag-region>
          {tabs.map(tab => {
            // Extract the last part of the directory path for the tab name
            const pathParts = tab.currentDirectory.split(/[\\\/]/);
            const dirName = pathParts[pathParts.length - 1] || 
                           (pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Terminal');
            return (
              <div
                key={tab.id} 
                className={`relative flex items-center px-4 py-2 mr-1 cursor-pointer ${
                  tab.id === activeTabId ? 'bg-[#181818] text-white' : 'bg-[rgba(0,0,0,0)] text-gray-300'
                }`}
                onClick={() => setActiveTabId(tab.id)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="truncate max-w-[100px]">{dirName}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="ml-2 text-sm hover:text-red-500"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={addNewTab}
            onMouseDown={(e) => e.stopPropagation()}
            className="px-3 py-2 bg-[rgb(0,0,0)] hover:bg-gray-600 text-xl font-light"
          >
            +
          </button>
        </div>
        <div className="flex" data-tauri-drag-region>
          <button
            className="h-10 w-10 bg-transparent flex items-center justify-center hover:bg-gray-600" 
            onClick={() => window.minimize()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            -
          </button>
          <button
            className="h-auto w-10 bg-transparent flex items-center justify-center hover:bg-gray-600" 
            onClick={() => window.toggleMaximize()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            □
          </button>
          <button
            className="h-auto w-10 bg-transparent flex items-center justify-center hover:bg-gray-600 hover:text-red-500" 
            onClick={() => window.close()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        </div>
      </div>
      
      <div className="flex-1 h-full overflow-auto">
        {activeTab.output.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap mt-10 mb-10">{line}</div>
        ))}
        <div ref={outputEndRef} />
      </div>
      
      <div className="flex w-full flex-row items-center p-3 bg-transparent backdrop-blur-2xl fixed bottom-0 left-0 border-t border-[rgb(19,19,19)]">
        <span className="mr-2">{activeTab.currentDirectory}</span>
        <input
          ref={inputRef}
          type="text"
          value={activeTab.input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="flex w-full bg-transparent outline-none"
          placeholder="Enter command..."
          disabled={activeTab.isProcessing}
          autoFocus
        />
      </div>
    </div>
  );
}

export default App;