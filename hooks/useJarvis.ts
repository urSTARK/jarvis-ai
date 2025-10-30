import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob, FunctionCall } from "@google/genai";
import type { Message } from '../types';
import { Sender } from '../types';
import { GeminiService } from '../services/geminiService';

// --- Constants for localStorage keys ---
const LOCAL_STORAGE_MESSAGES_KEY = 'friday-messages';

// --- Local Command Constants ---
const SHUTDOWN_COMMANDS = [
  'shutdown', 'shut down', 'set down', 'go to sleep', 'sleep mode',
  'sleep friday', 'friday sleep', 'turn off', 'go offline', 'shut up',
  'standby', 'power down', 'disengage', 'go to standby', 'enter standby',
  'that\'s enough for now', 'we\'re done for today', 'take a break', 'go on standby',
  'power off', 'that will be all', 'dismissed', 'end program', 'deactivate',
  'quiet mode', 'be quiet', 'mute yourself', 'that\'s all', 'i\'m done'
];

const OWNER_COMMANDS = [
  'who is your owner', 'who made you', 'your owner', 'who created you', 'your creator',
  'contact your owner', 'contact your creator', 'made by who', 'who is stark',
  'who is your honor', // Handle speech recognition inaccuracy
  'who is your honour', // Alternate spelling
  'who\'s your owner', // Handle contractions
  'who\'s your creator', // Handle contractions
  'who designed you',
  'who built you',
  'who is your maker',
  'your maker',
  'who are your creators',
  'tell me about your creator'
];

const SIMPLE_COMMANDS: Record<string, string> = {
  'hello': 'Hello! How can I assist you?',
  'hi': 'Hi there! What can I do for you today?',
  'hey': 'Hey! How can I help?',
  'how are you': "I'm operating at peak efficiency. Thanks for asking!",
  'whats your name': "I'm Friday, your personal AI assistant.",
  'who are you': "I'm Friday, an AI assistant inspired by the one from Iron Man.",
};

// --- Result type for local command processing ---
interface LocalCommandResult {
    handled: boolean;
    responseText?: string;
}

// --- Helper functions for audio processing ---
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- Function Declarations for the AI ---
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'searchWeb',
    parameters: {
        type: Type.OBJECT,
        description: 'Searches the web for real-time information. Use for recent events, news, or any up-to-date information that is not about places.',
        properties: {
            query: { type: Type.STRING, description: 'The search query.' },
        },
        required: ['query'],
    },
  },
  {
    name: 'searchNearby',
    parameters: {
      type: Type.OBJECT,
      description: 'Finds nearby places using Google Maps. Use for questions about restaurants, stores, parks, etc., near the user.',
      properties: {
        query: { type: Type.STRING, description: 'The type of place to search for. E.g., "pizza", "coffee shop".' },
      },
      required: ['query'],
    },
  },
  // Note: shutdownAssistant is removed and handled locally client-side for immediate response.
];

const createGreetingMessage = (name: string | null): Message => {
    const greetingText = name 
        ? `Hello, ${name}. I am Friday. I am online and listening.`
        : "Hello, I am Friday. I am online and listening.";
    return {
        id: crypto.randomUUID(),
        text: greetingText,
        sender: Sender.AI,
        timestamp: new Date().toISOString()
    };
};

export const useJarvis = (userName: string | null, isAudioReady: boolean) => {
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_MESSAGES_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.length > 0) return parsed;
            }
            return [createGreetingMessage(userName)];
        } catch { return [createGreetingMessage(userName)]; }
    });
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isThinkingText, setIsThinkingText] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isShutdown, setIsShutdown] = useState(false);
    const [isShuttingDown, setIsShuttingDown] = useState(false);
    const [isWakingUp, setIsWakingUp] = useState(false);
    const [micVolume, setMicVolume] = useState(0);
    const [outputVolume, setOutputVolume] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [hasVeoApiKey, setHasVeoApiKey] = useState(false);

    const aiRef = useRef<GoogleGenAI | null>(null);
    const geminiServiceRef = useRef<GeminiService | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const inputAnalyserRef = useRef<AnalyserNode | null>(null);
    const outputAnalyserRef = useRef<AnalyserNode | null>(null);
    const outputGainNodeRef = useRef<GainNode | null>(null);
    const wakeWordRecognizerRef = useRef<any | null>(null);
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const inputAnimationRef = useRef<number | null>(null);
    const outputAnimationRef = useRef<number | null>(null);
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');
    const initialCommandAfterWakeUpRef = useRef<string | null>(null);

    const initializeOutputAudio = useCallback(async () => {
        if (outputAudioContextRef.current && outputAudioContextRef.current.state === 'running') {
            return true;
        }
        try {
            const ctx = outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed'
                ? outputAudioContextRef.current
                : new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            if (!outputGainNodeRef.current || !outputAnalyserRef.current) {
                const gainNode = ctx.createGain();
                const analyserNode = ctx.createAnalyser();
                analyserNode.fftSize = 512;
                
                gainNode.connect(analyserNode);
                analyserNode.connect(ctx.destination);
                
                outputGainNodeRef.current = gainNode;
                outputAnalyserRef.current = analyserNode;
            }
            
            outputAudioContextRef.current = ctx;
            
            if (outputAnimationRef.current) {
                cancelAnimationFrame(outputAnimationRef.current);
            }

            const outputDataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
            const analyzeOutput = () => {
                if (!outputAnalyserRef.current) {
                    outputAnimationRef.current = null;
                    return;
                }
                outputAnalyserRef.current.getByteTimeDomainData(outputDataArray);
                let sum = outputDataArray.reduce((acc, val) => acc + Math.pow((val - 128) / 128, 2), 0);
                setOutputVolume(Math.sqrt(sum / outputDataArray.length));
                outputAnimationRef.current = requestAnimationFrame(analyzeOutput);
            };
            analyzeOutput();
            return true;
        } catch (e) {
            console.error("Could not create output audio context", e);
            setError("Could not initialize audio playback. Please check browser permissions.");
            return false;
        }
    }, []);

    const playSoundEffect = useCallback(async (type: 'power-up' | 'power-down') => {
        const audioInitialized = await initializeOutputAudio();
        if (!audioInitialized || !outputAudioContextRef.current || !outputGainNodeRef.current) return;

        const ctx = outputAudioContextRef.current;
        const gainNode = outputGainNodeRef.current;
        const oscillator = ctx.createOscillator();
        const effectGain = ctx.createGain();
        oscillator.connect(effectGain);
        effectGain.connect(gainNode);

        const now = ctx.currentTime;
        oscillator.type = 'sine';
        
        if (type === 'power-down') {
            oscillator.frequency.setValueAtTime(250, now);
            oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.5);
            effectGain.gain.setValueAtTime(0.3, now);
            effectGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            oscillator.start(now);
            oscillator.stop(now + 0.5);
        } else { // power-up
            oscillator.frequency.setValueAtTime(100, now);
            oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.8);
            effectGain.gain.setValueAtTime(0.001, now);
            effectGain.gain.linearRampToValueAtTime(0.4, now + 0.2);
            effectGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            oscillator.start(now);
            oscillator.stop(now + 0.8);
        }
    }, [initializeOutputAudio]);

    const speakText = useCallback(async (text: string) => {
        if (!geminiServiceRef.current) return;

        const audioInitialized = await initializeOutputAudio();
        if (!audioInitialized) {
            console.error("Audio could not be initialized for speaking.");
            return;
        }

        try {
            if (outputAudioContextRef.current?.state === 'suspended') {
                await outputAudioContextRef.current.resume();
            }

            const audioBufferData = await geminiServiceRef.current.textToSpeech(text);
            if (outputAudioContextRef.current && outputGainNodeRef.current) {
                const audioBuffer = await decodeAudioData(
                    new Uint8Array(audioBufferData),
                    outputAudioContextRef.current,
                    24000,
                    1
                );
                const source = outputAudioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputGainNodeRef.current);
                source.start();
                setIsSpeaking(true);

                const sourceSet = audioSourcesRef.current;
                sourceSet.add(source);
                source.addEventListener('ended', () => {
                    sourceSet.delete(source);
                    if (sourceSet.size === 0) {
                        setIsSpeaking(false);
                    }
                });
            }
        } catch (e) {
            console.error("Error during TTS:", e);
        }
    }, [initializeOutputAudio]);

    useEffect(() => {
        // Fix: Use process.env.API_KEY as per the guidelines to get the API key and resolve TypeScript error.
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            setError('Friday is offline. The API_KEY environment variable is not configured.');
            return;
        }
        try {
            aiRef.current = new GoogleGenAI({ apiKey });
            geminiServiceRef.current = new GeminiService(apiKey);
            if (window.aistudio?.hasSelectedApiKey) {
                window.aistudio.hasSelectedApiKey().then(setHasVeoApiKey);
            }
        } catch (e) {
            console.error("Failed to initialize AI services:", e);
            setError('Failed to initialize AI services.');
        }
    }, []);
    
    useEffect(() => {
        const saved = localStorage.getItem(LOCAL_STORAGE_MESSAGES_KEY);
        if ((!saved || JSON.parse(saved).length <= 1) && userName && isAudioReady) {
            const greetingMessage = createGreetingMessage(userName);
            setMessages([greetingMessage]);
            speakText(greetingMessage.text);
        }
    }, [userName, isAudioReady, speakText]);

    useEffect(() => {
        localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(messages));
    }, [messages]);

    const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
        setMessages(prev => [...prev.filter(m => !m.isPartial), { ...message, id: crypto.randomUUID(), timestamp: new Date().toISOString() }]);
    }, []);

    const updateLastMessage = useCallback((fullText: string, sender: Sender, isPartial: boolean) => {
        setMessages(prev => {
            const lastMsg = prev[prev.length -1];
            if (lastMsg?.isPartial && lastMsg.sender === sender) {
                return [...prev.slice(0, -1), { ...lastMsg, text: fullText, isPartial }];
            }
            const newPartialMessage: Message = { id: crypto.randomUUID(), text: fullText, sender, timestamp: new Date().toISOString(), isPartial: true };
            return [...prev, newPartialMessage];
        });
    }, []);
    
    const stopSession = useCallback(async () => {
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.warn("Error closing session, it might have been closed already.", e);
            } finally {
                sessionPromiseRef.current = null;
            }
        }
        if (inputAnimationRef.current) cancelAnimationFrame(inputAnimationRef.current);
        scriptProcessorRef.current?.disconnect();
        if (inputAudioContextRef.current?.state !== 'closed') {
             inputAudioContextRef.current?.close().then(() => {
                inputAudioContextRef.current = null;
             });
        }
        audioSourcesRef.current.forEach(source => source.stop());
        audioSourcesRef.current.clear();
        setIsSessionActive(false);
        setMicVolume(0);
    }, []);
    
    const shutdown = useCallback(() => {
        if (isShutdown || isShuttingDown) return;
        
        // Stop any AI speech and clear all active states immediately
        audioSourcesRef.current.forEach(source => source.stop());
        audioSourcesRef.current.clear();
        setIsSpeaking(false);
        setIsThinking(false);
        setIsThinkingText(false);
        setIsProcessing(false);

        // Clear any partial transcriptions or messages
        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';
        setMessages(prev => prev.filter(m => !m.isPartial));
        
        stopSession();
        playSoundEffect('power-down');
        setIsShuttingDown(true);

        setTimeout(() => {
            setIsShutdown(true);
            setIsShuttingDown(false);
        }, 800);
    }, [isShutdown, isShuttingDown, stopSession, playSoundEffect]);
    
    const processLocalCommand = useCallback((command: string): LocalCommandResult => {
        const sanitizedCommand = command.toLowerCase().trim().replace(/[.,!?]/g, '');
        
        const isOwnerCommand = OWNER_COMMANDS.some(cmd => sanitizedCommand.includes(cmd));
        if (isOwnerCommand) {
            const ownerResponse = "I am Friday, a sophisticated AI assistant. I was designed and created by Stark. If you wish to contact my creator, you can reach him here: https://t.me/urstarkz";
            return { handled: true, responseText: ownerResponse };
        }

        const isShutdownCommand = SHUTDOWN_COMMANDS.some(cmd => sanitizedCommand.includes(cmd));
        if (isShutdownCommand) {
            shutdown();
            return { handled: true };
        }

        const simpleResponse = SIMPLE_COMMANDS[sanitizedCommand];
        if (simpleResponse) {
            return { handled: true, responseText: simpleResponse };
        }

        return { handled: false };
    }, [shutdown]);

    const executeToolCall = useCallback(async (fc: FunctionCall) => {
        if (!geminiServiceRef.current) return { status: 'ERROR', message: 'Gemini service not initialized.' };
        setIsProcessing(true);
        let responseTextForSession = 'Task completed successfully.';

        try {
            switch (fc.name) {
                case 'searchWeb': {
                    const { query } = fc.args;
                    const response = await geminiServiceRef.current.groundedSearch(query as string);
                    responseTextForSession = response.text;
                    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
                        ?.map((chunk: any) => chunk.web).filter(Boolean) || [];
                    addMessage({ text: responseTextForSession, sender: Sender.AI, sources });
                    break;
                }
                case 'searchNearby': {
                    const { query } = fc.args;
                    const response = await geminiServiceRef.current.mapsSearch(query as string);
                    responseTextForSession = response.text;
                    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
                        ?.map((chunk: any) => chunk.maps).filter(Boolean) || [];
                    addMessage({ text: responseTextForSession, sender: Sender.AI, sources });
                    break;
                }
                default:
                    responseTextForSession = `I'm sorry, I don't know how to do that.`;
            }
        } catch (e) {
            console.error(`Error executing tool ${fc.name}:`, e);
            responseTextForSession = `I failed to execute the task: ${(e as Error).message}`;
        } finally {
            setIsProcessing(false);
        }

        return { result: { message: responseTextForSession }};
    }, [addMessage]);

    const sendTextMessage = useCallback(async (message: string) => {
        if (isShutdown || isShuttingDown || !message.trim()) return;
        
        addMessage({ text: message, sender: Sender.User });

        const localCommand = processLocalCommand(message);
        if (localCommand.handled) {
            if (localCommand.responseText) {
                addMessage({ text: localCommand.responseText, sender: Sender.AI });
                speakText(localCommand.responseText);
            }
            return;
        }

        if (!geminiServiceRef.current) return;
        
        setIsThinkingText(true);

        try {
            const stream = await geminiServiceRef.current.generateTextStream(message, false);
            let fullText = '';
            updateLastMessage('', Sender.AI, true);

            for await (const chunk of stream) {
                fullText += chunk.text;
                updateLastMessage(fullText, Sender.AI, true);
            }
            
            updateLastMessage(fullText, Sender.AI, false);
            
            if (fullText) {
                await speakText(fullText);
            }

        } catch (e) {
            console.error("Error in text chat:", e);
            const error = e as Error;
            let errorMessage = "My apologies, I encountered a communication error.";
            if (error.message.includes('429') || error.message.toLowerCase().includes('quota')) {
                errorMessage = "Usage limit reached. The free tier for this service has been exceeded. Please check your billing details on Google AI Studio or try again later.";
            }
            updateLastMessage(errorMessage, Sender.System, false);
        } finally {
            setIsThinkingText(false);
        }
    }, [addMessage, speakText, isShutdown, isShuttingDown, updateLastMessage, processLocalCommand]);

    const startSession = useCallback(async () => {
        if (!aiRef.current || sessionPromiseRef.current || isSessionActive || isShutdown || isShuttingDown) return;
        
        await initializeOutputAudio();
        addMessage({ sender: Sender.System, text: "Activating live session..." });

        try {
            if (!mediaStreamRef.current || mediaStreamRef.current.getAudioTracks().every(t => t.readyState === 'ended')) {
                mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            
            const inputSource = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            inputAnalyserRef.current = inputAudioContextRef.current.createAnalyser();
            inputAnalyserRef.current.fftSize = 512;
            inputSource.connect(inputAnalyserRef.current);
            const micDataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
            const analyzeMic = () => {
                if (!inputAnalyserRef.current) return;
                inputAnalyserRef.current.getByteTimeDomainData(micDataArray);
                let sum = micDataArray.reduce((acc, val) => acc + Math.pow((val - 128) / 128, 2), 0);
                setMicVolume(Math.sqrt(sum / micDataArray.length));
                inputAnimationRef.current = requestAnimationFrame(analyzeMic);
            };
            analyzeMic();

            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            inputSource.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

            sessionPromiseRef.current = aiRef.current.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: `You are Friday, a witty, helpful, and slightly sarcastic AI assistant. The user can shut you down by saying "shutdown". Your name is the wake word. Keep your responses concise unless asked for detail. The user's name is ${userName || 'Sir/Ma\'am'}. Address them by their name when appropriate. You can generate images and search the web.`,
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    tools: [{ functionDeclarations }],
                },
                callbacks: {
                    onopen: () => {
                        setIsSessionActive(true);
                        scriptProcessorRef.current!.onaudioprocess = (e) => {
                            const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
                            sessionPromiseRef.current?.then((s) => s.sendRealtimeInput({ media: pcmBlob }));
                        };
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.turnComplete) {
                            const finalInput = currentInputTranscriptionRef.current.trim();
                            const finalOutput = currentOutputTranscriptionRef.current.trim();
                            
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';

                            const localCommand = processLocalCommand(finalInput);
                            
                            setMessages(prev => {
                                const newMessages = prev.filter(m => !m.isPartial);
                                if (finalInput) {
                                    newMessages.push({ id: crypto.randomUUID(), text: finalInput, sender: Sender.User, timestamp: new Date().toISOString() });
                                 }
                                if (localCommand.handled) {
                                    if (localCommand.responseText) {
                                        newMessages.push({ id: crypto.randomUUID(), text: localCommand.responseText, sender: Sender.AI, timestamp: new Date().toISOString() });
                                    }
                                } else if (finalOutput) {
                                    newMessages.push({ id: crypto.randomUUID(), text: finalOutput, sender: Sender.AI, timestamp: new Date().toISOString() });
                                }
                                return newMessages;
                            });

                            if (localCommand.handled) {
                                audioSourcesRef.current.forEach(source => source.stop());
                                audioSourcesRef.current.clear();
                                setIsSpeaking(false);
                                if (localCommand.responseText) {
                                    speakText(localCommand.responseText);
                                }
                            }
                            setIsThinking(false);
                            return;
                        }

                        if (message.serverContent?.inputTranscription) {
                            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                            updateLastMessage(currentInputTranscriptionRef.current, Sender.User, true);
                        }
                        
                        if (message.serverContent?.outputTranscription) {
                            setIsThinking(false);
                            setIsSpeaking(true);
                            currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                            updateLastMessage(currentOutputTranscriptionRef.current, Sender.AI, true);
                        }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            setIsThinking(false);
                            setIsSpeaking(true);
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputGainNodeRef.current!);
                            source.addEventListener('ended', () => {
                                audioSourcesRef.current.delete(source);
                                if (audioSourcesRef.current.size === 0) setIsSpeaking(false);
                            });
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            audioSourcesRef.current.add(source);
                        }

                        if (message.toolCall) {
                            setIsThinking(false);
                            for (const fc of message.toolCall.functionCalls) {
                                const result = await executeToolCall(fc);
                                sessionPromiseRef.current?.then((s) => {
                                    s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } } });
                                });
                            }
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Friday session error:', e);
                        setError('A session error occurred. Please restart.');
                        stopSession();
                    },
                    onclose: () => {
                        stopSession();
                    },
                }
            });
        } catch(e) {
            console.error("Failed to start session:", e);
            setError(`Failed to start session: ${(e as Error).message}. Check microphone permissions.`);
        }
    }, [isSessionActive, addMessage, updateLastMessage, executeToolCall, stopSession, initializeOutputAudio, userName, isShutdown, isShuttingDown, processLocalCommand, speakText]);

    const handleWakeUp = useCallback((command?: string) => {
        if (isShutdown) {
            if (command) {
                initialCommandAfterWakeUpRef.current = command;
            }
            setIsWakingUp(true);
            setIsShutdown(false);
            playSoundEffect('power-up');
            speakText("Online.");

            setTimeout(() => {
                setIsWakingUp(false);
            }, 1200);
        }
    }, [isShutdown, playSoundEffect, speakText]);

    useEffect(() => {
        if (!isShutdown && !isWakingUp) {
            const commandToRun = initialCommandAfterWakeUpRef.current;
            if (commandToRun) {
                initialCommandAfterWakeUpRef.current = null;
                sendTextMessage(commandToRun);
            }
        }
    }, [isShutdown, isWakingUp, sendTextMessage]);

    useEffect(() => {
        if (!isShutdown && !isShuttingDown && userName && isAudioReady && !isSessionActive) {
            startSession();
        } else if (isShutdown || !isAudioReady) {
            stopSession();
        }
    }, [isShutdown, isShuttingDown, userName, isAudioReady, isSessionActive, startSession, stopSession]);
    
    useEffect(() => {
        if (!isShutdown) {
            if (wakeWordRecognizerRef.current) {
                wakeWordRecognizerRef.current.onresult = null;
                wakeWordRecognizerRef.current.onerror = null;
                wakeWordRecognizerRef.current.onend = null;
                wakeWordRecognizerRef.current.stop();
                wakeWordRecognizerRef.current = null;
            }
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addMessage({ sender: Sender.System, text: "Wake word feature is not supported by your browser." });
            return;
        }

        if (wakeWordRecognizerRef.current) return;

        addMessage({ sender: Sender.System, text: "Entering standby. Say 'Friday' to wake me." });
        const recognizer = new SpeechRecognition();
        wakeWordRecognizerRef.current = recognizer;
        
        recognizer.continuous = true;
        recognizer.interimResults = true;
        
        recognizer.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const transcript = event.results[i][0].transcript.trim().toLowerCase();
                    if (transcript.startsWith('friday')) {
                        const command = transcript.substring('friday'.length).trim();
                        handleWakeUp(command);
                        return;
                    }
                }
            }
        };
        
        recognizer.onerror = (event: any) => {
            console.error('Wake word recognition error:', event.error);
             if (event.error === 'not-allowed') {
                addMessage({ sender: Sender.System, text: "Microphone access denied. Wake word is disabled." });
                if (wakeWordRecognizerRef.current) {
                    wakeWordRecognizerRef.current.onend = null;
                    wakeWordRecognizerRef.current.stop();
                    wakeWordRecognizerRef.current = null;
                }
            }
        };

        recognizer.onend = () => {
            if (wakeWordRecognizerRef.current && isShutdown) {
                try {
                  recognizer.start();
                } catch(e) {
                  console.warn("Could not restart wake word recognizer.", e);
                }
            }
        };

        recognizer.start();

        return () => {
            if (recognizer) {
                recognizer.onresult = null;
                recognizer.onerror = null;
                recognizer.onend = null;
                recognizer.stop();
            }
        };
    }, [isShutdown, handleWakeUp, addMessage]);

    useEffect(() => {
        return () => {
            stopSession();
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (wakeWordRecognizerRef.current) {
                wakeWordRecognizerRef.current.onend = null;
                wakeWordRecognizerRef.current.stop();
            }
        }
    }, [stopSession]);


    const clearSession = useCallback(() => {
        setMessages([createGreetingMessage(userName)]);
        localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
    }, [userName]);

    const restartSession = useCallback(async () => {
        setIsWakingUp(false);
        setIsShuttingDown(false);
        setIsShutdown(false);
        await stopSession();
        clearSession();
        setTimeout(startSession, 100);
    }, [stopSession, clearSession, startSession]);
    
    return {
        messages, isSessionActive, isThinking, isProcessing, isSpeaking, micVolume, outputVolume, error,
        clearSession, restartSession, sendTextMessage, isThinkingText, startSession, stopSession,
        geminiService: geminiServiceRef.current, hasVeoApiKey, addMessage, initializeOutputAudio,
        shutdown,
        isShutdown, handleWakeUp, isShuttingDown, isWakingUp,
    };
};