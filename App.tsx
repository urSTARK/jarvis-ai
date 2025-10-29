import React from 'react';
import { useJarvis } from './hooks/useJarvis';
import Orb from './components/Orb';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import TaskList from './components/TaskList';

const App: React.FC = () => {
  const { 
    messages, 
    tasks, 
    isSessionActive, 
    isThinking,
    isProcessing,
    error,
    toggleSession,
    sendTextMessage 
  } = useJarvis();

  if (error) {
    return (
      <div className="h-screen w-screen bg-slate-900 text-white flex flex-col items-center justify-center font-mono p-4 text-center">
        <h1 className="text-3xl font-bold text-red-500 mb-4">System Malfunction</h1>
        <p className="text-lg mb-2">{error}</p>
        <p className="text-slate-400">If you are the administrator, please ensure the <code className="bg-slate-700 p-1 rounded">VITE_API_KEY</code> is correctly configured in the Vercel project settings.</p>
        <a href="https://vercel.com/docs/projects/environment-variables" target="_blank" rel="noopener noreferrer" className="mt-6 text-cyan-400 hover:underline">
          Vercel Environment Variables Documentation
        </a>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-900/80 flex flex-col font-sans overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
        <Orb isListening={isSessionActive} isThinking={isThinking} isProcessing={isProcessing} />
        <TaskList tasks={tasks} />
      </div>

      <div className="h-1/2 flex flex-col bg-slate-800/60 backdrop-blur-md rounded-t-3xl shadow-2xl border-t-2 border-cyan-400/20">
        <ChatWindow messages={messages} />
        <InputBar 
          onSendMessage={sendTextMessage}
          isListening={isSessionActive}
          onToggleListen={toggleSession}
          isThinking={isThinking || isProcessing}
        />
      </div>
    </div>
  );
};

export default App;