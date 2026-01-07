/**
 * ContactAssignModal Component
 * Modal for assigning a face cluster to a Knox contact
 */

import React, { useState } from 'react';

interface Contact {
  id: string;
  name: string;
}

interface ContactAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (contactId: string, name?: string) => void;
  contacts: Contact[];
  loading?: boolean;
  clusterId?: string;
}

export const ContactAssignModal: React.FC<ContactAssignModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  contacts,
  loading = false,
}) => {
  const [selectedContactId, setSelectedContactId] = useState('');
  const [customName, setCustomName] = useState('');
  const [mode, setMode] = useState<'contact' | 'custom'>('contact');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'contact' && selectedContactId) {
      // Find the contact name to pass along
      const selectedContact = contacts.find(c => c.id === selectedContactId);
      onAssign(selectedContactId, selectedContact?.name);
    } else if (mode === 'custom' && customName.trim()) {
      onAssign('', customName.trim());
    }
  };

  return (
    <div className="ai-modal">
      <div className="ai-modal__overlay" onClick={onClose} />
      <div className="ai-modal__content">
        <div className="ai-modal__header">
          <h3 className="ai-modal__title">Assign to Contact</h3>
          <button className="ai-modal__close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ai-modal__body">
            {/* Mode toggle */}
            <div className="mode-toggle" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className={`mode-toggle__option ${mode === 'contact' ? 'mode-toggle__option--active' : ''}`}
                onClick={() => setMode('contact')}
              >
                Existing Contact
              </button>
              <button
                type="button"
                className={`mode-toggle__option ${mode === 'custom' ? 'mode-toggle__option--active' : ''}`}
                onClick={() => setMode('custom')}
              >
                Custom Name
              </button>
            </div>

            {mode === 'contact' ? (
              <div className="form-group">
                <label className="form-group__label">Select Contact</label>
                <select
                  className="ai-select"
                  value={selectedContactId}
                  onChange={e => setSelectedContactId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Choose a contact...</option>
                  {contacts.map(contact => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-group__label">Name</label>
                <input
                  type="text"
                  className="ai-input"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Enter name for this person"
                  disabled={loading}
                />
                <p className="form-group__help">
                  This will label the cluster without linking to a contact
                </p>
              </div>
            )}
          </div>

          <div className="ai-modal__footer">
            <button
              type="button"
              className="ai-button ai-button--secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ai-button ai-button--primary"
              disabled={loading || (mode === 'contact' ? !selectedContactId : !customName.trim())}
            >
              {loading ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
