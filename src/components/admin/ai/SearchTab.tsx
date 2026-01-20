/**
 * SearchTab Component
 * Test semantic, object-based, and face-based search with advanced filters
 */

import React, { useState, useEffect, useCallback } from 'react';
import { aiApi } from '../../../services/aiApi';
import { contactsApi } from '../../../services/contactsApi';
import { SearchResults } from './components';
import {
  AdvancedSearchFilters,
  SearchFilterState,
  getDefaultFilters,
} from './components/AdvancedSearchFilters';
import type { SearchResult, FaceCluster } from '../../../types/ai';

interface Contact {
  id: string;
  name: string;
}

interface DetectedObjectClass {
  class: string;
  count: number;
}

// Full-screen image viewer modal
const ImageViewerModal: React.FC<{
  result: SearchResult;
  results: SearchResult[];
  onClose: () => void;
  onNavigate: (result: SearchResult) => void;
}> = ({ result, results, onClose, onNavigate }) => {
  const currentIndex = results.findIndex(r => r.asset_id === result.asset_id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < results.length - 1;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrevious) onNavigate(results[currentIndex - 1]);
    if (e.key === 'ArrowRight' && hasNext) onNavigate(results[currentIndex + 1]);
  }, [onClose, onNavigate, hasPrevious, hasNext, results, currentIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const imageUrl = result.thumbnail_url || result.web_uri;

  return (
    <div
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-4xl z-10"
      >
        &times;
      </button>

      {/* Previous button */}
      {hasPrevious && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(results[currentIndex - 1]); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full z-10"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Image */}
      <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        ) : (
          <div className="w-96 h-96 bg-gray-800 rounded-lg flex items-center justify-center text-6xl">
            Image
          </div>
        )}
        {/* Info bar */}
        <div className="mt-4 text-center text-white/80 text-sm">
          <span className="bg-white/20 px-3 py-1 rounded-full">
            {Math.round(result.similarity * 100)}% match
          </span>
          <span className="ml-3 text-white/60">
            {currentIndex + 1} of {results.length}
          </span>
          {result.matched_objects && result.matched_objects.length > 0 && (
            <span className="ml-3">
              Objects: {result.matched_objects.join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(results[currentIndex + 1]); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full z-10"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
};

export const SearchTab: React.FC = () => {
  const [textQuery, setTextQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [clusters, setClusters] = useState<FaceCluster[]>([]);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObjectClass[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  // Advanced filters
  const [filters, setFilters] = useState<SearchFilterState>(getDefaultFilters());
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Load contacts, clusters, and detected objects
  useEffect(() => {
    const loadData = async () => {
      try {
        const [contactsResult, clustersResult, objectsResult] = await Promise.all([
          contactsApi.getContacts(),
          aiApi.getClusters(),
          aiApi.getDetectedObjects(),
        ]);

        if (contactsResult.contacts && contactsResult.contacts.length > 0) {
          setContacts(contactsResult.contacts.map((c) => ({
            id: c.id,
            name: c.display_name || c.first_name || 'Unknown',
          })));
        }

        if (clustersResult.success && clustersResult.data) {
          setClusters(clustersResult.data.clusters || []);
        }

        if (objectsResult.success && objectsResult.data) {
          setDetectedObjects(objectsResult.data.objects || []);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();
  }, []);

  const hasActiveFilters = () => {
    return (
      filters.dateStart ||
      filters.dateEnd ||
      filters.people.length > 0 ||
      filters.objectClasses.length > 0 ||
      filters.mediaType !== 'all' ||
      filters.descriptionQuery ||
      filters.textQuery
    );
  };

  const handleSearch = async () => {
    // Need either a query or active filters
    if (!textQuery.trim() && !hasActiveFilters()) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setSearchTime(null);

    const startTime = Date.now();

    try {
      // Build combined search request
      const searchFilters: Record<string, unknown> = {};

      if (filters.dateStart) {
        searchFilters.date_start = filters.dateStart;
      }
      if (filters.dateEnd) {
        searchFilters.date_end = filters.dateEnd;
      }
      if (filters.people.length > 0) {
        searchFilters.people = filters.people;
      }
      if (filters.objectClasses.length > 0) {
        searchFilters.object_classes = filters.objectClasses;
      }
      if (filters.mediaType !== 'all') {
        searchFilters.media_type = filters.mediaType;
      }
      if (filters.searchInDescriptions && filters.descriptionQuery) {
        searchFilters.description_query = filters.descriptionQuery;
      }
      if (filters.searchInOcr && filters.textQuery) {
        searchFilters.text_query = filters.textQuery;
      }

      // Use combined search if we have filters, otherwise simple semantic search
      const hasFilters = Object.keys(searchFilters).length > 0;

      let result;
      if (hasFilters || !filters.searchInSemantic) {
        // Combined search
        result = await aiApi.searchCombined({
          query: filters.searchInSemantic && textQuery.trim() ? textQuery : undefined,
          filters: hasFilters ? searchFilters as Parameters<typeof aiApi.searchCombined>[0]['filters'] : undefined,
          limit: 50,
        });
      } else {
        // Simple semantic search
        result = await aiApi.searchByText({
          query: textQuery,
          limit: 50,
        });
      }

      if (result.success && result.data) {
        setResults(result.data.results || []);
        setSearchTime(Date.now() - startTime);
      } else {
        setError(result.error || 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setFilters(getDefaultFilters());
  };

  return (
    <div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
        Search Test
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Search by semantic text, detected objects, people, dates, and more.
      </p>

      {/* Main Search Form */}
      <div className="search-form">
        <input
          type="text"
          className="ai-input search-form__input"
          value={textQuery}
          onChange={e => setTextQuery(e.target.value)}
          placeholder="e.g., photos of people at the beach, sunset, dogs playing..."
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button
          className="ai-button ai-button--primary"
          onClick={handleSearch}
          disabled={loading || (!textQuery.trim() && !hasActiveFilters())}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Advanced Filters */}
      <AdvancedSearchFilters
        filters={filters}
        onChange={setFilters}
        contacts={contacts}
        clusters={clusters}
        detectedObjects={detectedObjects}
        isExpanded={filtersExpanded}
        onToggleExpand={() => setFiltersExpanded(!filtersExpanded)}
      />

      {/* Active Filters Summary */}
      {hasActiveFilters() && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          color: '#6b7280',
        }}>
          <span>Active filters:</span>
          {filters.dateStart && <span className="advanced-filters__tag active">From: {filters.dateStart}</span>}
          {filters.dateEnd && <span className="advanced-filters__tag active">To: {filters.dateEnd}</span>}
          {filters.people.length > 0 && (
            <span className="advanced-filters__tag active">{filters.people.length} people</span>
          )}
          {filters.objectClasses.length > 0 && (
            <span className="advanced-filters__tag active">{filters.objectClasses.length} objects</span>
          )}
          {filters.mediaType !== 'all' && (
            <span className="advanced-filters__tag active">{filters.mediaType}</span>
          )}
          <button
            onClick={handleClearFilters}
            style={{
              marginLeft: '0.5rem',
              padding: '0.25rem 0.5rem',
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="ai-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Results */}
      {searchTime !== null && (
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
          Found {results.length} results in {(searchTime / 1000).toFixed(2)}s
        </p>
      )}

      <SearchResults
        results={results}
        loading={loading}
        onSelect={setSelectedResult}
      />

      {/* Image Viewer Modal */}
      {selectedResult && (
        <ImageViewerModal
          result={selectedResult}
          results={results}
          onClose={() => setSelectedResult(null)}
          onNavigate={setSelectedResult}
        />
      )}
    </div>
  );
};
