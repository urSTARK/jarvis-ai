
import React, { useState, useEffect } from 'react';
import { useJarvis } from './hooks/useJarvis';
import Orb from './components/Orb';
import ChatWindow from './components/ChatWindow';
import FluidBackground from './components/FluidBackground';
import InputBar from './components/InputBar';
import NamePrompt from './components/NamePrompt';

// Define colors for UI effects, mirroring Orb's states
const UI_COLORS = {
  SPEAKING: 'rgb(255, 58, 58)',
  THINKING: 'rgb(138, 43, 226)',
  PROCESSING: 'rgb(255, 165, 0)',
  DEFAULT: 'rgb(255, 58, 58)',
  SHUTDOWN: 'rgb(139, 0, 0)',
  WAKING_UP: 'rgb(0, 255, 255)',
};

const App: React.FC = () => {
  const [userName, setUserName] = useState<string | null>(() => localStorage.getItem('friday-userName'));
  const [isAudioReady, setIsAudioReady] = useState(false);

  const { 
    messages, 
    isSessionActive, 
    isThinking,
    isProcessing,
    isSpeaking,
    isShutdown,
    isShuttingDown,
    isWakingUp,
    micVolume,
    outputVolume,
    error,
    clearSession,
    restartSession,
    sendTextMessage,
    shutdown,
    isThinkingText,
    startSession,
    stopSession,
    initializeOutputAudio,
    handleWakeUp,
  } = useJarvis(userName, isAudioReady);

  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [glowColor, setGlowColor] = useState(UI_COLORS.DEFAULT);

  useEffect(() => {
    let color = UI_COLORS.DEFAULT;
    if (isWakingUp) {
        color = UI_COLORS.WAKING_UP;
    } else if (isShutdown || isShuttingDown) {
        color = UI_COLORS.SHUTDOWN;
    } else if (isProcessing) {
        color = UI_COLORS.PROCESSING;
    } else if (isSpeaking) {
        color = UI_COLORS.SPEAKING;
    } else if (isThinking || isThinkingText) {
        color = UI_COLORS.THINKING;
    }
    setGlowColor(color);
  }, [isWakingUp, isShutdown, isShuttingDown, isProcessing, isSpeaking, isThinking, isThinkingText]);

  const handleNameSubmit = async (name: string) => {
    if (initializeOutputAudio) {
        await initializeOutputAudio();
    }
    localStorage.setItem('friday-userName', name);
    setUserName(name);
    setIsAudioReady(true);
  };

  const handleActivate = async () => {
    if (initializeOutputAudio) {
        await initializeOutputAudio();
    }
    setIsAudioReady(true);
  }

  if (error) {
    return (
      <div className="h-screen w-screen bg-slate-900 text-white flex flex-col items-center justify-center font-mono p-4 text-center">
        <h1 className="text-3xl font-bold text-red-500 mb-4">System Malfunction</h1>
        <p className="text-lg mb-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen grid grid-rows-1 grid-cols-1 font-sans overflow-hidden">
      {!userName && <NamePrompt onNameSubmit={handleNameSubmit} />}
      {userName && !isAudioReady && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <button 
                onClick={handleActivate}
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-4 px-8 rounded-full transition-all duration-300 shadow-lg shadow-red-500/50 transform hover:scale-105"
            >
                Activate Friday
            </button>
        </div>
      )}
      <FluidBackground />
      <div className={`absolute top-4 right-4 z-30 flex items-center space-x-2 transition-opacity duration-300 ${isChatExpanded ? 'opacity-0 pointer-events-none' : ''}`}>
        <button 
          onClick={() => setIsChatVisible(v => !v)}
          className="text-slate-300 hover:text-white transition-colors py-2 px-4 rounded-lg hover:bg-white/10"
          aria-label={isChatVisible ? "Hide Panel" : "Show Panel"}
        >
          {isChatVisible ? 'Hide Panel' : 'Show Panel'}
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

      {/* Orb Container (Layer 2) */}
      <div className={`row-start-1 col-start-1 flex flex-col items-center justify-center p-4 relative transition-all duration-500 ${isChatExpanded ? 'opacity-0' : ''} z-20 pointer-events-none`}>
        <button
          onClick={isShutdown ? () => handleWakeUp() : shutdown}
          className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-transparent transition-transform duration-200 hover:scale-105 active:scale-100 pointer-events-auto"
          aria-label={isShutdown ? "Wake up Friday" : "Enter Standby Mode"}
          title={isShutdown ? "Wake up Friday" : "Enter Standby Mode"}
        >
          <Orb 
            isListening={isSessionActive} 
            isThinking={isThinking || isThinkingText} 
            isProcessing={isProcessing}
            isSpeaking={isSpeaking}
            isShutdown={isShutdown}
            isShuttingDown={isShuttingDown}
            isWakingUp={isWakingUp}
            micVolume={micVolume}
            outputVolume={outputVolume}
          />
        </button>
      </div>

      {/* Chat Container (Layer 1) */}
      <div className="row-start-1 col-start-1 flex flex-col justify-end pointer-events-none z-30">
        <div 
          className={`flex-shrink-0 w-full flex flex-col bg-transparent overflow-hidden ${isChatExpanded ? 'fixed inset-0 z-40 rounded-none' : 'rounded-t-3xl'} pointer-events-auto`}
          style={{ 
              height: isChatExpanded ? '100vh' : (isChatVisible ? '50vh' : '0px'),
              transition: 'height 0.5s ease-in-out'
          }}
        >
          <div className="flex-shrink-0 bg-transparent flex items-center justify-end px-4 py-1">
              <button 
                  onClick={() => setIsChatExpanded(v => !v)}
                  className="text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                  aria-label={isChatExpanded ? "Collapse Panel" : "Expand Panel"}
                  style={{ visibility: isChatVisible ? 'visible' : 'hidden' }}
              >
                  {isChatExpanded ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 4.5 4.5M9 15v4.5M9 15H4.5M9 15l-4.5 4.5m10.5-10.5V4.5M15 9h4.5M15 9l4.5-4.5M15 15v4.5M15 15h4.5M15 15l4.5 4.5" />
                      </svg>
                  ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                      </svg>
                  )}
              </button>
          </div>
          <ChatWindow messages={messages} />
          <InputBar 
              onSendMessage={sendTextMessage}
              isListening={isSessionActive}
              onToggleListen={isSessionActive ? stopSession : startSession}
              isThinking={isThinking || isThinkingText}
              isShutdown={isShutdown}
              onWakeUp={() => handleWakeUp()}
          />
        </div>
      </div>

    </div>
  );
};

export default App;