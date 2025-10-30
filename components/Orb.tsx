import React from 'react';

interface OrbProps {
  isListening: boolean;
  isThinking: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  micVolume: number; // Normalized value 0-1
  outputVolume: number; // Normalized value 0-1
}

const Orb: React.FC<OrbProps> = ({ isListening, isThinking, isProcessing, isSpeaking, micVolume, outputVolume }) => {
  const combinedVolume = Math.max(micVolume, outputVolume);
  const isAudiblyActive = isListening || isSpeaking;

  // The orb morphs when there is any audible activity.
  const isMorphing = isAudiblyActive && combinedVolume > 0.02;

  // The main orb "glass" scales with voice for a breathing effect
  const orbScale = 1 + (isAudiblyActive ? combinedVolume * 0.05 : 0);

  // The glow is more reactive
  const glowScale = 1 + (isAudiblyActive ? combinedVolume * 0.4 : 0);

  const getStatusText = () => {
    if (isListening) return "Listening...";
    if (isSpeaking) return "Speaking...";
    if (isThinking) return "Thinking...";
    if (isProcessing) return "Processing...";
    return "Online";
  };

  return (
    <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center flex-shrink-0">
      {/* Dual-color glow effect */}
      {/* Purple Glow - top */}
      <div
        className="absolute w-[150%] h-[150%] transition-transform duration-200 ease-out"
        style={{
          background: 'radial-gradient(circle, rgba(138, 43, 226, 0.4) 0%, rgba(75, 0, 130, 0) 60%)',
          filter: 'blur(60px)',
          transform: `translateY(-20%) scale(${glowScale})`,
        }}
      />
      {/* Blue/Teal Glow - bottom */}
      <div
        className="absolute w-[150%] h-[150%] transition-transform duration-200 ease-out"
        style={{
          background: 'radial-gradient(circle, rgba(30, 144, 255, 0.4) 0%, rgba(0, 128, 128, 0) 60%)',
          filter: 'blur(60px)',
          transform: `translateY(20%) scale(${glowScale})`,
        }}
      />
      
      {/* The visible "glass" orb that morphs */}
      <div 
        className={`
          w-full h-full bg-black/25 backdrop-blur-lg border border-white/10 shadow-lg 
          transition-all duration-500 ease-in-out
          ${isMorphing ? 'animate-morph' : 'rounded-full'}
        `}
        style={{ 
          transform: `scale(${orbScale})`,
          animationDuration: isMorphing ? (isSpeaking ? '5s' : '10s') : 'initial'
        }}
      >
        {/* Thinking indicator: a spinning ring. Only shown when not speaking/listening. */}
        {isThinking && !isAudiblyActive && (
          <div className="absolute inset-0 border-[2px] border-purple-400/50 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
        )}
        
        {/* Idle state aesthetic rings */}
        {!isMorphing && !isThinking && (
          <>
            <div className="absolute inset-0 border-[3px] border-purple-500/10 rounded-full animate-pulse-slow"></div>
            <div className="absolute inset-2 border border-blue-300/10 rounded-full"></div>
          </>
        )}
      </div>

      {/* Text Content */}
      <div className="absolute flex flex-col items-center justify-center text-white font-sans text-center pointer-events-none">
        <h1 className="text-4xl font-bold tracking-wider">J.A.R.V.I.S.</h1>
        <p className="text-lg opacity-80 mt-1">{getStatusText()}</p>
      </div>
    </div>
  );
};

export default Orb;
