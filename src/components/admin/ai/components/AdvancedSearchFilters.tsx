/**
 * AdvancedSearchFilters Component
 * Collapsible filter panel for combined search
 */

import React from 'react';

export interface SearchFilterState {
  dateStart: string;
  dateEnd: string;
  people: string[];
  objectClasses: string[];
  mediaType: 'all' | 'photo' | 'video';
  descriptionQuery: string;
  textQuery: string;
  searchInSemantic: boolean;
  searchInDescriptions: boolean;
  searchInOcr: boolean;
}

interface Contact {
  id: string;
  name: string;
}

interface DetectedObjectClass {
  class: string;
  count: number;
}

interface Cluster {
  id: string;
  name?: string;
  contact_id?: string;
  face_count: number;
}

interface AdvancedSearchFiltersProps {
  filters: SearchFilterState;
  onChange: (filters: SearchFilterState) => void;
  contacts: Contact[];
  clusters: Cluster[];
  detectedObjects: DetectedObjectClass[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const AdvancedSearchFilters: React.FC<AdvancedSearchFiltersProps> = ({
  filters,
  onChange,
  contacts,
  clusters,
  detectedObjects,
  isExpanded,
  onToggleExpand,
}) => {
  const labeledClusters = clusters.filter(c => c.name || c.contact_id);

  const updateFilter = <K extends keyof SearchFilterState>(
    key: K,
    value: SearchFilterState[K]
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const togglePerson = (personId: string) => {
    const newPeople = filters.people.includes(personId)
      ? filters.people.filter(p => p !== personId)
      : [...filters.people, personId];
    updateFilter('people', newPeople);
  };

  const toggleObjectClass = (className: string) => {
    const newObjects = filters.objectClasses.includes(className)
      ? filters.objectClasses.filter(o => o !== className)
      : [...filters.objectClasses, className];
    updateFilter('objectClasses', newObjects);
  };

  const activeFiltersCount = [
    filters.dateStart || filters.dateEnd,
    filters.people.length > 0,
    filters.objectClasses.length > 0,
    filters.mediaType !== 'all',
    filters.descriptionQuery,
    filters.textQuery,
  ].filter(Boolean).length;

  return (
    <div className="advanced-filters">
      <button
        className="advanced-filters__toggle"
        onClick={onToggleExpand}
        type="button"
      >
        <span>Filters</span>
        {activeFiltersCount > 0 && (
          <span className="advanced-filters__badge">{activeFiltersCount}</span>
        )}
        <svg
          className={`advanced-filters__chevron ${isExpanded ? 'expanded' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isExpanded && (
        <div className="advanced-filters__panel">
          {/* Date Range */}
          <div className="advanced-filters__section">
            <label className="advanced-filters__label">Date Range</label>
            <div className="advanced-filters__date-row">
              <input
                type="date"
                className="ai-input advanced-filters__date-input"
                value={filters.dateStart}
                onChange={e => updateFilter('dateStart', e.target.value)}
              />
              <span className="advanced-filters__date-separator">to</span>
              <input
                type="date"
                className="ai-input advanced-filters__date-input"
                value={filters.dateEnd}
                onChange={e => updateFilter('dateEnd', e.target.value)}
              />
            </div>
          </div>

          {/* People */}
          {(contacts.length > 0 || labeledClusters.length > 0) && (
            <div className="advanced-filters__section">
              <label className="advanced-filters__label">People</label>
              <div className="advanced-filters__tags">
                {contacts.map(contact => (
                  <button
                    key={contact.id}
                    type="button"
                    className={`advanced-filters__tag ${
                      filters.people.includes(contact.id) ? 'active' : ''
                    }`}
                    onClick={() => togglePerson(contact.id)}
                  >
                    {contact.name}
                  </button>
                ))}
                {labeledClusters.map(cluster => (
                  <button
                    key={cluster.id}
                    type="button"
                    className={`advanced-filters__tag ${
                      filters.people.includes(cluster.id) ? 'active' : ''
                    }`}
                    onClick={() => togglePerson(cluster.id)}
                  >
                    {cluster.name || `Cluster (${cluster.face_count})`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Objects */}
          {detectedObjects.length > 0 && (
            <div className="advanced-filters__section">
              <label className="advanced-filters__label">Objects</label>
              <div className="advanced-filters__tags">
                {detectedObjects.slice(0, 15).map(obj => (
                  <button
                    key={obj.class}
                    type="button"
                    className={`advanced-filters__tag ${
                      filters.objectClasses.includes(obj.class) ? 'active' : ''
                    }`}
                    onClick={() => toggleObjectClass(obj.class)}
                  >
                    {obj.class} ({obj.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Media Type */}
          <div className="advanced-filters__section">
            <label className="advanced-filters__label">Media Type</label>
            <div className="advanced-filters__radio-group">
              {(['all', 'photo', 'video'] as const).map(type => (
                <label key={type} className="advanced-filters__radio">
                  <input
                    type="radio"
                    name="mediaType"
                    checked={filters.mediaType === type}
                    onChange={() => updateFilter('mediaType', type)}
                  />
                  <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Search In */}
          <div className="advanced-filters__section">
            <label className="advanced-filters__label">Search In</label>
            <div className="advanced-filters__checkbox-group">
              <label className="advanced-filters__checkbox">
                <input
                  type="checkbox"
                  checked={filters.searchInSemantic}
                  onChange={e => updateFilter('searchInSemantic', e.target.checked)}
                />
                <span>Semantic</span>
              </label>
              <label className="advanced-filters__checkbox">
                <input
                  type="checkbox"
                  checked={filters.searchInDescriptions}
                  onChange={e => updateFilter('searchInDescriptions', e.target.checked)}
                />
                <span>Descriptions</span>
              </label>
              <label className="advanced-filters__checkbox">
                <input
                  type="checkbox"
                  checked={filters.searchInOcr}
                  onChange={e => updateFilter('searchInOcr', e.target.checked)}
                />
                <span>OCR Text</span>
              </label>
            </div>
          </div>

          {/* Description Query (optional direct filter) */}
          {filters.searchInDescriptions && (
            <div className="advanced-filters__section">
              <label className="advanced-filters__label">Description Contains</label>
              <input
                type="text"
                className="ai-input"
                placeholder="Filter by description text..."
                value={filters.descriptionQuery}
                onChange={e => updateFilter('descriptionQuery', e.target.value)}
              />
            </div>
          )}

          {/* OCR Text Query (optional direct filter) */}
          {filters.searchInOcr && (
            <div className="advanced-filters__section">
              <label className="advanced-filters__label">OCR Text Contains</label>
              <input
                type="text"
                className="ai-input"
                placeholder="Filter by extracted text..."
                value={filters.textQuery}
                onChange={e => updateFilter('textQuery', e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const getDefaultFilters = (): SearchFilterState => ({
  dateStart: '',
  dateEnd: '',
  people: [],
  objectClasses: [],
  mediaType: 'all',
  descriptionQuery: '',
  textQuery: '',
  searchInSemantic: true,
  searchInDescriptions: false,
  searchInOcr: false,
});
