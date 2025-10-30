import React, { useEffect, useRef, useState } from 'react';

interface OrbProps {
  isListening: boolean;
  isThinking: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  isShutdown: boolean;
  micVolume: number;
  outputVolume: number;
}

// --- Color Helpers ---
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
};

const lerpColor = (
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number },
  factor: number
): string => {
  const r = Math.round(color1.r + factor * (color2.r - color1.r));
  const g = Math.round(color1.g + factor * (color2.g - color1.g));
  const b = Math.round(color1.b + factor * (color2.b - color1.b));
  return `rgb(${r}, ${g}, ${b})`;
};

const COLORS = {
  LISTENING_LOW: hexToRgb('#00FF7F'),  // SpringGreen for normal voice
  LISTENING_MID: hexToRgb('#FFFF00'),  // Yellow for loud voice
  LISTENING_HIGH: hexToRgb('#FF4500'), // OrangeRed for too loud voice
  SPEAKING: 'rgb(255, 58, 58)',       // #FF3A3A for answering
  THINKING: 'rgb(138, 43, 226)',      // #8A2BE2 - BlueViolet
  PROCESSING: 'rgb(255, 165, 0)',     // #FFA500 - Orange
  DEFAULT: 'rgb(255, 58, 58)',        // #FF3A3A for default/idle state
  SHUTDOWN: 'rgb(139, 0, 0)',         // #8B0000 - DarkRed for standby
};

const ringConfig = [
  // Innermost, main ring with inner shadow
  { id: 1, radius: 150, strokeWidth: 3.5, opacity: 1.0, speed: 1, amplitudeFactor: 1, frequency: { f1: 6, f2: 3 }, filter: "url(#inner-shadow)" },
  // Outer rings for a layered, fluid glow effect
  { id: 2, radius: 155, strokeWidth: 2, opacity: 0.6, speed: 0.7, amplitudeFactor: 1.2, frequency: { f1: 5, f2: 2.5 } },
  { id: 3, radius: 160, strokeWidth: 1.5, opacity: 0.4, speed: 1.3, amplitudeFactor: 0.8, frequency: { f1: 7, f2: 3.5 } },
  { id: 4, radius: 165, strokeWidth: 1, opacity: 0.2, speed: 0.5, amplitudeFactor: 1.5, frequency: { f1: 4, f2: 2 } },
];


const Orb: React.FC<OrbProps> = ({ isListening, isThinking, isProcessing, isSpeaking, isShutdown, micVolume, outputVolume }) => {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedVolumeRef = useRef(0);
  const isInitialMount = useRef(true);
  
  const [currentColor, setCurrentColor] = useState(COLORS.DEFAULT);

  // Haptic feedback on state change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
  }, [isListening, isThinking, isProcessing, isSpeaking, isShutdown]);
  
  // Determine current color based on state
  useEffect(() => {
    let color = COLORS.DEFAULT; // Start with the default red.

    if (isShutdown) {
        color = COLORS.SHUTDOWN;
    } else if (isProcessing) {
      color = COLORS.PROCESSING;
    } else if (isSpeaking) {
      color = COLORS.SPEAKING;
    } else if (isThinking) {
      color = COLORS.THINKING;
    } else if (isListening) {
      // Amplify and clamp volume for a better visual range
      const volume = Math.min(micVolume * 2.5, 1);
      if (volume < 0.5) {
        if (COLORS.LISTENING_LOW && COLORS.LISTENING_MID) {
          color = lerpColor(COLORS.LISTENING_LOW, COLORS.LISTENING_MID, volume * 2);
        } else if (COLORS.LISTENING_LOW) {
          color = `rgb(${COLORS.LISTENING_LOW.r}, ${COLORS.LISTENING_LOW.g}, ${COLORS.LISTENING_LOW.b})`;
        }
      } else {
        if (COLORS.LISTENING_MID && COLORS.LISTENING_HIGH) {
          color = lerpColor(COLORS.LISTENING_MID, COLORS.LISTENING_HIGH, (volume - 0.5) * 2);
        } else if (COLORS.LISTENING_HIGH) {
           color = `rgb(${COLORS.LISTENING_HIGH.r}, ${COLORS.LISTENING_HIGH.g}, ${COLORS.LISTENING_HIGH.b})`;
        }
      }
    }
    setCurrentColor(color);
  }, [isListening, isThinking, isProcessing, isSpeaking, isShutdown, micVolume]);


  const getStatusText = () => {
    if (isShutdown) return "Standby";
    if (isProcessing) return "Processing...";
    if (isSpeaking) return "Answering...";
    if (isThinking) return "Thinking...";
    if (isListening) return "Listening...";
    return "Online";
  };
  
  // Keep a ref to the latest props to avoid re-running the effect on every frame.
  const latestProps = useRef({ isListening, isThinking, isProcessing, isSpeaking, isShutdown, micVolume, outputVolume });
  useEffect(() => {
    latestProps.current = { isListening, isThinking, isProcessing, isSpeaking, isShutdown, micVolume, outputVolume };
  });

  useEffect(() => {
    const animate = (time: number) => {
      // Get the latest props from the ref inside the animation loop.
      const { isListening, isThinking, isProcessing, isSpeaking, isShutdown, micVolume, outputVolume } = latestProps.current;
      const timeInSeconds = time * 0.001;
      
      let targetAmplitude = 0;
      let baseRotationSpeed = 1.0; // Default idle speed

      if (isShutdown) {
        const pulse = (Math.sin(timeInSeconds * 0.7) + 1) / 2; // Slow pulse
        targetAmplitude = 2 + (pulse * 2);
        baseRotationSpeed = 0.2; // Very slow rotation
      } else if (isSpeaking) {
        targetAmplitude = Math.min(outputVolume * 200, 100);
        baseRotationSpeed = 2.5; // Significantly faster when speaking
      } else if (isProcessing) {
        // Use a subtle pulsing effect for processing
        const pulse = (Math.sin(timeInSeconds * 2.5) + 1) / 2;
        targetAmplitude = 5 + (pulse * 10);
        baseRotationSpeed = 2.0;
      } else if (isThinking) {
        // Create a slow, deep "breathing" effect
        const pulse = (Math.sin(timeInSeconds * 1.5) + 1) / 2;
        targetAmplitude = 10 + (pulse * 15);
        baseRotationSpeed = 2.2;
      } else if (isListening) {
        // User stated this sensitivity is perfect.
        targetAmplitude = Math.min(micVolume * 400, 100);
        baseRotationSpeed = 2.0; // Faster when listening
      }
      
      // Increase smoothing factor for a faster, more responsive feel.
      smoothedVolumeRef.current += (targetAmplitude - smoothedVolumeRef.current) * 0.25;

      const points = 120;
      const centerX = 200;
      const centerY = 200;
      
      const fluidRotationFactor = 1 + Math.sin(timeInSeconds * 0.5) * 0.2;
      const expansionPulse = isShutdown ? 0 : Math.sin(timeInSeconds * 1.5) * 6;

      pathRefs.current.forEach((path, index) => {
        if (!path) return;

        const config = ringConfig[index];
        
        const rotation = timeInSeconds * 0.3 * config.speed * baseRotationSpeed * fluidRotationFactor;
        
        let d = '';
        
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2 + rotation;
          
          const amplitude = smoothedVolumeRef.current * config.amplitudeFactor;
          
          const timeFactor = time * 0.0002;
          const displacement1 = Math.sin(angle * config.frequency.f1 + timeFactor * config.speed) * amplitude;
          const displacement2 = Math.sin(angle * config.frequency.f2 - timeFactor * config.speed * 0.7) * amplitude * 0.5;

          const currentRadius = config.radius + expansionPulse + displacement1 + displacement2;
          
          const x = centerX + currentRadius * Math.cos(angle);
          const y = centerY + currentRadius * Math.sin(angle);
          
          if (i === 0) {
            d += `M${x},${y}`;
          } else {
            d += ` L${x},${y}`;
          }
        }
        
        d += ' Z';
        path.setAttribute('d', d);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // Empty dependency array means this effect runs only once on mount.

  return (
    <div className="relative w-full h-80 flex items-center justify-center flex-shrink-0 text-white font-sans text-center">
      <svg
        viewBox="0 0 400 400"
        className="absolute w-full h-full transition-all duration-300"
        style={{ filter: `drop-shadow(0 0 ${isShutdown ? 15 : 35}px ${currentColor}) drop-shadow(0 0 ${isShutdown ? 5 : 10}px ${currentColor})` }}
      >
        <defs>
          <filter id="inner-shadow">
            <feComponentTransfer in="SourceAlpha" result="inverted-alpha">
              <feFuncA type="table" tableValues="1 0" />
            </feComponentTransfer>
            <feGaussianBlur in="inverted-alpha" stdDeviation="4" result="blur" />
            <feFlood floodColor="#000" floodOpacity="0.75" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="shadow" />
            <feComposite in="shadow" in2="SourceGraphic" operator="in" result="inner-shadow-effect" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="inner-shadow-effect" />
            </feMerge>
          </filter>
        </defs>
        {ringConfig.map((config, index) => (
          <path
            key={config.id}
            ref={el => { pathRefs.current[index] = el; }}
            stroke={currentColor}
            strokeWidth={config.strokeWidth}
            strokeOpacity={config.opacity}
            fill="none"
            style={{ transition: 'stroke 0.3s ease-in-out' }}
            filter={config.filter || 'none'}
          />
        ))}
      </svg>

      <div className="relative z-10 flex flex-col items-center justify-center">
        <h1 className="text-xl md:text-2xl font-light tracking-widest transition-all duration-300" style={{ textShadow: `0 0 10px ${currentColor}` }}>
          FRIDAY
        </h1>
        <div className="px-4 py-1 mt-2">
            <p className="text-[10px] md:text-xs opacity-80 tracking-widest">{getStatusText()}</p>
        </div>
      </div>
    </div>
  );
};

export default Orb;
