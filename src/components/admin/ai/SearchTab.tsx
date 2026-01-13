/**
 * SearchTab Component
 * Test semantic, object-based, and face-based search
 */

import React, { useState, useEffect, useCallback } from 'react';
import { aiApi } from '../../../services/aiApi';
import { contactsApi } from '../../../services/contactsApi';
import { SearchResults } from './components';
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
            🖼️
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
  const [mode, setMode] = useState<'text' | 'object' | 'face'>('text');
  const [textQuery, setTextQuery] = useState('');
  const [objectQuery, setObjectQuery] = useState('');
  const [detectedObjects, setDetectedObjects] = useState<DetectedObjectClass[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [clusters, setClusters] = useState<FaceCluster[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

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

  const handleTextSearch = async () => {
    if (!textQuery.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setSearchTime(null);

    const startTime = Date.now();

    try {
      const result = await aiApi.searchByText({
        query: textQuery,
        limit: 20,
      });

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

  const handleFaceSearch = async () => {
    if (!selectedContactId && !selectedClusterId) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setSearchTime(null);

    const startTime = Date.now();

    try {
      const result = await aiApi.searchByFace({
        contact_id: selectedContactId || undefined,
        cluster_id: selectedClusterId || undefined,
        limit: 20,
      });

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

  const handleObjectSearch = async () => {
    if (!objectQuery.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setSearchTime(null);

    const startTime = Date.now();

    try {
      const result = await aiApi.searchByObject({
        object_class: objectQuery,
        min_confidence: 0.5,
        limit: 50,
      });

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

  const handleSearch = () => {
    if (mode === 'text') {
      handleTextSearch();
    } else if (mode === 'object') {
      handleObjectSearch();
    } else {
      handleFaceSearch();
    }
  };

  const labeledClusters = clusters.filter(c => c.name || c.knox_contact_id);

  return (
    <div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
        Search Test
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Search by semantic text, detected objects, or find photos of a specific person.
      </p>

      {/* Mode Toggle */}
      <div className="mode-toggle" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`mode-toggle__option ${mode === 'text' ? 'mode-toggle__option--active' : ''}`}
          onClick={() => setMode('text')}
        >
          Semantic
        </button>
        <button
          className={`mode-toggle__option ${mode === 'object' ? 'mode-toggle__option--active' : ''}`}
          onClick={() => setMode('object')}
        >
          Objects
        </button>
        <button
          className={`mode-toggle__option ${mode === 'face' ? 'mode-toggle__option--active' : ''}`}
          onClick={() => setMode('face')}
        >
          Faces
        </button>
      </div>

      {/* Search Form */}
      {mode === 'text' ? (
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
            disabled={loading || !textQuery.trim()}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      ) : mode === 'object' ? (
        <div>
          <div className="search-form">
            <input
              type="text"
              className="ai-input search-form__input"
              value={objectQuery}
              onChange={e => setObjectQuery(e.target.value)}
              placeholder="e.g., wine glass, person, car, dog..."
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              list="object-suggestions"
            />
            <datalist id="object-suggestions">
              {detectedObjects.map((obj, index) => (
                <option key={obj.class || `obj-${index}`} value={obj.class}>
                  {obj.class} ({obj.count} images)
                </option>
              ))}
            </datalist>
            <button
              className="ai-button ai-button--primary"
              onClick={handleSearch}
              disabled={loading || !objectQuery.trim()}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          {detectedObjects.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Detected objects in your photos:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {detectedObjects.slice(0, 20).map(obj => (
                  <button
                    key={obj.class}
                    onClick={() => setObjectQuery(obj.class)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      background: objectQuery === obj.class ? '#3b82f6' : '#f3f4f6',
                      color: objectQuery === obj.class ? '#fff' : '#374151',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                    }}
                  >
                    {obj.class} ({obj.count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <label className="form-group__label">Find photos of</label>
            <select
              className="ai-select"
              value={selectedContactId}
              onChange={e => {
                setSelectedContactId(e.target.value);
                setSelectedClusterId('');
              }}
            >
              <option value="">Select a contact...</option>
              {contacts.map((contact, index) => (
                <option key={contact.id || `contact-${index}`} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '1.5rem 0.5rem 0' }}>
            or
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-group__label">Face cluster</label>
            <select
              className="ai-select"
              value={selectedClusterId}
              onChange={e => {
                setSelectedClusterId(e.target.value);
                setSelectedContactId('');
              }}
            >
              <option value="">Select a cluster...</option>
              {labeledClusters.map((cluster, index) => (
                <option key={cluster.id || `cluster-${index}`} value={cluster.id}>
                  {cluster.name || `Cluster (${cluster.face_count} faces)`}
                </option>
              ))}
            </select>
          </div>
          <div style={{ paddingTop: '1.5rem' }}>
            <button
              className="ai-button ai-button--primary"
              onClick={handleSearch}
              disabled={loading || (!selectedContactId && !selectedClusterId)}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
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
