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
  const baseClasses = "relative w-48 h-48 md:w-64 md:h-64 rounded-full transition-all duration-500 ease-in-out flex items-center justify-center";
  
  const getOrbStateClasses = () => {
    if (isListening) return 'scale-110 shadow-lg shadow-red-500/50';
    if (isThinking) return 'animate-pulse';
    if(isProcessing || isSpeaking) return 'shadow-md shadow-amber-400/50'
    return '';
  }

  const combinedVolume = Math.max(micVolume, outputVolume);
  const volumeScale = 1 + combinedVolume * 0.1;
  const auraBaseOpacity = 0.1;
  const auraVolumeOpacity = combinedVolume * 0.3;
  const speakingAuraOpacity = 0.2 + outputVolume * 0.4;

  return (
    <div className={`${baseClasses} ${getOrbStateClasses()}`} style={{ transform: `scale(${volumeScale})`}}>
      {/* Aura layers */}
      <div 
        className="absolute inset-[-40px] rounded-full bg-red-500/50 blur-3xl transition-opacity duration-200" 
        style={{ opacity: auraBaseOpacity + auraVolumeOpacity * 0.5 + (isSpeaking ? speakingAuraOpacity : 0), transform: `scale(${1 + combinedVolume * 0.05})` }}
      ></div>
       <div 
        className="absolute inset-[-20px] rounded-full bg-red-400/50 blur-2xl transition-opacity duration-200" 
        style={{ opacity: auraBaseOpacity + auraVolumeOpacity + (isSpeaking ? speakingAuraOpacity * 0.8 : 0), transform: `scale(${1 + combinedVolume * 0.1})` }}
      ></div>

      <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-red-800 rounded-full blur-lg opacity-60"></div>
      <div className="absolute inset-2 bg-slate-900 rounded-full"></div>
      <div className="relative w-full h-full rounded-full overflow-hidden">
        {/* Inner rings */}
        <div className={`absolute inset-4 border-2 border-red-500/30 rounded-full ${isListening || isSpeaking ? 'animate-spin-slow' : ''}`}></div>
        <div className={`absolute inset-8 border border-red-500/20 rounded-full ${isListening || isSpeaking ? 'animate-spin-slow-reverse' : ''}`}></div>
        <div className={`absolute inset-12 border-2 border-red-600/30 rounded-full ${isThinking || isProcessing ? 'animate-ping' : ''}`}></div>

        {/* Core glow */}
        <div className="absolute inset-1/4 rounded-full bg-red-400/20 blur-xl"></div>
      </div>
      <div className="absolute text-white font-mono text-center">
        <p className="text-lg font-bold">J.A.R.V.I.S.</p>
        <p className="text-sm opacity-70">
          {isListening ? "Listening..." : isSpeaking ? "Speaking..." : isThinking ? "Thinking..." : isProcessing ? "Processing..." : "Online"}
        </p>
      </div>
    </div>
  );
};

export default Orb;