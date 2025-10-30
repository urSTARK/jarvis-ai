import React, { useRef, useEffect } from 'react';
import type { Message } from '../types';
import { Sender } from '../types';

interface ChatWindowProps {
  messages: Message[];
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages }) => {
  const endOfMessagesRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
    const isUser = message.sender === Sender.User;
    const bubbleClasses = isUser
      ? 'bg-red-700 self-end rounded-br-none'
      : 'bg-slate-800/40 border border-slate-700/50 self-start rounded-bl-none';
    
    const alignClasses = isUser ? 'items-end' : 'items-start';
    const partialClasses = message.isPartial ? 'opacity-70 italic' : '';

    return (
      <div className={`flex flex-col max-w-lg mx-2 my-2 ${alignClasses}`}>
        <div className={`px-4 py-3 rounded-2xl shadow-md ${bubbleClasses} ${partialClasses}`}>
          <p className="text-white whitespace-pre-wrap">{message.text}</p>
          {message.sources && message.sources.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-600">
              <p className="text-xs text-slate-400 mb-1">Sources:</p>
              <ul className="list-disc list-inside text-sm">
                {message.sources.map((source, index) => (
                  <li key={index}>
                    <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">
                      {source.title || new URL(source.uri).hostname}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1 px-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    );
  };

  return (
    <div className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={endOfMessagesRef} />
    </div>
  );
};

export default ChatWindow;