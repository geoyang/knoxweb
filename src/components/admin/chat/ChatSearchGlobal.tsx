import React, { useState, useEffect, useRef } from 'react';
import { chatApi, GlobalSearchResult } from '../../../services/chatApi';

interface ChatSearchGlobalProps {
  onSelectConversation: (conversationId: string, searchQuery: string) => void;
  onClearSearch: () => void;
}

export const ChatSearchGlobal: React.FC<ChatSearchGlobalProps> = ({
  onSelectConversation,
  onClearSearch,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      setTotalHits(0);
      setShowResults(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const result = await chatApi.searchGlobal(query);
      setLoading(false);
      if (result.success && result.data) {
        setResults(result.data.results);
        setTotalHits(result.data.total_hits);
        setShowResults(true);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setTotalHits(0);
    setShowResults(false);
    onClearSearch();
  };

  const handleSelect = (result: GlobalSearchResult) => {
    onSelectConversation(result.conversation_id, query);
    setShowResults(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all chats..."
          className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
        />
        {loading && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
        {query && !loading && (
          <button onClick={handleClear} className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
            Found {totalHits} matches in {results.length} conversations
          </div>
          {results.map((result) => (
            <button
              key={result.conversation_id}
              onClick={() => handleSelect(result)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800 truncate">{result.title}</span>
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  {result.hit_count} {result.hit_count === 1 ? 'match' : 'matches'}
                </span>
              </div>
              <p className="text-sm text-gray-500 truncate mt-1">{result.preview}</p>
            </button>
          ))}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-lg shadow-lg z-50 p-4 text-center text-gray-500 text-sm">
          No messages found matching "{query}"
        </div>
      )}
    </div>
  );
};
