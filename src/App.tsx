import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface TerminalTab {
  id: string;
  input: string;
  output: string[];
  isProcessing: boolean;
  currentDirectory: string;
  commandHistory: string[]; 
  historyIndex: number;     
}

function App() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const window = getCurrentWindow();
  
  // Initialize with a first tab
  useEffect(() => {
    const initialTabId = Date.now().toString();
    const isWindows = !navigator.userAgent.includes('Linux') && !navigator.userAgent.includes('Mac');
    
    setTabs([{
      id: initialTabId,
      input: '',
      output: [],
      isProcessing: false,
      currentDirectory: isWindows ? 'C:\\' : '/home', 
      commandHistory: [],
      historyIndex: -1,
    }]);
    setActiveTabId(initialTabId);
  }, []);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // Scroll to bottom when output changes
  useEffect(() => {
    if (activeTab) {
      outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab?.output]);

  // Focus input when tab changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeTabId]);

  // Get initial directory for new tabs
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
    
    if (activeTab.currentDirectory === 'C:\\') {
      getInitialDirectory();
    }
  }, [activeTabId]);

  // Focus handler for when window gets focus
  useEffect(() => {
    if (!activeTab) return;
    
    const focusHandler = () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    };
    
    const unlisten = window.listen('tauri://focus', focusHandler);
    
    return () => {
      unlisten.then(unlistenFn => unlistenFn());
    };
  }, [activeTab]);

  

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 't') {
        event.preventDefault();
        addNewTab();
      } else if(event.ctrlKey && event.key === "w"){
        event.preventDefault();
        if(tabs.length <= 1){
          window.close();
        }else{
          closeTab(activeTabId);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tabs.length, activeTabId]);


  useEffect(() => {
    const contextMenuHandler = (event: MouseEvent) => {
      event.preventDefault();
    };
    
    document.addEventListener('contextmenu', contextMenuHandler);
    
    return () => {
      document.removeEventListener('contextmenu', contextMenuHandler);
    };
  }, []);

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
      commandHistory: [],
      historyIndex: -1,
    };
    
    setTabs(currentTabs => [...currentTabs, newTab]);
    setActiveTabId(newTabId);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    
    setTabs(currentTabs => currentTabs.filter(tab => tab.id !== tabId));

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
    

    const trimmedInput = activeTab.input.trim();
    let updatedHistory = [...activeTab.commandHistory];
    
    // Don't add if it's the same as the last command
    if (updatedHistory.length === 0 || updatedHistory[updatedHistory.length - 1] !== trimmedInput) {
      updatedHistory.push(trimmedInput);
    }
    
    updateActiveTab({
      isProcessing: true,
      output: [...activeTab.output, `${activeTab.currentDirectory}> ${activeTab.input}`],
      commandHistory: updatedHistory,
      historyIndex: updatedHistory.length
    });
    
   
    const trimmedInputLower = activeTab.input.trim().toLowerCase();
    if (trimmedInputLower === 'clear' || trimmedInputLower === 'cls') {
     
      setTimeout(() => {
        updateActiveTab({
          output: [],
          isProcessing: false,
          input: ''
        });
        inputRef.current?.focus(); 
      }, 100);
      return;
    }
    
    try {
     
      if (trimmedInputLower.startsWith('cd ')) {
        const newPath = activeTab.input.trim().substring(3);
        const result = await invoke<string>('change_directory', {
          path: newPath
        });
        
       
        updateActiveTab({ currentDirectory: result });
        
        if (result.trim()) {
          const updatedOutput = [...activeTab.output, result];
          updateActiveTab({ output: updatedOutput });
        }
      } else {
      
        let shellName = 'powershell'; 
        let args: string[] = [];
        
    
        if (navigator.userAgent.includes('Linux') || navigator.userAgent.includes('Mac')) {
          shellName = 'bash';
          args = [activeTab.input];
        } else {
          
          if (activeTab.input.toLowerCase().startsWith('powershell ')) {
            shellName = 'powershell';

            const powershellCommand = activeTab.input.substring('powershell '.length);
            
            
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
        input: '',
        historyIndex: activeTab.commandHistory.length 
      });

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!activeTab) return;
    
    if (e.key === 'Enter' && !activeTab.isProcessing) {
      executeCommand();
      return;
    }
  
    if (e.key === 'ArrowUp') {
      e.preventDefault(); 

      if (activeTab.historyIndex === -1) {
     
        updateActiveTab({ historyIndex: activeTab.commandHistory.length });
      }
      

      if (activeTab.historyIndex > 0) {
        const newIndex = activeTab.historyIndex - 1;
        updateActiveTab({
          historyIndex: newIndex,
          input: activeTab.commandHistory[newIndex]
        });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      
     
      if (activeTab.commandHistory.length > 0 && activeTab.historyIndex < activeTab.commandHistory.length) {
        const newIndex = activeTab.historyIndex + 1;
        

        if (newIndex === activeTab.commandHistory.length) {
          updateActiveTab({
            historyIndex: -1, 
            input: ''
          });
        } else {
          updateActiveTab({
            historyIndex: newIndex,
            input: activeTab.commandHistory[newIndex]
          });
        }
      }
    }
  };
  
  const handleTopbarDoubleClick = () => {
    window.toggleMaximize();
  };

  if (!activeTab) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="flex mt-10 flex-col h-screen bg-[rgba(0,0,0,0.77)] text-purple-500 p-2 font-mono antialiased">
      <div 
        className="flex items-center w-full h-14 overflow-hidden select-none fixed top-0 z-10 left-0 bg-[rgba(0,0,0,0.49)] border-b border-[rgb(19,19,19)]" 
        data-tauri-drag-region
        onDoubleClick={handleTopbarDoubleClick}
      >
        <div className="flex-1 p-2 flex items-center overflow-x-auto" data-tauri-drag-region>
          {tabs.map(tab => {
            return (
              <div
                key={tab.id} 
                className={`relative flex items-center rounded-lg px-4 py-2 mr-1 cursor-pointer ${
                  tab.id === activeTabId ? 'bg-[#3a3a3a9c] text-white' : 'bg-[rgba(0,0,0,0)] border  border-[rgb(44,44,44)] text-gray-300'
                }`}
                onClick={() => setActiveTabId(tab.id)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="truncate max-w-[120px] font-jetbrains font-thin text-sm">lia terminal</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="ml-2 w-5 h-5 bg-[rgb(59,59,59)] rounded-full text-sm hover:text-red-500"
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
            className="flex items-center ml-2 justify-center h-9 rounded-md w-8 bg-[#3a3a3a9c] text-white hover:bg-[rgb(58,58,58)] text-xl font-light"
          >
            +
          </button>
        </div>
        <div className="flex gap-2 mr-3" data-tauri-drag-region>
          <button
            className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-[rgb(160,160,160)] font-bold text-black" 
            onClick={() => window.minimize()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            -
          </button>
          <button
            className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-[rgb(160,160,160)] font-bold text-black" 
            onClick={() => window.maximize()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            □
          </button>
          <button
            className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-[rgb(160,160,160)] font-bold text-black" 
            onClick={() => window.close()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        </div>
      </div>
      
      <div className="flex-1 h-full mb-12 overflow-auto">
        {activeTab.output.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap mt-12">{line}</div>
        ))}
        <div ref={outputEndRef} />
      </div>
      
      <div className="flex w-full flex-row items-center p-3 bg-[rgba(0,0,0,0.26)] fixed bottom-0 left-0 border-t border-[rgb(19,19,19)]">
        <span className='w-auto whitespace-nowrap'>{activeTab.currentDirectory} &gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={activeTab.input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="flex w-full bg-transparent ml-3 outline-none"
          disabled={activeTab.isProcessing}
          autoFocus
        />
      </div>
    </div>
  );
}

export default App;