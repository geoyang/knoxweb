/**
 * AIProcessingManager Component
 * Main container for AI processing features
 */

import React, { useState } from 'react';
import { AI_CONFIG, TabId } from './config';
import { useAIApi } from './hooks';
import { SingleImageTab } from './SingleImageTab';
import { AlbumProcessingTab } from './AlbumProcessingTab';
import { FaceClustersTab } from './FaceClustersTab';
import { SearchTab } from './SearchTab';
import { ReindexTab } from './ReindexTab';
import './ai-processing.css';

const TAB_COMPONENTS: Record<TabId, React.FC> = {
  single: SingleImageTab,
  album: AlbumProcessingTab,
  faces: FaceClustersTab,
  search: SearchTab,
  reindex: ReindexTab,
};

export const AIProcessingManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('single');
  const { connected, health, loading } = useAIApi();

  const ActiveTabComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="ai-processing">
      {/* Header */}
      <div className="ai-processing__header">
        <h2 className="ai-processing__title">AI Processing</h2>

        {/* Connection Status */}
        <div className={`ai-status ${
          loading ? '' : connected ? 'ai-status--connected' : 'ai-status--disconnected'
        }`}>
          <span className="ai-status__dot" />
          {loading ? 'Connecting...' : connected ? (
            <>
              Connected
              {health?.device && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                  ({health.device})
                </span>
              )}
            </>
          ) : (
            'Disconnected'
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="ai-processing__tabs">
        {AI_CONFIG.tabs.map(tab => (
          <button
            key={tab.id}
            className={`ai-processing__tab ${activeTab === tab.id ? 'ai-processing__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id as TabId)}
          >
            <span style={{ marginRight: '0.5rem' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ai-processing__content">
        {!connected && !loading ? (
          <div className="ai-error">
            <strong>AI API not connected</strong>
            <p style={{ marginTop: '0.5rem' }}>
              Make sure the Kizu-AI service is running at{' '}
              {import.meta.env.VITE_AI_API_URL || 'http://localhost:8000'}
            </p>
          </div>
        ) : (
          <ActiveTabComponent />
        )}
      </div>
    </div>
  );
};
