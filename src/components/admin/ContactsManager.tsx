import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  contactsApi,
  Contact,
  ContactInput,
  RELATIONSHIP_TYPES,
  RELATIONSHIP_COLORS,
  MessagingApp,
} from '../../services/contactsApi';

export const ContactsManager: React.FC = () => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ContactInput>({
    first_name: '',
    last_name: '',
    display_name: '',
    phone_numbers: [],
    email_addresses: [],
    instagram_handle: '',
    facebook_handle: '',
    twitter_handle: '',
    linkedin_handle: '',
    messaging_apps: [],
    relationship_type: '',
    notes: '',
  });

  const loadContacts = useCallback(async (search?: string) => {
    try {
      setLoading(true);
      setError(null);
      const { contacts: data } = await contactsApi.getContacts(search, 1, 500);
      setContacts(data);
    } catch (err) {
      console.error('Error loading contacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadContacts();
    }
  }, [user?.id, loadContacts]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    loadContacts(query || undefined);
  }, [loadContacts]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setShowEditForm(false);
    setShowCreateForm(false);
  };

  const handleCreateNew = () => {
    setSelectedContact(null);
    setFormData({
      first_name: '',
      last_name: '',
      display_name: '',
      phone_numbers: [],
      email_addresses: [],
      instagram_handle: '',
      facebook_handle: '',
      twitter_handle: '',
      linkedin_handle: '',
      messaging_apps: [],
      relationship_type: '',
      notes: '',
    });
    setShowCreateForm(true);
    setShowEditForm(false);
  };

  const handleEdit = () => {
    if (!selectedContact) return;
    setFormData({
      first_name: selectedContact.first_name || '',
      last_name: selectedContact.last_name || '',
      display_name: selectedContact.display_name || '',
      phone_numbers: selectedContact.phone_numbers || [],
      email_addresses: selectedContact.email_addresses || [],
      instagram_handle: selectedContact.instagram_handle || '',
      facebook_handle: selectedContact.facebook_handle || '',
      twitter_handle: selectedContact.twitter_handle || '',
      linkedin_handle: selectedContact.linkedin_handle || '',
      messaging_apps: selectedContact.messaging_apps || [],
      relationship_type: selectedContact.relationship_type || '',
      notes: selectedContact.notes || '',
    });
    setShowEditForm(true);
    setShowCreateForm(false);
  };

  const handleDelete = async () => {
    if (!selectedContact) return;
    if (!confirm(`Are you sure you want to delete ${selectedContact.display_name || 'this contact'}?`)) {
      return;
    }

    try {
      const success = await contactsApi.deleteContact(selectedContact.id);
      if (success) {
        setSelectedContact(null);
        loadContacts(searchQuery || undefined);
      } else {
        setError('Failed to delete contact');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete contact');
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const input: ContactInput = {
        ...formData,
        display_name: formData.display_name || `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || undefined,
      };

      let result: Contact | null;
      if (showEditForm && selectedContact) {
        result = await contactsApi.updateContact(selectedContact.id, input);
      } else {
        result = await contactsApi.createContact(input);
      }

      if (result) {
        setSelectedContact(result);
        setShowCreateForm(false);
        setShowEditForm(false);
        loadContacts(searchQuery || undefined);
      } else {
        setError('Failed to save contact');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelForm = () => {
    setShowCreateForm(false);
    setShowEditForm(false);
  };

  const addMessagingApp = () => {
    setFormData(prev => ({
      ...prev,
      messaging_apps: [...(prev.messaging_apps || []), { platform: '', handle: '' }],
    }));
  };

  const updateMessagingApp = (index: number, field: keyof MessagingApp, value: string) => {
    setFormData(prev => {
      const apps = [...(prev.messaging_apps || [])];
      apps[index] = { ...apps[index], [field]: value };
      return { ...prev, messaging_apps: apps };
    });
  };

  const removeMessagingApp = (index: number) => {
    setFormData(prev => ({
      ...prev,
      messaging_apps: (prev.messaging_apps || []).filter((_, i) => i !== index),
    }));
  };

  // Group contacts alphabetically
  const groupedContacts = contacts.reduce((groups, contact) => {
    const name = contact.display_name || contact.first_name || contact.last_name || '#';
    const letter = name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : '#';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(contact);
    return groups;
  }, {} as Record<string, Contact[]>);

  const sortedLetters = Object.keys(groupedContacts).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  const getDisplayName = (contact: Contact) =>
    contact.display_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';

  if (loading && contacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Contacts List */}
      <div className="w-80 border-r bg-white flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
            <button
              onClick={handleCreateNew}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
            >
              + New
            </button>
          </div>
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">No contacts yet</p>
              <p className="text-xs mt-1">Import contacts from the mobile app</p>
            </div>
          ) : (
            sortedLetters.map(letter => (
              <div key={letter}>
                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 sticky top-0">
                  {letter}
                </div>
                {groupedContacts[letter].map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => handleSelectContact(contact)}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                      selectedContact?.id === contact.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    {contact.avatar_url ? (
                      <img
                        src={contact.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-medium">
                          {getDisplayName(contact).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">
                          {getDisplayName(contact)}
                        </span>
                        {contact.linked_profile_id && (
                          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      {contact.relationship_type && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: RELATIONSHIP_COLORS[contact.relationship_type] || '#6B7280' }}
                        >
                          {contact.relationship_type}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail/Form Panel */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
              &times;
            </button>
          </div>
        )}

        {(showCreateForm || showEditForm) ? (
          /* Edit/Create Form */
          <form onSubmit={handleSaveContact} className="p-6 max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                {showEditForm ? 'Edit Contact' : 'New Contact'}
              </h2>
              <button
                type="button"
                onClick={handleCancelForm}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={formData.first_name || ''}
                      onChange={e => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={formData.last_name || ''}
                      onChange={e => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={formData.display_name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder="Optional - defaults to first + last name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                  <div className="flex flex-wrap gap-2">
                    {RELATIONSHIP_TYPES.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          relationship_type: prev.relationship_type === type ? '' : type
                        }))}
                        className={`px-3 py-1.5 rounded-full text-sm capitalize transition-colors ${
                          formData.relationship_type === type
                            ? 'text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        style={formData.relationship_type === type ? { backgroundColor: RELATIONSHIP_COLORS[type] } : {}}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Social Media */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Social Media</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">@</span>
                      <input
                        type="text"
                        value={formData.instagram_handle || ''}
                        onChange={e => setFormData(prev => ({ ...prev, instagram_handle: e.target.value.replace('@', '') }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Facebook</label>
                    <input
                      type="text"
                      value={formData.facebook_handle || ''}
                      onChange={e => setFormData(prev => ({ ...prev, facebook_handle: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Twitter / X</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">@</span>
                      <input
                        type="text"
                        value={formData.twitter_handle || ''}
                        onChange={e => setFormData(prev => ({ ...prev, twitter_handle: e.target.value.replace('@', '') }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
                    <input
                      type="text"
                      value={formData.linkedin_handle || ''}
                      onChange={e => setFormData(prev => ({ ...prev, linkedin_handle: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Messaging Apps */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Messaging Apps</h3>
                  <button
                    type="button"
                    onClick={addMessagingApp}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    + Add
                  </button>
                </div>
                {(formData.messaging_apps || []).length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No messaging apps added</p>
                ) : (
                  <div className="space-y-3">
                    {(formData.messaging_apps || []).map((app, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Platform (e.g., WhatsApp)"
                          value={app.platform}
                          onChange={e => updateMessagingApp(index, 'platform', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          placeholder="Handle / Number"
                          value={app.handle}
                          onChange={e => updateMessagingApp(index, 'handle', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => removeMessagingApp(index)}
                          className="p-2 text-red-500 hover:text-red-700"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Notes</h3>
                <textarea
                  value={formData.notes || ''}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Add notes about this contact..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </div>
          </form>
        ) : selectedContact ? (
          /* Contact Detail View */
          <div className="p-6 max-w-2xl">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                {selectedContact.avatar_url ? (
                  <img
                    src={selectedContact.avatar_url}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-3xl text-blue-600 font-medium">
                      {getDisplayName(selectedContact).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">
                    {getDisplayName(selectedContact)}
                  </h2>
                  {selectedContact.relationship_type && (
                    <span
                      className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs text-white capitalize"
                      style={{ backgroundColor: RELATIONSHIP_COLORS[selectedContact.relationship_type] || '#6B7280' }}
                    >
                      {selectedContact.relationship_type}
                    </span>
                  )}
                  {selectedContact.linked_profile && (
                    <div className="flex items-center gap-1 mt-2 text-green-600 text-sm">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Connected on Knox
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Phone Numbers */}
            {selectedContact.phone_numbers && selectedContact.phone_numbers.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Phone</h3>
                {selectedContact.phone_numbers.map((phone, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 capitalize">{phone.type || 'Phone'}</div>
                      <div className="text-gray-900">{phone.number}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Email Addresses */}
            {selectedContact.email_addresses && selectedContact.email_addresses.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Email</h3>
                {selectedContact.email_addresses.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 capitalize">{email.type || 'Email'}</div>
                      <div className="text-gray-900">{email.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Social Media */}
            {(selectedContact.instagram_handle || selectedContact.facebook_handle ||
              selectedContact.twitter_handle || selectedContact.linkedin_handle) && (
              <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Social Media</h3>
                <div className="space-y-2">
                  {selectedContact.instagram_handle && (
                    <a href={`https://instagram.com/${selectedContact.instagram_handle}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded">
                      <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center">
                        <span className="text-pink-600 font-bold text-xs">IG</span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Instagram</div>
                        <div className="text-gray-900">@{selectedContact.instagram_handle}</div>
                      </div>
                    </a>
                  )}
                  {selectedContact.facebook_handle && (
                    <a href={`https://facebook.com/${selectedContact.facebook_handle}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-xs">FB</span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Facebook</div>
                        <div className="text-gray-900">{selectedContact.facebook_handle}</div>
                      </div>
                    </a>
                  )}
                  {selectedContact.twitter_handle && (
                    <a href={`https://twitter.com/${selectedContact.twitter_handle}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded">
                      <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
                        <span className="text-sky-600 font-bold text-xs">X</span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Twitter / X</div>
                        <div className="text-gray-900">@{selectedContact.twitter_handle}</div>
                      </div>
                    </a>
                  )}
                  {selectedContact.linkedin_handle && (
                    <a href={`https://linkedin.com/in/${selectedContact.linkedin_handle}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-700 font-bold text-xs">in</span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">LinkedIn</div>
                        <div className="text-gray-900">{selectedContact.linkedin_handle}</div>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Messaging Apps */}
            {selectedContact.messaging_apps && selectedContact.messaging_apps.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Messaging</h3>
                <div className="space-y-2">
                  {selectedContact.messaging_apps.map((app, idx) => (
                    <div key={idx} className="flex items-center gap-3 py-2">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">{app.platform}</div>
                        <div className="text-gray-900">{app.handle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedContact.notes && (
              <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Notes</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedContact.notes}</p>
              </div>
            )}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-lg font-medium">Select a contact</p>
            <p className="text-sm">or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
};
