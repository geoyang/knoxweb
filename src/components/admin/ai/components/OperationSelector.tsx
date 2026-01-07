/**
 * OperationSelector Component
 * Checkbox group for selecting AI operations
 */

import React from 'react';
import { AI_CONFIG } from '../config';
import type { ProcessingOperation } from '../../../../types/ai';

interface OperationSelectorProps {
  selected: ProcessingOperation[];
  onChange: (operations: ProcessingOperation[]) => void;
  disabled?: boolean;
}

export const OperationSelector: React.FC<OperationSelectorProps> = ({
  selected,
  onChange,
  disabled = false,
}) => {
  const handleToggle = (opId: ProcessingOperation) => {
    if (opId === 'all') {
      // Toggle all
      const allIds = AI_CONFIG.operations.map(o => o.id);
      const hasAll = allIds.every(id => selected.includes(id));
      onChange(hasAll ? [] : allIds);
    } else {
      // Toggle single
      const newSelected = selected.includes(opId)
        ? selected.filter(id => id !== opId)
        : [...selected, opId];
      onChange(newSelected);
    }
  };

  const allSelected = AI_CONFIG.operations.every(op => selected.includes(op.id));

  return (
    <div className="operation-selector">
      {/* All toggle */}
      <label className={`operation-selector__item ${allSelected ? 'operation-selector__item--selected' : ''}`}>
        <input
          type="checkbox"
          className="operation-selector__checkbox"
          checked={allSelected}
          onChange={() => handleToggle('all')}
          disabled={disabled}
        />
        <span className="operation-selector__label">All</span>
      </label>

      {/* Individual operations */}
      {AI_CONFIG.operations.map(op => (
        <label
          key={op.id}
          className={`operation-selector__item ${selected.includes(op.id) ? 'operation-selector__item--selected' : ''}`}
          title={op.description}
        >
          <input
            type="checkbox"
            className="operation-selector__checkbox"
            checked={selected.includes(op.id)}
            onChange={() => handleToggle(op.id)}
            disabled={disabled}
          />
          <span>{op.icon}</span>
          <span className="operation-selector__label">{op.label}</span>
        </label>
      ))}
    </div>
  );
};
