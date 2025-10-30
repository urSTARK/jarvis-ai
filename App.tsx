import React, { useState } from 'react';
import { useJarvis } from './hooks/useJarvis';
import Orb from './components/Orb';
import ChatWindow from './components/ChatWindow';

const App: React.FC = () => {
  const { 
    messages, 
    isSessionActive, 
    isThinking,
    isProcessing,
    isSpeaking,
    micVolume,
    outputVolume,
    error,
    clearSession,
    restartSession,
  } = useJarvis();

  const [isChatVisible, setIsChatVisible] = useState(true);

  if (error) {
    return (
      <div className="h-screen w-screen bg-slate-900 text-white flex flex-col items-center justify-center font-mono p-4 text-center">
        <h1 className="text-3xl font-bold text-red-500 mb-4">System Malfunction</h1>
        <p className="text-lg mb-2">{error}</p>
        <p className="text-slate-400">If you are the administrator, please ensure the <code className="bg-slate-700 p-1 rounded">API_KEY</code> is correctly configured in the Vercel project settings.</p>
        <a href="https://vercel.com/docs/projects/environment-variables" target="_blank" rel="noopener noreferrer" className="mt-6 text-cyan-400 hover:underline">
          Vercel Environment Variables Documentation
        </a>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col font-sans overflow-hidden">
      <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
        <button 
          onClick={() => setIsChatVisible(v => !v)}
          className="text-slate-300 hover:text-white transition-colors py-2 px-4 rounded-lg hover:bg-white/10"
          aria-label={isChatVisible ? "Hide Chat" : "Show Chat"}
        >
          {isChatVisible ? 'Hide Chat' : 'Show Chat'}
        </button>
        <button 
          onClick={restartSession}
          className="text-slate-300 hover:text-white transition-colors py-2 px-4 rounded-lg hover:bg-white/10"
          aria-label="Restart Session"
        >
          Restart
        </button>
        <button 
          onClick={clearSession}
          className="text-slate-300 hover:text-white transition-colors py-2 px-4 rounded-lg hover:bg-white/10"
          aria-label="Clear Session"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
        <Orb 
          isListening={isSessionActive} 
          isThinking={isThinking} 
          isProcessing={isProcessing}
          isSpeaking={isSpeaking}
          micVolume={micVolume}
          outputVolume={outputVolume}
        />
      </div>

      <div 
        className="flex flex-col bg-black/60 backdrop-blur-md rounded-t-3xl overflow-hidden transition-all duration-500 ease-in-out"
        style={{ height: isChatVisible ? `40vh` : '0px' }}
      >
        <ChatWindow messages={messages} />
      </div>

    </div>
  );
};

export default App;