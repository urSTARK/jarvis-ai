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
    toggleSession,
    sendTextMessage 
  } = useJarvis();

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