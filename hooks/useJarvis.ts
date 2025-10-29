import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob, FunctionCall } from "@google/genai";
import type { Message, Task } from '../types';
import { Sender, TaskStatus } from '../types';

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
        description: 'Searches the web for real-time information on a given topic. Use for recent events, news, or any up-to-date information.',
        properties: {
            query: { type: Type.STRING, description: 'The search query.' },
        },
        required: ['query'],
    },
  },
  {
    name: 'openUrl',
    parameters: {
      type: Type.OBJECT,
      description: 'Opens a given URL in a new browser tab.',
      properties: {
        url: { type: Type.STRING, description: 'The fully qualified URL to open.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'setReminder',
    parameters: {
      type: Type.OBJECT,
      description: 'Sets a reminder for the user.',
      properties: {
        time: { type: Type.STRING, description: 'The time for the reminder in seconds from now. e.g., "10" for 10 seconds.' },
        subject: { type: Type.STRING, description: 'The subject of the reminder.' },
      },
      required: ['time', 'subject'],
    },
  },
  {
      name: 'getCurrentTime',
      parameters: {
          type: Type.OBJECT,
          description: "Gets the current time.",
          properties: {},
          required: []
      }
  }
];

const greetingMessage: Message = {
    id: crypto.randomUUID(),
    text: "Hello, I am J.A.R.V.I.S. I am online and listening.",
    sender: Sender.AI,
    timestamp: new Date().toISOString()
};

export const useJarvis = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const saved = localStorage.getItem('jarvis-messages');
            if (saved) {
                const parsed = JSON.parse(saved);
                return Array.isArray(parsed) && parsed.length > 0 ? parsed : [greetingMessage];
            }
            return [greetingMessage];
        } catch (error) {
            console.error("Failed to parse messages from localStorage", error);
            return [greetingMessage];
        }
    });
    const [tasks, setTasks] = useState<Task[]>(() => {
        try {
            const saved = localStorage.getItem('jarvis-tasks');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error("Failed to parse tasks from localStorage", error);
            return [];
        }
    });
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [micVolume, setMicVolume] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const aiRef = useRef<GoogleGenAI | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        // Fix: The API key must be obtained exclusively from `process.env.API_KEY`.
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            // Fix: Update error message to refer to the correct environment variable.
            setError('J.A.R.V.I.S. is offline. The API_KEY environment variable is not configured.');
            return;
        }
        try {
            aiRef.current = new GoogleGenAI({ apiKey });
        } catch (e) {
            console.error("Failed to initialize GoogleGenAI:", e);
            setError('Failed to initialize AI services.');
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('jarvis-messages', JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        localStorage.setItem('jarvis-tasks', JSON.stringify(tasks));
    }, [tasks]);

    const speak = useCallback(async (text: string) => {
        if (!aiRef.current) return;
        try {
            const response = await aiRef.current.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                },
            });
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                if (!outputAudioContextRef.current) {
                    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                }
                const ctx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
            }
        } catch (error) { console.error("TTS Error:", error); }
    }, []);

    const addNewTask = (description: string): Task => {
        const newTask: Task = {
            id: crypto.randomUUID(), description, status: TaskStatus.InProgress, startTime: new Date().toISOString(),
        };
        setTasks(prev => [newTask, ...prev.slice(0, 9)]);
        return newTask;
    };
    
    const updateTask = (id: string, status: TaskStatus, result?: string) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status, result } : t));
    };
    
    const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
        setMessages(prev => [...prev.filter(m => !m.isPartial), { ...message, id: crypto.randomUUID(), timestamp: new Date().toISOString() }]);
    };

    const updateLastMessage = (text: string, sender: Sender, isPartial: boolean) => {
        setMessages(prev => {
            const lastMsg = prev[prev.length -1];
            if (lastMsg?.isPartial && lastMsg.sender === sender) {
                return [...prev.slice(0, -1), { ...lastMsg, text: lastMsg.text + text, isPartial }];
            }
            const newPartialMessage: Message = { id: crypto.randomUUID(), text, sender, timestamp: new Date().toISOString(), isPartial: true };
            return [...prev, newPartialMessage];
        });
    };
    
    const executeToolCall = useCallback(async (fc: FunctionCall) => {
        const task = addNewTask(`Executing: ${fc.name}`);
        setIsProcessing(true);
        let result: any = { status: 'OK' };

        try {
            switch (fc.name) {
                case 'searchWeb':
                    const query = fc.args.query as string;
                    await speak(`Searching the web for: ${query}`);
                    const searchResponse = await aiRef.current!.models.generateContent({
                        model: "gemini-2.5-flash",
                        contents: query,
                        config: { tools: [{googleSearch: {}}] },
                    });
                    const groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
                    const sources = groundingChunks?.map((chunk: any) => chunk.web) ?? [];
                    const searchResultText = searchResponse.text;
                    addMessage({ text: searchResultText, sender: Sender.AI, sources });
                    await speak(searchResultText);
                    result = { summary: searchResultText };
                    break;
                case 'openUrl':
                    window.open(fc.args.url as string, '_blank');
                    await speak(`Opening ${new URL(fc.args.url as string).hostname}`);
                    break;
                case 'setReminder':
                    const timeInSeconds = parseInt(fc.args.time as string, 10);
                    const subject = fc.args.subject as string;
                    await speak(`Of course. I will remind you about "${subject}" in ${timeInSeconds} seconds.`);
                    setTimeout(() => {
                        speak(`Reminder: ${subject}`);
                        alert(`J.A.R.V.I.S. Reminder: ${subject}`);
                    }, timeInSeconds * 1000);
                    break;
                case 'getCurrentTime':
                    const currentTime = new Date().toLocaleTimeString();
                    await speak(`The current time is ${currentTime}`);
                    result = { time: currentTime };
                    break;
                default:
                    result = { error: 'Unknown function' };
                    await speak(`I'm sorry, I don't know how to do that.`);
            }
            updateTask(task.id, TaskStatus.Completed);
            return { id: fc.id, name: fc.name, response: { result } };

        } catch (error) {
            console.error(`Error executing tool ${fc.name}:`, error);
            updateTask(task.id, TaskStatus.Failed, (error as Error).message);
            await speak(`I encountered an error while trying to ${fc.name}.`);
            return { id: fc.id, name: fc.name, response: { result: { error: (error as Error).message } } };
        } finally {
            setIsProcessing(false);
        }
    }, [speak]);
    
    const disconnect = useCallback(() => {
        sessionPromiseRef.current?.then(session => session.close());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setIsSessionActive(false);
        setIsThinking(false);
        setMicVolume(0);
    }, []);

    const connect = useCallback(async () => {
        if (!aiRef.current || isSessionActive || sessionPromiseRef.current) return;
        setIsSessionActive(true);

        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outputCtx = outputAudioContextRef.current;
        nextStartTimeRef.current = 0;

        let stream: MediaStream | null = null;
        let scriptProcessor: ScriptProcessorNode | null = null;
        let analyser: AnalyserNode | null = null;

        sessionPromiseRef.current = aiRef.current.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        analyser = inputAudioContext.createAnalyser();
                        analyser.fftSize = 512;
                        const bufferLength = analyser.frequencyBinCount;
                        const dataArray = new Uint8Array(bufferLength);
                        
                        source.connect(analyser);
                        analyser.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);

                        const draw = () => {
                            animationFrameRef.current = requestAnimationFrame(draw);
                            analyser?.getByteTimeDomainData(dataArray);
                            let sum = 0;
                            for(let i = 0; i < bufferLength; i++) {
                                const v = (dataArray[i] / 128.0) - 1.0;
                                sum += v * v;
                            }
                            const rms = Math.sqrt(sum / bufferLength);
                            setMicVolume(rms * 2.5); // Amplify for better visual
                        };
                        draw();

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                    } catch (err) {
                        console.error("Error getting audio stream:", err);
                        setError("Microphone access denied. Please enable microphone permissions in your browser settings.");
                        disconnect();
                    }
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        setIsThinking(true);
                        const text = message.serverContent.inputTranscription.text;
                        updateLastMessage(text, Sender.User, true);
                    } else if (message.serverContent?.outputTranscription) {
                        setIsThinking(false);
                        const text = message.serverContent.outputTranscription.text;
                        updateLastMessage(text, Sender.AI, true);
                    }

                    if (message.serverContent?.turnComplete) {
                        setIsThinking(false);
                        setMessages(prev => prev.map(m => (m.isPartial ? { ...m, isPartial: false } : m)));
                    }

                    if (message.toolCall) {
                        setIsThinking(false);
                        const toolResponses = [];
                        for (const fc of message.toolCall.functionCalls) {
                            const response = await executeToolCall(fc);
                            toolResponses.push(response);
                        }
                        sessionPromiseRef.current?.then(s => s.sendToolResponse({ functionResponses: toolResponses }));
                    }

                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (base64Audio) {
                        setIsThinking(false);
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                        const source = outputCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputCtx.destination);
                        source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }

                    if (message.serverContent?.interrupted) {
                        for (const source of audioSourcesRef.current.values()) source.stop();
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error("Session error:", e);
                    setError("A session error occurred. Please refresh the page.");
                    disconnect();
                },
                onclose: () => {
                    stream?.getTracks().forEach(track => track.stop());
                    scriptProcessor?.disconnect();
                    analyser?.disconnect();
                    if(inputAudioContext.state !== 'closed') inputAudioContext.close();
                    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                    sessionPromiseRef.current = null;
                    setIsSessionActive(false);
                    setIsThinking(false);
                    setMicVolume(0);
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                systemInstruction: 'You are J.A.R.V.I.S., a witty, helpful, and slightly sarcastic AI assistant. Keep your responses concise. Use the searchWeb tool for any questions about recent events or real-time information.',
                tools: [{ functionDeclarations }],
            },
        });
    }, [isSessionActive, executeToolCall, disconnect]);
    
    // Auto-start the session on component mount
    useEffect(() => {
        if(aiRef.current) {
            connect();
        }
        return () => {
            disconnect();
        }
    }, [aiRef.current, connect, disconnect]);

    const clearSession = () => {
        setMessages([greetingMessage]);
        setTasks([]);
        localStorage.removeItem('jarvis-messages');
        localStorage.removeItem('jarvis-tasks');
        for (const source of audioSourcesRef.current.values()) source.stop();
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;
        addMessage({ sender: Sender.System, text: "Session cleared." });
    };

    return { messages, tasks, isSessionActive, isThinking, isProcessing, micVolume, error, clearSession };
};