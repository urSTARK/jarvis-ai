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
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const inputAnimationRef = useRef<number | null>(null);
    const outputAnimationRef = useRef<number | null>(null);
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

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
                
                // Serial audio graph: Source -> Gain -> Analyser -> Destination
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
    
    // This effect speaks the greeting message once the user's name is known AND the user has
    // interacted with the page to allow audio playback.
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
    }, [addNewTask, updateTask, addMessage]);

    const stopSession = useCallback(async () => {
        if (sessionPromiseRef.current) {
            const session = await sessionPromiseRef.current;
            session.close();
            sessionPromiseRef.current = null;
        }
        if (inputAnimationRef.current) cancelAnimationFrame(inputAnimationRef.current);
        // Do not cancel the output animation frame, as TTS may still be playing
        scriptProcessorRef.current?.disconnect();
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        if (inputAudioContextRef.current?.state !== 'closed') inputAudioContextRef.current?.close();
        audioSourcesRef.current.forEach(source => source.stop());
        audioSourcesRef.current.clear();
        setIsSessionActive(false);
        setMicVolume(0);
    }, []);

    const startSession = useCallback(async () => {
        if (!aiRef.current || sessionPromiseRef.current || isSessionActive) return;
        
        await initializeOutputAudio();

        try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
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
                    systemInstruction: `You are Friday, a witty, helpful, and slightly sarcastic AI assistant. Keep your responses concise unless asked for detail. The user's name is ${userName || 'Sir/Ma\'am'}. Address them by their name when appropriate. You can generate images and search the web.`,
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
                       // Transcription handling, state updates, etc.
                        if (message.serverContent?.inputTranscription) {
                            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
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
                            // DO NOT set isSpeaking to false here. This causes a race condition where the orb animation
                            // stops before the final audio chunk has finished playing. The 'ended' event on the
                            // audio source is the correct source of truth for this state.
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
                        console.log('Friday session closed.');
                        stopSession();
                    },
                }
            });
        } catch(e) {
            console.error("Failed to start session:", e);
            setError(`Failed to start session: ${(e as Error).message}. Check microphone permissions.`);
        }
    }, [isSessionActive, addMessage, updateLastMessage, executeToolCall, stopSession, initializeOutputAudio, userName]);

    const sendTextMessage = useCallback(async (message: string) => {
        if (!geminiServiceRef.current) return;
        addMessage({ text: message, sender: Sender.User });
        setIsThinkingText(true);

        try {
            const response = await geminiServiceRef.current.generateText(message, false);
            const responseText = response.text;
            addMessage({ text: responseText, sender: Sender.AI });
            await speakText(responseText);
        } catch (e) {
            console.error("Error in text chat:", e);
            addMessage({ text: "My apologies, I encountered an error.", sender: Sender.System });
        } finally {
            setIsThinkingText(false);
        }
    }, [addMessage, speakText]);


    const clearSession = useCallback(() => {
        setMessages([createGreetingMessage(userName)]);
        setTasks([]);
        localStorage.removeItem(LOCAL_STORAGE_MESSAGES_KEY);
        localStorage.removeItem(LOCAL_STORAGE_TASKS_KEY);
    }, [userName]);

    const restartSession = useCallback(async () => {
        await stopSession();
        clearSession();
        setTimeout(startSession, 100);
    }, [stopSession, clearSession, startSession]);
    
    return {
        messages, isSessionActive, isThinking, isProcessing, isSpeaking, micVolume, outputVolume, error,
        clearSession, restartSession, sendTextMessage, isThinkingText, startSession, stopSession,
        geminiService: geminiServiceRef.current, hasVeoApiKey, addMessage, initializeOutputAudio
    };
};