import { useState, useEffect, useRef, useCallback } from 'react';
// FIX: Module '"@google/genai"' has no exported member 'LiveSession'. Replaced with 'Connection'.
import { GoogleGenAI, Connection, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob, FunctionCall } from "@google/genai";
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


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
const greetingMessage: Message = {
    id: crypto.randomUUID(),
    text: "Hello, I am J.A.R.V.I.S. How can I assist you today?",
    sender: Sender.AI,
    timestamp: new Date().toISOString()
};

export const useJarvis = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const saved = localStorage.getItem('jarvis-messages');
        return saved ? JSON.parse(saved) : [greetingMessage];
    });
    const [tasks, setTasks] = useState<Task[]>(() => {
        const saved = localStorage.getItem('jarvis-tasks');
        return saved ? JSON.parse(saved) : [];
    });
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // FIX: Replaced 'LiveSession' with 'Connection' type.
    const sessionPromiseRef = useRef<Promise<Connection> | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    useEffect(() => {
        localStorage.setItem('jarvis-messages', JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        localStorage.setItem('jarvis-tasks', JSON.stringify(tasks));
    }, [tasks]);
    
    const speak = useCallback(async (text: string) => {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: 'Kore' },
                        },
                    },
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
        } catch (error) {
            console.error("TTS Error:", error);
        }
    }, []);

    const addNewTask = (description: string): Task => {
        const newTask: Task = {
            id: crypto.randomUUID(),
            description,
            status: TaskStatus.InProgress,
            startTime: new Date().toISOString(),
        };
        setTasks(prev => [newTask, ...prev]);
        return newTask;
    };
    
    const updateTask = (id: string, status: TaskStatus, result?: string) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status, result } : t));
    };
    
    const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
        setMessages(prev => [...prev.filter(m => !m.isPartial), { ...message, id: crypto.randomUUID(), timestamp: new Date().toISOString() }]);
    };

    // FIX: Bug where transcription text was appended instead of replaced.
    const updateLastMessage = (text: string, sender: Sender, isPartial: boolean) => {
        setMessages(prev => {
            const lastMsg = prev[prev.length -1];
            if (lastMsg?.isPartial && lastMsg.sender === sender) {
                return [...prev.slice(0, -1), { ...lastMsg, text: text, isPartial }];
            }
            const newPartialMessage: Message = { id: crypto.randomUUID(), text, sender, timestamp: new Date().toISOString(), isPartial: true };
            return [...prev, newPartialMessage];
        });
    };
    
    const executeToolCall = useCallback(async (fc: FunctionCall) => {
        const task = addNewTask(`Executing: ${fc.name}(${JSON.stringify(fc.args)})`);
        setIsProcessing(true);
        let result: any = { status: 'OK' };

        try {
            switch (fc.name) {
                // FIX: Add type assertions to function call arguments.
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

    const connect = useCallback(async () => {
        if (isSessionActive || sessionPromiseRef.current) return;
        setIsSessionActive(true);

        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outputCtx = outputAudioContextRef.current;
        nextStartTimeRef.current = 0;

        let stream: MediaStream | null = null;
        let scriptProcessor: ScriptProcessorNode | null = null;

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const source = inputAudioContext.createMediaStreamSource(stream);
                    scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                },
                // FIX: Refactor onmessage to handle transcription without deprecated 'isFinal' property.
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
                        setMessages(prev =>
                            prev.map(m => (m.isPartial ? { ...m, isPartial: false } : m))
                        );
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
                        for (const source of audioSourcesRef.current.values()) {
                            source.stop();
                        }
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error("Session error:", e);
                    addMessage({ text: "Session error. Please try again.", sender: Sender.System });
                    setIsSessionActive(false);
                },
                onclose: () => {
                    stream?.getTracks().forEach(track => track.stop());
                    scriptProcessor?.disconnect();
                    inputAudioContext.close();
                    sessionPromiseRef.current = null;
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                systemInstruction: 'You are J.A.R.V.I.S., a witty, helpful, and slightly sarcastic AI assistant. Keep your responses concise and to the point. When asked to perform a task, use the available tools.',
                tools: [{ functionDeclarations }],
            },
        });
    }, [isSessionActive, executeToolCall]);
    
    const disconnect = useCallback(() => {
        sessionPromiseRef.current?.then(session => session.close());
        setIsSessionActive(false);
        setIsThinking(false);
    }, []);

    const toggleSession = () => {
        if (isSessionActive) {
            disconnect();
        } else {
            connect();
        }
    };
    
    const sendTextMessage = async (text: string) => {
        if (!text.trim()) return;
        addMessage({ text, sender: Sender.User });
        setIsThinking(true);
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: text,
            });
            const aiText = response.text;
            addMessage({ text: aiText, sender: Sender.AI });
            speak(aiText);
        } catch (error) {
            console.error("Text message error:", error);
            const errorText = "My apologies, I encountered an error with that request.";
            addMessage({ text: errorText, sender: Sender.AI });
            speak(errorText);
        } finally {
            setIsThinking(false);
        }
    };


    return { messages, tasks, isSessionActive, isThinking, isProcessing, toggleSession, sendTextMessage };
};
