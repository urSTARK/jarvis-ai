import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob, FunctionCall } from "@google/genai";
import type { Message, Task } from '../types';
import { Sender, TaskStatus } from '../types';
import { GeminiService } from '../services/geminiService';

// --- Constants for localStorage keys ---
const LOCAL_STORAGE_MESSAGES_KEY = 'friday-messages';
const LOCAL_STORAGE_TASKS_KEY = 'friday-tasks';

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
  {
    name: 'generateImage',
    parameters: {
      type: Type.OBJECT,
      description: 'Generates an image based on a textual description.',
      properties: {
        prompt: { type: Type.STRING, description: 'A detailed description of the image to generate.' },
        aspectRatio: { type: Type.STRING, description: 'The aspect ratio. Supported: "1:1", "16:9", "9:16", "4:3", "3:4".' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'shutdownAssistant',
    parameters: {
      type: Type.OBJECT,
      description: 'Puts the assistant into a low-power standby mode. The assistant will stop listening for general commands and only listen for a wake word to reactivate.',
      properties: {},
    },
  },
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
    const [tasks, setTasks] = useState<Task[]>(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_TASKS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isThinkingText, setIsThinkingText] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isShutdown, setIsShutdown] = useState(false);
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

    useEffect(() => {
        localStorage.setItem(LOCAL_STORAGE_TASKS_KEY, JSON.stringify(tasks));
    }, [tasks]);

    const addNewTask = useCallback((description: string): Task => {
        const newTask: Task = {
            id: crypto.randomUUID(), description, status: TaskStatus.InProgress, startTime: new Date().toISOString(),
        };
        setTasks(prev => [newTask, ...prev.slice(0, 9)]);
        return newTask;
    }, []);
    
    const updateTask = useCallback((id: string, status: TaskStatus, result?: string) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status, result } : t));
    }, []);
    
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
    
    const executeToolCall = useCallback(async (fc: FunctionCall) => {
        if (!geminiServiceRef.current) return { status: 'ERROR', message: 'Gemini service not initialized.' };
        const task = addNewTask(`Executing: ${fc.name}`);
        setIsProcessing(true);
        let responseTextForSession = 'Task completed successfully.';

        try {
            switch (fc.name) {
                case 'shutdownAssistant':
                    setIsShutdown(true);
                    responseTextForSession = ''; // Make shutdown silent
                    updateTask(task.id, TaskStatus.Completed, 'Shutdown command received.');
                    break;
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
                case 'generateImage': {
                    const { prompt, aspectRatio } = fc.args;
                    const imageUrl = await geminiServiceRef.current.generateImage(prompt as string, (aspectRatio || '1:1') as any);
                    responseTextForSession = `I've generated the image as requested. I've added it to the Toolbelt for viewing.`;
                    addMessage({ text: `${responseTextForSession}\n[View Image](${imageUrl})`, sender: Sender.AI });
                    break;
                }
            }
            updateTask(task.id, TaskStatus.Completed, responseTextForSession);
        } catch (e) {
            console.error(`Error executing tool ${fc.name}:`, e);
            responseTextForSession = `I failed to execute the task: ${(e as Error).message}`;
            updateTask(task.id, TaskStatus.Failed, (e as Error).message);
        } finally {
            setIsProcessing(false);
        }

        return { result: { message: responseTextForSession }};
    }, [addNewTask, updateTask, addMessage, setIsShutdown]);

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
        // Do NOT stop mediaStream tracks here, so the wake word listener can use it.
        // Close the input audio context to stop processing for the live session.
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

    const sendTextMessage = useCallback(async (message: string) => {
        if (!geminiServiceRef.current || isShutdown || !message.trim()) return;
        addMessage({ text: message, sender: Sender.User });

        // Directly handle shutdown command to ensure reliability and silence
        if (message.toLowerCase().includes('shutdown')) {
            setIsShutdown(true);
            return;
        }

        setIsThinkingText(true);

        try {
            const stream = await geminiServiceRef.current.generateTextStream(message, false);
            let fullText = '';
            // Start with an empty partial message so the bubble appears immediately
            updateLastMessage('', Sender.AI, true);

            for await (const chunk of stream) {
                fullText += chunk.text;
                updateLastMessage(fullText, Sender.AI, true);
            }
            
            // Finalize the message by updating it with isPartial: false
            updateLastMessage(fullText, Sender.AI, false);
            
            // Speak the full response at the end
            if (fullText) {
                await speakText(fullText);
            }

        } catch (e) {
            console.error("Error in text chat:", e);
            const errorMessage = "My apologies, I encountered a communication error.";
            // Finalize the message with an error, replacing any partial content
            updateLastMessage(errorMessage, Sender.System, false);
        } finally {
            setIsThinkingText(false);
        }
    }, [addMessage, speakText, isShutdown, updateLastMessage, setIsShutdown]);

    const startSession = useCallback(async () => {
        if (!aiRef.current || sessionPromiseRef.current || isSessionActive || isShutdown) return;
        
        await initializeOutputAudio();
        addMessage({ sender: Sender.System, text: "Activating live session..." });

        try {
            // Reuse the media stream if it exists and is active, otherwise get a new one.
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
                        if (message.serverContent?.inputTranscription) {
                            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                             // Immediate shutdown interception
                            if (currentInputTranscriptionRef.current.toLowerCase().includes('shutdown')) {
                                // Stop any speaking immediately
                                audioSourcesRef.current.forEach(source => source.stop());
                                audioSourcesRef.current.clear();
                                setIsSpeaking(false);
                                
                                // Finalize the user's message and prevent it from being re-added
                                updateLastMessage(currentInputTranscriptionRef.current.trim(), Sender.User, false);
                                currentInputTranscriptionRef.current = '';
                                
                                // Trigger shutdown
                                setIsShutdown(true); 
                                return; // Exit message handler early
                            }
                            updateLastMessage(currentInputTranscriptionRef.current, Sender.User, true);
                        } else if (message.serverContent?.outputTranscription) {
                            setIsThinking(false);
                            setIsSpeaking(true);
                            currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                            updateLastMessage(currentOutputTranscriptionRef.current, Sender.AI, true);
                        }

                        if (message.serverContent?.turnComplete) {
                            if (currentInputTranscriptionRef.current.trim()) addMessage({ text: currentInputTranscriptionRef.current.trim(), sender: Sender.User });
                            if (currentOutputTranscriptionRef.current.trim()) addMessage({ text: currentOutputTranscriptionRef.current.trim(), sender: Sender.AI });
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';
                            setIsThinking(false);
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
    }, [isSessionActive, addMessage, updateLastMessage, executeToolCall, stopSession, initializeOutputAudio, userName, isShutdown]);

    const handleWakeUp = useCallback((command?: string) => {
        if (isShutdown) {
            if (command) {
                initialCommandAfterWakeUpRef.current = command;
            }
            setIsShutdown(false);
        }
    }, [isShutdown]);

    // Effect to process a command that was spoken along with the wake word.
    useEffect(() => {
        // This effect runs when the system is not in shutdown mode.
        if (!isShutdown) {
            const commandToRun = initialCommandAfterWakeUpRef.current;
            // If a command was captured during wake-up, process it.
            if (commandToRun) {
                initialCommandAfterWakeUpRef.current = null; // Consume the command so it doesn't run again.
                
                // Directly handle shutdown command to ensure reliability
                if (commandToRun.toLowerCase().includes('shutdown')) {
                    setIsShutdown(true);
                    addMessage({ sender: Sender.AI, text: "Acknowledged. Entering standby mode." });
                } else {
                    sendTextMessage(commandToRun);
                }
            }
        }
    }, [isShutdown, sendTextMessage, addMessage, setIsShutdown]);

    // Effect to manage the main Gemini Live session based on operational state
    useEffect(() => {
        if (!isShutdown && userName && isAudioReady && !isSessionActive) {
            startSession();
        } else if (isShutdown || !isAudioReady) {
            stopSession();
        }
    }, [isShutdown, userName, isAudioReady, isSessionActive, startSession, stopSession]);
    
    // Effect to manage the lightweight wake-word listener
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

        // isShutdown is true, start listener
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
                const transcript = event.results[i][0].transcript.trim().toLowerCase();
                if (transcript.includes('friday')) {
                    const wakeWordIndex = transcript.indexOf('friday');
                    const command = transcript.substring(wakeWordIndex + 'friday'.length).trim();
                    handleWakeUp(command);
                    return; // Stop processing once wake word is found
                }
            }
        };
        
        recognizer.onerror = (event: any) => {
            console.error('Wake word recognition error:', event.error);
             if (event.error === 'not-allowed') {
                addMessage({ sender: Sender.System, text: "Microphone access denied. Wake word is disabled." });
                if (wakeWordRecognizerRef.current) {
                    wakeWordRecognizerRef.current.onend = null; // Prevent restart
                    wakeWordRecognizerRef.current.stop();
                    wakeWordRecognizerRef.current = null;
                }
            }
        };

        recognizer.onend = () => {
            // Only restart if the ref still exists, meaning we haven't intentionally stopped it.
            if (wakeWordRecognizerRef.current) {
                recognizer.start();
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

    // Final cleanup on component unmount
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
        setTasks([]);
        localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
        localStorage.removeItem(LOCAL_STORAGE_TASKS_KEY);
    }, [userName]);

    const restartSession = useCallback(async () => {
        setIsShutdown(false); // Ensure we are not in shutdown state
        await stopSession();
        clearSession();
        setTimeout(startSession, 100);
    }, [stopSession, clearSession, startSession]);
    
    return {
        messages, isSessionActive, isThinking, isProcessing, isSpeaking, micVolume, outputVolume, error,
        clearSession, restartSession, sendTextMessage, isThinkingText, startSession, stopSession,
        geminiService: geminiServiceRef.current, hasVeoApiKey, addMessage, initializeOutputAudio,
        isShutdown, handleWakeUp,
    };
};