import React, { useState } from 'react';

interface NamePromptProps {
  onNameSubmit: (name: string) => void;
}

const NamePrompt: React.FC<NamePromptProps> = ({ onNameSubmit }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onNameSubmit(name.trim());
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-lg flex items-center justify-center font-sans">
      <div className="text-center text-white p-8 animate-fade-in">
        <h1 className="text-3xl font-light tracking-widest mb-4">Welcome</h1>
        <p className="text-slate-300 mb-6">How should Friday address you?</p>
        <form onSubmit={handleSubmit} className="flex flex-col items-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full max-w-xs bg-slate-800/80 border border-slate-600 rounded-full py-3 px-6 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-shadow duration-300 mb-4"
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-full transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </form>
      </div>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default NamePrompt;