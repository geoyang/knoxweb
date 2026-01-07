/**
 * ProcessingResults Component
 * Displays AI processing results
 */

import React from 'react';
import type { ProcessingResult } from '../../../../types/ai';

interface ProcessingResultsProps {
  result: ProcessingResult | null;
  loading?: boolean;
}

export const ProcessingResults: React.FC<ProcessingResultsProps> = ({
  result,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="results-section">
        <div className="ai-empty">
          <div className="ai-spinner ai-spinner--large" />
          <p className="ai-empty__text">Processing image...</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="results-section">
      {/* Objects */}
      {result.objects && result.objects.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 className="results-section__title">Objects Detected ({result.objects.length})</h4>
          <div className="results-section__list">
            {result.objects.map((obj, i) => (
              <span key={i} className="results-item">
                {obj.class_name || obj.class}
                <span className="results-item__confidence">
                  {Math.round(obj.confidence * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Faces */}
      {result.faces && result.faces.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 className="results-section__title">Faces Detected ({result.faces.length})</h4>
          <div className="results-section__list">
            {result.faces.map((face, i) => (
              <span key={i} className="results-item">
                Face {i + 1}
                <span className="results-item__confidence">
                  {Math.round(face.confidence * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* OCR Text */}
      {result.text && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 className="results-section__title">Extracted Text</h4>
          <p style={{
            padding: '0.75rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            whiteSpace: 'pre-wrap',
          }}>
            {result.text}
          </p>
        </div>
      )}

      {/* Description */}
      {result.description && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 className="results-section__title">AI Description</h4>
          <p style={{
            padding: '0.75rem',
            backgroundColor: '#eff6ff',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontStyle: 'italic',
          }}>
            {result.description}
          </p>
        </div>
      )}

      {/* Embedding */}
      {result.embedding && (
        <div>
          <h4 className="results-section__title">Embedding</h4>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Generated {result.embedding.length}-dimensional vector
          </p>
        </div>
      )}

      {/* Processing time */}
      {result.processing_time_ms && (
        <p style={{
          marginTop: '1rem',
          fontSize: '0.75rem',
          color: '#9ca3af',
          textAlign: 'right',
        }}>
          Processed in {(result.processing_time_ms / 1000).toFixed(2)}s
        </p>
      )}
    </div>
  );
};
