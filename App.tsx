import React from 'react';
import { useJarvis } from './hooks/useJarvis';
import Orb from './components/Orb';
import ChatWindow from './components/ChatWindow';
import TaskList from './components/TaskList';

const App: React.FC = () => {
  const { 
    messages, 
    tasks, 
    isSessionActive, 
    isThinking,
    isProcessing,
    micVolume,
    error,
    clearSession,
  } = useJarvis();

  if (error) {
    return (
      <div className="h-screen w-screen bg-slate-900 text-white flex flex-col items-center justify-center font-mono p-4 text-center">
        <h1 className="text-3xl font-bold text-red-500 mb-4">System Malfunction</h1>
        <p className="text-lg mb-2">{error}</p>
        {/* Fix: Updated environment variable name in the user-facing error message. */}
        <p className="text-slate-400">If you are the administrator, please ensure the <code className="bg-slate-700 p-1 rounded">API_KEY</code> is correctly configured in the Vercel project settings.</p>
        <a href="https://vercel.com/docs/projects/environment-variables" target="_blank" rel="noopener noreferrer" className="mt-6 text-cyan-400 hover:underline">
          Vercel Environment Variables Documentation
        </a>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-900/80 flex flex-col font-sans overflow-hidden">
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={clearSession}
          className="bg-slate-700/50 hover:bg-red-500/50 text-white font-semibold py-2 px-4 border border-slate-600 hover:border-red-500 rounded-lg shadow-lg transition-all duration-300 backdrop-blur-sm"
          aria-label="Clear Session"
        >
          Clear Session
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
        <Orb 
          isListening={isSessionActive} 
          isThinking={isThinking} 
          isProcessing={isProcessing}
          micVolume={micVolume}
        />
        <TaskList tasks={tasks} />
      </div>

      <div className="h-2/3 flex flex-col bg-slate-800/60 backdrop-blur-md rounded-t-3xl shadow-2xl border-t-2 border-red-500/20">
        <ChatWindow messages={messages} />
      </div>
    </div>
  );
};

export default App;