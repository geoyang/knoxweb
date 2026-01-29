/**
 * ProcessAllTab Component
 * Queue entire unprocessed image collection to the AI worker in batches of 100.
 * The worker processes each asset individually — progress is visible
 * in the Upload Queue tab in real time.
 */

import React, { useState, useEffect, useRef } from 'react';
import { aiApi } from '../../../services/aiApi';

export const ProcessAllTab: React.FC = () => {
  const [totalUnprocessed, setTotalUnprocessed] = useState<number | null>(null);
  const [totalQueued, setTotalQueued] = useState(0);
  const [totalSkipped, setTotalSkipped] = useState(0);
  const [batchNumber, setBatchNumber] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isQueuing, setIsQueuing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [batchSize, setBatchSize] = useState(100);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    fetchUnprocessedCount();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-200), `[${timestamp}] ${message}`]);
  };

  const fetchUnprocessedCount = async () => {
    const result = await aiApi.getUnprocessedCount();
    if (result.success && result.data) {
      setTotalUnprocessed(result.data.total_unprocessed);
    }
  };

  const startQueuing = async () => {
    abortRef.current = false;
    setIsQueuing(true);
    setIsPaused(false);
    setIsComplete(false);
    setTotalQueued(0);
    setTotalSkipped(0);
    setBatchNumber(0);
    setOffset(0);
    setLogs([]);

    await fetchUnprocessedCount();
    addLog('Queuing unprocessed assets to the AI worker...');
    await runQueueBatch(0, 1);
  };

  const continueQueuing = async () => {
    abortRef.current = false;
    setIsPaused(false);
    setIsQueuing(true);
    await runQueueBatch(offset, batchNumber + 1);
  };

  const runQueueBatch = async (
    currentOffset: number,
    currentBatch: number
  ) => {
    setBatchNumber(currentBatch);
    addLog(`Queuing batch ${currentBatch} (offset ${currentOffset})...`);

    const result = await aiApi.queueAllBatch(batchSize, currentOffset);

    if (!result.success) {
      addLog(`Error: ${result.error}`);
      setIsQueuing(false);
      setIsPaused(true);
      return;
    }

    const data = result.data!;

    setTotalQueued(prev => prev + data.queued);
    setTotalSkipped(prev => prev + data.skipped);
    setOffset(data.next_offset);

    addLog(data.message);

    if (data.done || data.total_remaining === 0) {
      setIsComplete(true);
      setIsQueuing(false);
      setIsPaused(false);
      addLog('All unprocessed assets have been queued.');
      addLog('Switch to the Upload Queue tab to see per-asset progress.');
      await fetchUnprocessedCount();
      return;
    }

    if (abortRef.current) {
      setIsQueuing(false);
      setIsPaused(false);
      addLog('Queuing stopped by user.');
      return;
    }

    setIsQueuing(false);
    setIsPaused(true);
    addLog(
      `Batch ${currentBatch} queued. ` +
      `Click "Continue" to queue next ${batchSize}, ` +
      `or switch to Upload Queue to watch progress.`
    );
  };

  const stopQueuing = () => {
    abortRef.current = true;
    setIsQueuing(false);
    setIsPaused(false);
    addLog('Queuing stopped. Already-queued assets will still be processed.');
  };

  const reset = () => {
    abortRef.current = true;
    setTotalQueued(0);
    setTotalSkipped(0);
    setBatchNumber(0);
    setOffset(0);
    setIsQueuing(false);
    setIsPaused(false);
    setIsComplete(false);
    setLogs([]);
    fetchUnprocessedCount();
  };

  const startTotal = totalUnprocessed !== null
    ? totalUnprocessed + totalQueued
    : 0;
  const progress = startTotal > 0
    ? Math.round((totalQueued / startTotal) * 100)
    : 0;

  return (
    <div>
      <h3 style={styles.heading}>
        Process All Unprocessed Assets
      </h3>
      <p style={styles.description}>
        Queue your entire unprocessed collection to the AI worker in batches.
        Each asset is processed individually — switch to the{' '}
        <strong>Upload Queue</strong> tab to see per-asset progress in real time.
      </p>

      {/* Stats */}
      <div style={styles.statsGrid}>
        <StatCard
          value={totalUnprocessed !== null ? totalUnprocessed.toLocaleString() : '...'}
          label="Unprocessed"
          color="#3b82f6"
        />
        <StatCard
          value={totalQueued.toLocaleString()}
          label="Queued"
          color="#10b981"
        />
        <StatCard
          value={totalSkipped.toString()}
          label="Skipped (dupes)"
          color="#f59e0b"
        />
        <StatCard
          value={batchNumber.toString()}
          label="Batches"
          color="#8b5cf6"
        />
      </div>

      {/* Progress bar */}
      {(isQueuing || isPaused || isComplete) && startTotal > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={styles.progressTrack}>
            <div style={{
              ...styles.progressBar,
              width: `${progress}%`,
              backgroundColor: isComplete ? '#10b981' : '#3b82f6',
            }} />
          </div>
          <div style={styles.progressLabel}>
            {progress}% queued
            {totalUnprocessed !== null &&
              ` — ${totalUnprocessed.toLocaleString()} still unprocessed`}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={styles.controls}>
        <div>
          <label style={styles.label}>Batch Size:</label>
          <select
            className="ai-select"
            value={batchSize}
            onChange={e => setBatchSize(Number(e.target.value))}
            disabled={isQueuing || isPaused}
            style={{ width: '100px' }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {!isQueuing && !isPaused && !isComplete && (
          <button
            className="ai-button ai-button--primary"
            onClick={startQueuing}
          >
            Start Queuing
          </button>
        )}

        {isQueuing && (
          <span style={{ fontSize: '0.875rem', color: '#3b82f6' }}>
            Queuing batch {batchNumber}...
          </span>
        )}

        {isPaused && (
          <>
            <button
              className="ai-button ai-button--primary"
              onClick={continueQueuing}
            >
              Continue Next {batchSize}
            </button>
            <button
              className="ai-button ai-button--danger"
              onClick={stopQueuing}
            >
              Stop
            </button>
          </>
        )}

        {isComplete && (
          <span style={styles.completeLabel}>
            All assets queued
          </span>
        )}

        {(isPaused || isComplete) && (
          <button
            className="ai-button"
            onClick={reset}
            style={{ marginLeft: 'auto' }}
          >
            Reset
          </button>
        )}

        <button
          className="ai-button ai-button--secondary"
          onClick={fetchUnprocessedCount}
          style={{ marginLeft: isPaused || isComplete ? '0' : 'auto' }}
        >
          Refresh Count
        </button>
      </div>

      {/* Logs */}
      <div style={styles.logsContainer}>
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

const StatCard: React.FC<{
  value: string;
  label: string;
  color: string;
}> = ({ value, label, color }) => (
  <div className="ai-card" style={{ padding: '1rem', textAlign: 'center' }}>
    <div style={{ fontSize: '1.5rem', fontWeight: '700', color }}>
      {value}
    </div>
    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</div>
  </div>
);

const styles = {
  heading: {
    fontSize: '1.125rem',
    fontWeight: '600' as const,
    marginBottom: '1rem',
  },
  description: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '1.5rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  progressTrack: {
    height: '0.5rem',
    backgroundColor: '#e5e7eb',
    borderRadius: '0.25rem',
    overflow: 'hidden' as const,
  },
  progressBar: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '0.75rem',
    color: '#6b7280',
    marginTop: '0.25rem',
  },
  controls: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  label: {
    fontSize: '0.875rem',
    color: '#374151',
    marginRight: '0.5rem',
  },
  completeLabel: {
    fontSize: '0.875rem',
    color: '#10b981',
    fontWeight: '600' as const,
  },
  logsContainer: {
    backgroundColor: '#1f2937',
    borderRadius: '0.5rem',
    padding: '1rem',
    maxHeight: '300px',
    overflow: 'auto' as const,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: '#d1d5db',
  },
};
