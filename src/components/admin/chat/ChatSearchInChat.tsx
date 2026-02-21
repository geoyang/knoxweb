import React, { useState, useEffect, useRef } from 'react';
import { chatApi, ConversationSearchResult } from '../../../services/chatApi';

interface ChatSearchInChatProps {
  conversationId: string;
  initialQuery?: string;
  onNavigateToMessage: (messageId: string) => void;
  onClose: () => void;
}

export const ChatSearchInChat: React.FC<ChatSearchInChatProps> = ({
  conversationId,
  initialQuery = '',
  onNavigateToMessage,
  onClose,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ConversationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, []);

  const performSearch = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const result = await chatApi.searchConversation(conversationId, searchQuery);
    setLoading(false);

    if (result.success && result.data) {
      setResults(result.data.results);
      setCurrentIndex(0);
      if (result.data.results.length > 0) {
        onNavigateToMessage(result.data.results[0].id);
      }
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigatePrev = () => {
    if (results.length === 0) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
    setCurrentIndex(newIndex);
    onNavigateToMessage(results[newIndex].id);
  };

  const navigateNext = () => {
    if (results.length === 0) return;
    const newIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    onNavigateToMessage(results[newIndex].id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) navigatePrev();
      else navigateNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200">
      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in conversation..."
        className="flex-1 bg-transparent text-sm outline-none placeholder-blue-400"
      />
      {loading ? (
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      ) : results.length > 0 ? (
        <span className="text-xs text-blue-600 whitespace-nowrap">
          {currentIndex + 1} of {results.length}
        </span>
      ) : query.length >= 2 ? (
        <span className="text-xs text-blue-400">No results</span>
      ) : null}
      <div className="flex items-center gap-1">
        <button
          onClick={navigatePrev}
          disabled={results.length === 0}
          className="p-1 text-blue-500 hover:bg-blue-100 rounded disabled:opacity-30"
          title="Previous (Shift+Enter)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={navigateNext}
          disabled={results.length === 0}
          className="p-1 text-blue-500 hover:bg-blue-100 rounded disabled:opacity-30"
          title="Next (Enter)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <button onClick={onClose} className="p-1 text-blue-500 hover:bg-blue-100 rounded">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export const highlightSearchText = (text: string, query: string): React.ReactNode => {
  if (!query || query.length < 2) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark>
    ) : (
      part
    )
  );
};
