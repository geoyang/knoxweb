/**
 * SearchResults Component
 * Displays search results grid with similarity scores
 */

import React from 'react';
import type { SearchResult } from '../../../../types/ai';

interface SearchResultsProps {
  results: SearchResult[];
  loading?: boolean;
  onSelect?: (result: SearchResult) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  loading = false,
  onSelect,
}) => {
  if (loading) {
    return (
      <div className="ai-empty">
        <div className="ai-spinner ai-spinner--large" />
        <p className="ai-empty__text">Searching...</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-empty__icon">🔍</div>
        <p className="ai-empty__text">No results found</p>
      </div>
    );
  }

  return (
    <div className="search-results">
      {results.map((result, index) => (
        <div
          key={result.asset_id || index}
          className="search-result-card"
          onClick={() => onSelect?.(result)}
          style={{ cursor: onSelect ? 'pointer' : 'default' }}
        >
          {result.thumbnail_url || result.web_uri ? (
            <img
              src={result.thumbnail_url || result.web_uri}
              alt={`Result ${index + 1}`}
              className="search-result-card__image"
              loading="lazy"
            />
          ) : (
            <div
              className="search-result-card__image"
              style={{
                backgroundColor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              🖼️
            </div>
          )}
          <span className="search-result-card__score">
            {Math.round(result.similarity * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
};
