/**
 * ReindexTab Component
 * Batch reindex all assets with AI processing
 */

import React, { useState, useEffect, useRef } from 'react';
import { aiApi } from '../../../services/aiApi';
import { getSupabaseUrl, getSupabaseAnonKey } from '../../../lib/environments';

interface ReindexStats {
  totalAssets: number;
  processedAssets: number;
  currentOffset: number;
  errors: number;
  isRunning: boolean;
  lastMessage: string;
}

export const ReindexTab: React.FC = () => {
  const [stats, setStats] = useState<ReindexStats>({
    totalAssets: 0,
    processedAssets: 0,
    currentOffset: 0,
    errors: 0,
    isRunning: false,
    lastMessage: '',
  });
  const [batchSize, setBatchSize] = useState(10);
  const [logs, setLogs] = useState<string[]>([]);
  const abortRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Get total asset count on mount
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const response = await fetch(
          `${getSupabaseUrl()}/rest/v1/assets?select=id`,
          {
            headers: {
              'apikey': getSupabaseAnonKey(),
              'Prefer': 'count=exact',
              'Range': '0-0',
            },
          }
        );
        const range = response.headers.get('content-range');
        if (range) {
          const total = parseInt(range.split('/')[1], 10);
          setStats(s => ({ ...s, totalAssets: total }));
        }
      } catch (e) {
        console.error('Failed to get asset count:', e);
      }
    };
    fetchCount();
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-100), `[${timestamp}] ${message}`]);
  };

  const startReindex = async () => {
    abortRef.current = false;
    setStats(s => ({ ...s, isRunning: true, processedAssets: 0, currentOffset: 0, errors: 0 }));
    setLogs([]);
    addLog('Starting reindex...');

    let offset = 0;
    let totalProcessed = 0;
    let totalErrors = 0;

    while (!abortRef.current) {
      try {
        addLog(`Processing batch at offset ${offset}...`);

        const result = await aiApi.reindex(batchSize, offset);

        if (!result.success) {
          addLog(`Error: ${result.error}`);
          totalErrors++;
          break;
        }

        const data = result.data as {
          status: string;
          processed: number;
          errors: number;
          next_offset: number;
          message: string;
        };

        addLog(data.message);
        totalProcessed += data.processed || 0;
        totalErrors += data.errors || 0;

        setStats(s => ({
          ...s,
          processedAssets: totalProcessed,
          currentOffset: offset,
          errors: totalErrors,
          lastMessage: data.message,
        }));

        if (data.status === 'complete') {
          addLog('Reindex complete!');
          break;
        }

        offset = data.next_offset || offset + batchSize;

        // Small delay between batches
        await new Promise(r => setTimeout(r, 500));

      } catch (e) {
        addLog(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
        totalErrors++;
        break;
      }
    }

    if (abortRef.current) {
      addLog('Reindex stopped by user');
    }

    setStats(s => ({ ...s, isRunning: false }));
  };

  const stopReindex = () => {
    abortRef.current = true;
    addLog('Stopping...');
  };

  const progress = stats.totalAssets > 0
    ? Math.round((stats.currentOffset / stats.totalAssets) * 100)
    : 0;

  return (
    <div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
        Reindex All Assets
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Process all assets with AI to generate embeddings, detect objects, and recognize faces.
        This is useful after clearing AI data or to reprocess with updated models.
      </p>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div className="ai-card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>
            {stats.totalAssets.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total Assets</div>
        </div>
        <div className="ai-card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
            {stats.processedAssets.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Processed</div>
        </div>
        <div className="ai-card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
            {stats.currentOffset.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Current Offset</div>
        </div>
        <div className="ai-card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>
            {stats.errors}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Errors</div>
        </div>
      </div>

      {/* Progress bar */}
      {stats.isRunning && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            height: '0.5rem',
            backgroundColor: '#e5e7eb',
            borderRadius: '0.25rem',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: '#3b82f6',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {progress}% complete
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <label style={{ fontSize: '0.875rem', color: '#374151', marginRight: '0.5rem' }}>
            Batch Size:
          </label>
          <select
            className="ai-select"
            value={batchSize}
            onChange={e => setBatchSize(Number(e.target.value))}
            disabled={stats.isRunning}
            style={{ width: '100px' }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {!stats.isRunning ? (
          <button
            className="ai-button ai-button--primary"
            onClick={startReindex}
          >
            Start Reindex
          </button>
        ) : (
          <button
            className="ai-button ai-button--danger"
            onClick={stopReindex}
          >
            Stop
          </button>
        )}
      </div>

      {/* Logs */}
      <div style={{
        backgroundColor: '#1f2937',
        borderRadius: '0.5rem',
        padding: '1rem',
        maxHeight: '300px',
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        color: '#d1d5db'
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#6b7280' }}>Logs will appear here...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ marginBottom: '0.25rem' }}>{log}</div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};
