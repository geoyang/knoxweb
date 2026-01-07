/**
 * ProgressBar Component
 * Reusable progress bar with label
 */

import React from 'react';

interface ProgressBarProps {
  progress: number;
  processed?: number;
  total?: number;
  label?: string;
  showPercent?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  processed,
  total,
  label,
  showPercent = true,
}) => {
  const percent = Math.min(100, Math.max(0, progress));

  return (
    <div className="progress-bar">
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="progress-bar__label">
        <span>
          {label || (processed !== undefined && total !== undefined
            ? `${processed} / ${total}`
            : '')}
        </span>
        {showPercent && <span>{Math.round(percent)}%</span>}
      </div>
    </div>
  );
};
