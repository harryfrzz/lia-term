import { useEffect, useState, useRef } from 'react';
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


    useEffect(() => {
      if (activeTab) {
        outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, [activeTab?.output]);

    
    useEffect(() => {
      inputRef.current?.focus();
    }, [activeTabId]);


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
      <div className="flex mt-10 flex-col h-screen bg-[rgb(0,0,0)] text-purple-500 p-2 font-mono">
        <div 
          className="flex items-center w-full h-10 overflow-hidden select-none fixed top-0 left-0 z-10" 
          style={{ 
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'url(#blur-effect)',
            borderBottom: '1px solid rgb(19,19,19)'
          }}
          data-tauri-drag-region
          onDoubleClick={handleTopbarDoubleClick}
        >
          <div className="flex-1 flex items-center overflow-x-auto" data-tauri-drag-region>
            {tabs.map(tab => {

              const pathParts = tab.currentDirectory.split(/[\\\/]/);
              const dirName = pathParts[pathParts.length - 1] || 
                            (pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Terminal');
              return (
                <div
                  key={tab.id} 
                  className={`relative flex items-center px-4 py-2 mr-1 cursor-pointer ${
                    tab.id === activeTabId ? 'bg-[#1818189c] text-white' : 'bg-[rgba(0,0,0,0)] text-gray-300'
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
                      className="ml-2 w-5 h-5 bg-[rgb(58,24,97)] rounded-full text-sm hover:text-red-500"
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
              className="flex items-center ml-2 justify-center h-6 rounded-full w-6 bg-[rgb(34,34,34)] hover:bg-gray-600 text-xl font-light"
            >
              +
            </button>
          </div>
          <div className="flex gap-2 mr-2" data-tauri-drag-region>

            <button
              className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-600" 
              onClick={() => window.minimize()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              -
            </button>
            <button
              className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-600" 
              onClick={() => window.toggleMaximize()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              □
            </button>
            <button
              className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-600 hover:text-red-500" 
              onClick={() => window.close()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="flex-1 h-full overflow-auto">
          {activeTab.output.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap mt-10 mb-15">{line}</div>
          ))}
          <div ref={outputEndRef} />
        </div>
        
        <div className="flex w-full flex-row items-center p-3 bg-transparent fixed bottom-0 left-0 border-t border-[rgb(19,19,19)]" style={{ 
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'url(#blur-effect)',
            borderBottom: '1px solid rgb(19,19,19)'
          }}>
          <span className='w-auto whitespace-nowrap'>{activeTab.currentDirectory}</span>
          <input
            ref={inputRef}
            type="text"
            value={activeTab.input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="flex w-full bg-transparent ml-3 outline-none"
            placeholder="Enter command..."
            disabled={activeTab.isProcessing}
            autoFocus
          />
        </div>
      </div>
    );
  }

  export default App;