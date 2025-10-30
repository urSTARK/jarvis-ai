import React, { useState, useEffect } from 'react';
import { useJarvis } from './hooks/useJarvis';
import Orb from './components/Orb';
import ChatWindow from './components/ChatWindow';
import FluidBackground from './components/FluidBackground';
import InputBar from './components/InputBar';
import NamePrompt from './components/NamePrompt';

const Toolbelt: React.FC<{ 
  geminiService: ReturnType<typeof useJarvis>['geminiService'],
  hasVeoApiKey: boolean,
  onAddMessage: (msg: any) => void,
}> = ({ geminiService, hasVeoApiKey, onAddMessage }) => {
    const [activeTab, setActiveTab] = useState('imageGen');
    const [prompt, setPrompt] = useState('');
    const [aspectRatioImg, setAspectRatioImg] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
    const [aspectRatioVid, setAspectRatioVid] = useState<'16:9' | '9:16'>('16:9');
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [mediaResult, setMediaResult] = useState<{ type: 'image' | 'video' | 'text', src: string } | null>(null);
    
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        setFile(files[0]);
        setMediaResult(null);
      }
    };
    
    const resetState = () => {
      setIsLoading(false);
      setError('');
      setPrompt('');
      setFile(null);
      if(fileInputRef.current) fileInputRef.current.value = '';
    }

    const executeTask = async (taskFn: () => Promise<any>) => {
      if (!geminiService || isLoading) return;
      setIsLoading(true);
      setError('');
      setMediaResult(null);
      try {
        const result = await taskFn();
        return result;
      } catch (e) {
        console.error(e);
        setError((e as Error).message || 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    }
    
    const handleGenerateImage = async () => {
      if (!prompt) { setError("Prompt is required."); return; }
      const src = await executeTask(() => geminiService!.generateImage(prompt, aspectRatioImg));
      if (src) { setMediaResult({ type: 'image', src }); resetState(); }
    };

    const handleEditImage = async () => {
      if (!prompt) { setError("Prompt is required."); return; }
      if (!file) { setError("Image file is required."); return; }
      const src = await executeTask(() => geminiService!.editImage(file, prompt));
      if (src) { setMediaResult({ type: 'image', src }); resetState(); }
    };
    
    const handleAnalyzeContent = async () => {
      if (!prompt) { setError("A question or prompt is required."); return; }
      if (!file) { setError("A file is required for analysis."); return; }
      const task = file.type.startsWith('video/') 
        ? () => geminiService!.analyzeVideo(file, prompt)
        : () => geminiService!.analyzeImage(file, prompt);
      
      const resultText = await executeTask(task);
      if (resultText) {
        onAddMessage({ text: `Analysis of ${file.name}:\n\n${resultText}`, sender: 'ai'});
        setMediaResult(null);
        resetState();
      }
    };

    const handleGenerateVideo = async () => {
      if (!prompt && !file) { setError("A prompt or an image is required."); return; }
      
      if (!hasVeoApiKey && window.aistudio?.openSelectKey) {
        await window.aistudio.openSelectKey();
      }

      const task = file
        ? () => geminiService!.generateVideoFromImage(file, prompt, aspectRatioVid)
        : () => geminiService!.generateVideo(prompt, aspectRatioVid);
      
      const src = await executeTask(task);
      if (src) { setMediaResult({ type: 'video', src }); resetState(); }
    };

    const renderImageGen = () => (
      <div>
        <h3 className="text-lg font-medium text-red-400 mb-2">Image Generation & Editing</h3>
        <p className="text-sm text-slate-400 mb-4">Provide an image to edit it, or just a prompt to create a new one.</p>
        <div className="flex flex-col space-y-4">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A futuristic city skyline at dusk..." className="bg-slate-800 p-2 rounded w-full h-20 resize-none" />
          <input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="text-sm" />
          <div className="flex items-center space-x-2">
            <label className="text-sm">Aspect Ratio:</label>
            <select value={aspectRatioImg} onChange={e => setAspectRatioImg(e.target.value as any)} className="bg-slate-800 p-1 rounded">
              <option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="3:4">3:4</option>
            </select>
          </div>
          <div className="flex space-x-2">
            <button onClick={handleGenerateImage} disabled={isLoading || !!file} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded disabled:opacity-50">Generate New</button>
            <button onClick={handleEditImage} disabled={isLoading || !file} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded disabled:opacity-50">Edit Image</button>
          </div>
        </div>
      </div>
    );

    const renderVideoGen = () => (
       <div>
        <h3 className="text-lg font-medium text-red-400 mb-2">Video Generation</h3>
        <p className="text-sm text-slate-400 mb-4">Generate a video from a text prompt, or use an image as a starting point.</p>
        {!hasVeoApiKey && <p className="text-xs text-yellow-400 mb-2">Video generation requires selecting an API key. This may involve billing. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">Learn more</a>.</p> }
        <div className="flex flex-col space-y-4">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A robot surfing on a data wave..." className="bg-slate-800 p-2 rounded w-full h-20 resize-none" />
          <input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="text-sm" />
          <div className="flex items-center space-x-2">
            <label className="text-sm">Aspect Ratio:</label>
            <select value={aspectRatioVid} onChange={e => setAspectRatioVid(e.target.value as any)} className="bg-slate-800 p-1 rounded">
              <option value="16:9">16:9 (Landscape)</option><option value="9:16">9:16 (Portrait)</option>
            </select>
          </div>
          <button onClick={handleGenerateVideo} disabled={isLoading} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded disabled:opacity-50">Generate Video</button>
        </div>
      </div>
    );

    const renderAnalyzer = () => (
      <div>
        <h3 className="text-lg font-medium text-red-400 mb-2">Content Analyzer</h3>
        <p className="text-sm text-slate-400 mb-4">Upload an image or video and ask a question about it. The analysis will appear in the chat.</p>
        <div className="flex flex-col space-y-4">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What is the main subject in this image?" className="bg-slate-800 p-2 rounded w-full h-20 resize-none" />
          <input type="file" accept="image/*,video/*" onChange={handleFileChange} ref={fileInputRef} className="text-sm" />
          <button onClick={handleAnalyzeContent} disabled={isLoading || !file || !prompt} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded disabled:opacity-50">Analyze</button>
        </div>
      </div>
    );

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex items-center border-b border-slate-700 mb-4">
                {['imageGen', 'videoGen', 'analyzer'].map(id => {
                    const name = { imageGen: 'Image', videoGen: 'Video', analyzer: 'Analyze'}[id];
                    return <button key={id} onClick={() => { setActiveTab(id); resetState(); setMediaResult(null); }} className={`px-4 py-2 text-sm ${activeTab === id ? 'text-white border-b-2 border-red-500' : 'text-slate-400'}`}>{name}</button>
                })}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  {activeTab === 'imageGen' && renderImageGen()}
                  {activeTab === 'videoGen' && renderVideoGen()}
                  {activeTab === 'analyzer' && renderAnalyzer()}
                </div>
                <div className="flex items-center justify-center bg-slate-900/50 rounded-lg min-h-[200px]">
                  {isLoading && <div className="text-slate-300">Friday is working...</div>}
                  {error && <div className="text-red-400 p-4 text-center">{error}</div>}
                  {mediaResult?.type === 'image' && <img src={mediaResult.src} alt="Generated result" className="max-h-full max-w-full object-contain rounded"/>}
                  {mediaResult?.type === 'video' && <video src={mediaResult.src} controls autoPlay className="max-h-full max-w-full object-contain rounded"/>}
                </div>
              </div>
            </div>
        </div>
    );
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
    micVolume,
    outputVolume,
    error,
    clearSession,
    restartSession,
    sendTextMessage,
    isThinkingText,
    startSession,
    stopSession,
    geminiService,
    hasVeoApiKey,
    addMessage,
    initializeOutputAudio,
    handleWakeUp,
  } = useJarvis(userName, isAudioReady);

  const [isChatVisible, setIsChatVisible] = useState(true);
  const [activeMode, setActiveMode] = useState('chat'); // 'chat' or 'tools'

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
        <p className="text-slate-400">If you are the administrator, please ensure the <code className="bg-slate-700 p-1 rounded">API_KEY</code> is correctly configured.</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen flex flex-col font-sans overflow-hidden">
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
      <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
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

      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
        <Orb 
          isListening={isSessionActive} 
          isThinking={isThinking || isThinkingText} 
          isProcessing={isProcessing}
          isSpeaking={isSpeaking}
          isShutdown={isShutdown}
          micVolume={micVolume}
          outputVolume={outputVolume}
        />
      </div>

      <div 
        className="flex flex-col bg-black/60 backdrop-blur-md rounded-t-3xl overflow-hidden transition-all duration-500 ease-in-out"
        style={{ height: isChatVisible ? `50vh` : '0px' }}
      >
        <div className="flex-shrink-0 bg-black/30 flex items-center px-4">
            <button onClick={() => setActiveMode('chat')} className={`px-4 py-3 text-sm font-medium ${activeMode === 'chat' ? 'text-white border-b-2 border-red-500' : 'text-slate-400'}`}>
                Friday Chat
            </button>
            <button onClick={() => setActiveMode('tools')} className={`px-4 py-3 text-sm font-medium ${activeMode === 'tools' ? 'text-white border-b-2 border-red-500' : 'text-slate-400'}`}>
                Toolbelt
            </button>
        </div>
        {activeMode === 'chat' ? (
          <>
            <ChatWindow messages={messages} />
            <InputBar 
              onSendMessage={sendTextMessage}
              isListening={isSessionActive}
              onToggleListen={isSessionActive ? stopSession : startSession}
              isThinking={isThinking || isThinkingText}
              isShutdown={isShutdown}
              onWakeUp={() => handleWakeUp()}
            />
          </>
        ) : (
          <Toolbelt geminiService={geminiService} hasVeoApiKey={hasVeoApiKey} onAddMessage={addMessage}/>
        )}
      </div>

    </div>
  );
};

export default App;
