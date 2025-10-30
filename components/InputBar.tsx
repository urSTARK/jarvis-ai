
import React, { useState, useRef, useEffect } from 'react';

interface InputBarProps {
  onSendMessage: (message: string) => void;
  isListening: boolean;
  onToggleListen: () => void;
  isThinking: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSendMessage, isListening, onToggleListen, isThinking }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isThinking) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="p-4 bg-neutral-900/50 backdrop-blur-sm border-t border-neutral-700/50">
      <form onSubmit={handleSubmit} className="flex items-center space-x-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your command or just talk to me..."
            disabled={isThinking || isListening}
            className="w-full bg-neutral-800/80 border border-neutral-600 rounded-full py-3 px-6 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-shadow duration-300"
          />
        </div>
        <button
          type="button"
          onClick={onToggleListen}
          disabled={isThinking}
          className={`p-3 rounded-full transition-colors duration-300 ${
            isListening ? 'bg-red-500 animate-pulse' : 'bg-red-600 hover:bg-red-500'
          } ${isThinking ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
        <button
          type="submit"
          disabled={isThinking || !inputValue.trim()}
          className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-full transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default InputBar;