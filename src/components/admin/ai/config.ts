/**
 * AI Processing Configuration
 * Centralized config for future extensibility
 */

import type { ProcessingOperation } from '../../../types/ai';

export interface OperationConfig {
  id: ProcessingOperation;
  label: string;
  description: string;
  icon: string;
}

export const AI_CONFIG = {
  // Available processing operations
  operations: [
    { id: 'embedding', label: 'Embeddings', description: 'Semantic vectors for search', icon: '🔗' },
    { id: 'faces', label: 'Faces', description: 'Detect and recognize faces', icon: '👤' },
    { id: 'objects', label: 'Objects', description: 'Identify objects (YOLO)', icon: '📦' },
    { id: 'ocr', label: 'OCR', description: 'Extract text from images', icon: '📝' },
    { id: 'describe', label: 'Description', description: 'AI-generated captions', icon: '💬' },
  ] as OperationConfig[],

  // Default selections for new processing
  defaultOperations: ['embedding', 'faces', 'objects'] as ProcessingOperation[],

  // Polling intervals (ms)
  jobPollInterval: 5000,
  healthCheckInterval: 30000,

  // Thresholds (configurable for tuning)
  thresholds: {
    faceMatch: 0.6,
    searchSimilarity: 0.5,
    objectConfidence: 0.5,
    clusteringMin: 2,
  },

  // Batch processing limits
  batch: {
    quickModeMax: 50,
    chunkSize: 100,
  },

  // Tab configuration
  tabs: [
    { id: 'single', label: 'Single Test', icon: '🖼️' },
    { id: 'album', label: 'Album Processing', icon: '📁' },
    { id: 'faces', label: 'Face Clusters', icon: '👥' },
    { id: 'tag-sync', label: 'Tag Sync', icon: '🏷️' },
    { id: 'search', label: 'Search Test', icon: '🔍' },
    { id: 'activity', label: 'Activity', icon: '📊' },
    { id: 'upload-queue', label: 'Upload Queue', icon: '📤' },
    { id: 'reindex', label: 'Reindex', icon: '🔄' },
  ],

  // Status badge colors
  statusColors: {
    pending: { bg: 'bg-gray-100', text: 'text-gray-700' },
    processing: { bg: 'bg-blue-100', text: 'text-blue-700' },
    completed: { bg: 'bg-green-100', text: 'text-green-700' },
    failed: { bg: 'bg-red-100', text: 'text-red-700' },
  },
} as const;

export type TabId = typeof AI_CONFIG.tabs[number]['id'];
export type StatusType = keyof typeof AI_CONFIG.statusColors;
