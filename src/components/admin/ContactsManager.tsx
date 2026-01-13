import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { contactsApi, Contact, ContactInput, RELATIONSHIP_TYPES, RELATIONSHIP_COLORS } from '../../services/contactsApi';
import { friendsApi } from '../../services/friendsApi';
import { chatApi } from '../../services/chatApi';
import { aiApi } from '../../services/aiApi';
import { supabase } from '../../lib/supabase';
import { NOTIFICATION_SOUNDS, getSoundById, SOUND_CATEGORIES } from '../../config/notificationSounds';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import {
  faMusic, faBolt, faGem, faTableCells, faKeyboard,
  faFilm, faPaperPlane, faFaceFrown, faHandBackFist,
  faJetFighter, faFaceMeh, faGhost, faCircleExclamation,
  faPlay, faPause, faVolumeHigh
} from '@fortawesome/free-solid-svg-icons';

// Add icons to library
library.add(
  faMusic, faBolt, faGem, faTableCells, faKeyboard,
  faFilm, faPaperPlane, faFaceFrown, faHandBackFist,
  faJetFighter, faFaceMeh, faGhost, faCircleExclamation,
  faPlay, faPause, faVolumeHigh
);

// Map FA 4.7 icon names (from config) to FA 6 icons
const iconMap: Record<string, any> = {
  'music': faMusic,
  'bolt': faBolt,
  'diamond': faGem,
  'th-large': faTableCells,
  'keyboard-o': faKeyboard,
  'film': faFilm,
  'snapchat-ghost': faGhost,
  'frown-o': faFaceFrown,
  'hand-rock-o': faHandBackFist,
  'fighter-jet': faJetFighter,
  'meh-o': faFaceMeh,
  'paper-plane': faPaperPlane,
  'exclamation-circle': faCircleExclamation,
};

const getIcon = (iconName: string) => iconMap[iconName] || faMusic;

export const ContactsManager: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
  const [contactImages, setContactImages] = useState<{ asset_id: string; thumbnail_url: string }[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<{
    isFriend: boolean;
    pendingRequest: { id: string; isIncoming: boolean } | null;
  } | null>(null);
  const [friendshipLoading, setFriendshipLoading] = useState(false);
  const [friendshipActionLoading, setFriendshipActionLoading] = useState(false);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [dmLoading, setDmLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sound playback functions
  const stopSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingSoundId(null);
  }, []);

  const playSound = useCallback((soundId: string) => {
    const sound = getSoundById(soundId);

    // If same sound is playing, stop it
    if (playingSoundId === soundId) {
      stopSound();
      return;
    }

    // Stop any currently playing sound
    stopSound();

    // Create and play new audio
    const audio = new Audio(`/sounds/${sound.filename}.wav`);
    audioRef.current = audio;
    setPlayingSoundId(soundId);

    audio.play().catch(err => {
      console.error('Error playing sound:', err);
      setPlayingSoundId(null);
    });

    audio.onended = () => {
      setPlayingSoundId(null);
      audioRef.current = null;
    };
  }, [playingSoundId, stopSound]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Form state
  const [formData, setFormData] = useState<ContactInput & { email?: string; phone?: string }>({
    first_name: '',
    last_name: '',
    display_name: '',
    relationship_type: '',
    instagram_handle: '',
    facebook_handle: '',
    twitter_handle: '',
    linkedin_handle: '',
    notes: '',
    notification_sound: 'default',
    email: '',
    phone: '',
  });

  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      loadContacts();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await contactsApi.getContacts(searchQuery || undefined, 1, 1000);
      setContacts(result.contacts);

      // Load friend IDs for contacts with linked profiles
      loadFriendIds(result.contacts);
    } catch (err) {
      console.error('Error loading contacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  // Load friend IDs from the friendships table
  const loadFriendIds = async (contactsList: Contact[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all friendships for the current user
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error loading friendships:', error);
        return;
      }

      // Create a Set of friend IDs
      const friendIdSet = new Set<string>(
        (friendships || []).map((f: { friend_id: string }) => f.friend_id)
      );
      setFriendIds(friendIdSet);
    } catch (err) {
      console.error('Error loading friend IDs:', err);
    }
  };

  // Handle DM button click
  const handleStartDM = async (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation(); // Prevent selecting the contact
    if (!contact.linked_profile_id) return;

    setDmLoading(contact.id);
    try {
      const result = await chatApi.createDM(contact.linked_profile_id);
      if (result.success && result.data?.conversation) {
        // Navigate to chat with this conversation
        navigate(`/admin?tab=chat&conversation=${result.data.conversation.id}`);
      } else {
        alert(result.error || 'Failed to create conversation');
      }
    } catch (err) {
      console.error('Error creating DM:', err);
      alert('Failed to start conversation');
    } finally {
      setDmLoading(null);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (user?.id) {
        loadContacts();
      }
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleSelectContact = async (contact: Contact) => {
    setSelectedContact(contact);
    setContactImages([]);
    setFriendshipStatus(null);

    // Load images for this contact
    setLoadingImages(true);
    try {
      const result = await aiApi.getContactImages(contact.id);
      if (result.success && result.data) {
        setContactImages(result.data.images || []);
      }
    } catch (err) {
      console.error('Failed to load contact images:', err);
    } finally {
      setLoadingImages(false);
    }

    // Check friendship status if contact has a linked profile
    if (contact.linked_profile?.id) {
      setFriendshipLoading(true);
      try {
        const result = await friendsApi.checkFriendship(contact.linked_profile.id);
        if (result.success && result.data) {
          setFriendshipStatus(result.data);
        }
      } catch (err) {
        console.error('Failed to check friendship status:', err);
      } finally {
        setFriendshipLoading(false);
      }
    }
  };

  const handleCreateNew = () => {
    setEditingContact(null);
    setFormData({
      first_name: '',
      last_name: '',
      display_name: '',
      relationship_type: '',
      instagram_handle: '',
      facebook_handle: '',
      twitter_handle: '',
      linkedin_handle: '',
      notes: '',
      notification_sound: 'default',
      email: '',
      phone: '',
    });
    setShowEditModal(true);
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    // Get primary email and phone from arrays
    const primaryEmail = contact.email_addresses?.[0]?.email || '';
    const primaryPhone = contact.phone_numbers?.[0]?.number || '';
    setFormData({
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      display_name: contact.display_name || '',
      relationship_type: contact.relationship_type || '',
      instagram_handle: contact.instagram_handle || '',
      facebook_handle: contact.facebook_handle || '',
      twitter_handle: contact.twitter_handle || '',
      linkedin_handle: contact.linkedin_handle || '',
      notes: contact.notes || '',
      notification_sound: contact.notification_sound || 'default',
      email: primaryEmail,
      phone: primaryPhone,
    });
    setShowEditModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build input - always include notification_sound
    const input: ContactInput = {};

    if (formData.first_name?.trim()) input.first_name = formData.first_name.trim();
    if (formData.last_name?.trim()) input.last_name = formData.last_name.trim();

    const displayName = formData.display_name?.trim() ||
      `${formData.first_name || ''} ${formData.last_name || ''}`.trim();
    if (displayName) input.display_name = displayName;

    if (formData.relationship_type) input.relationship_type = formData.relationship_type;
    if (formData.instagram_handle?.trim()) input.instagram_handle = formData.instagram_handle.trim().replace('@', '');
    if (formData.facebook_handle?.trim()) input.facebook_handle = formData.facebook_handle.trim();
    if (formData.twitter_handle?.trim()) input.twitter_handle = formData.twitter_handle.trim().replace('@', '');
    if (formData.linkedin_handle?.trim()) input.linkedin_handle = formData.linkedin_handle.trim();
    if (formData.notes?.trim()) input.notes = formData.notes.trim();

    // Add email addresses
    if (formData.email?.trim()) {
      input.email_addresses = [{ type: 'personal', email: formData.email.trim() }];
    }

    // Add phone numbers
    if (formData.phone?.trim()) {
      input.phone_numbers = [{ type: 'mobile', number: formData.phone.trim() }];
    }

    // Always include notification_sound - use null for default, otherwise the sound ID
    input.notification_sound = formData.notification_sound === 'default' ? null : formData.notification_sound;

    console.log('Saving contact with input:', JSON.stringify(input));
    console.log('notification_sound value:', input.notification_sound);

    if (!input.display_name && !input.first_name && !input.last_name) {
      alert('Please enter a name for the contact');
      return;
    }

    try {
      setSaving(true);
      let result: Contact | null;

      if (editingContact) {
        console.log('Updating contact ID:', editingContact.id);
        result = await contactsApi.updateContact(editingContact.id, input);
      } else {
        console.log('Creating new contact');
        result = await contactsApi.createContact(input);
      }

      console.log('API result:', result);
      console.log('Result notification_sound:', result?.notification_sound);

      if (result) {
        stopSound();
        setShowEditModal(false);
        await loadContacts();
        if (editingContact && selectedContact?.id === editingContact.id) {
          setSelectedContact(result);
        }
      } else {
        alert('Failed to save contact - no result returned');
      }
    } catch (err) {
      console.error('Error saving contact:', err);
      alert('Failed to save contact: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    if (!confirm(`Are you sure you want to delete ${contact.display_name || 'this contact'}?`)) {
      return;
    }

    try {
      const success = await contactsApi.deleteContact(contact.id);
      if (success) {
        await loadContacts();
        if (selectedContact?.id === contact.id) {
          setSelectedContact(null);
        }
      } else {
        alert('Failed to delete contact');
      }
    } catch (err) {
      console.error('Error deleting contact:', err);
      alert('Failed to delete contact');
    }
  };

  // Friendship action handlers
  const handleSendFriendRequest = async () => {
    if (!selectedContact?.linked_profile?.id) return;
    setFriendshipActionLoading(true);
    try {
      const result = await friendsApi.sendFriendRequest(selectedContact.linked_profile.id);
      if (result.success) {
        // Re-check friendship status
        const checkResult = await friendsApi.checkFriendship(selectedContact.linked_profile.id);
        if (checkResult.success && checkResult.data) {
          setFriendshipStatus(checkResult.data);
        }
      } else {
        alert(result.error || 'Failed to send friend request');
      }
    } catch (err) {
      console.error('Error sending friend request:', err);
      alert('Failed to send friend request');
    } finally {
      setFriendshipActionLoading(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!friendshipStatus?.pendingRequest?.id) return;
    setFriendshipActionLoading(true);
    try {
      const result = await friendsApi.acceptFriendRequest(friendshipStatus.pendingRequest.id);
      if (result.success) {
        setFriendshipStatus({ isFriend: true, pendingRequest: null });
      } else {
        alert(result.error || 'Failed to accept friend request');
      }
    } catch (err) {
      console.error('Error accepting friend request:', err);
      alert('Failed to accept friend request');
    } finally {
      setFriendshipActionLoading(false);
    }
  };

  const handleDeclineFriendRequest = async () => {
    if (!friendshipStatus?.pendingRequest?.id) return;
    setFriendshipActionLoading(true);
    try {
      const result = await friendsApi.declineFriendRequest(friendshipStatus.pendingRequest.id);
      if (result.success) {
        setFriendshipStatus({ isFriend: false, pendingRequest: null });
      } else {
        alert(result.error || 'Failed to decline friend request');
      }
    } catch (err) {
      console.error('Error declining friend request:', err);
      alert('Failed to decline friend request');
    } finally {
      setFriendshipActionLoading(false);
    }
  };

  const handleCancelFriendRequest = async () => {
    if (!friendshipStatus?.pendingRequest?.id) return;
    setFriendshipActionLoading(true);
    try {
      const result = await friendsApi.cancelFriendRequest(friendshipStatus.pendingRequest.id);
      if (result.success) {
        setFriendshipStatus({ isFriend: false, pendingRequest: null });
      } else {
        alert(result.error || 'Failed to cancel friend request');
      }
    } catch (err) {
      console.error('Error cancelling friend request:', err);
      alert('Failed to cancel friend request');
    } finally {
      setFriendshipActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!selectedContact?.linked_profile?.id) return;
    if (!confirm(`Are you sure you want to remove ${selectedContact.display_name || 'this contact'} as a friend?`)) {
      return;
    }
    setFriendshipActionLoading(true);
    try {
      const result = await friendsApi.unfriend(selectedContact.linked_profile.id);
      if (result.success) {
        setFriendshipStatus({ isFriend: false, pendingRequest: null });
      } else {
        alert(result.error || 'Failed to remove friend');
      }
    } catch (err) {
      console.error('Error removing friend:', err);
      alert('Failed to remove friend');
    } finally {
      setFriendshipActionLoading(false);
    }
  };

  const getRelationshipColor = (type: string | null) => {
    if (!type) return 'bg-gray-100 text-gray-800';
    const color = RELATIONSHIP_COLORS[type];
    if (color === '#8B5CF6') return 'bg-purple-100 text-purple-800';
    if (color === '#10B981') return 'bg-green-100 text-green-800';
    if (color === '#3B82F6') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getInitials = (contact: Contact) => {
    const name = contact.display_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Contacts</h2>
        <button
          onClick={handleCreateNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          Add Contact
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <svg
          className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contacts List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">Your Contacts ({contacts.length})</h3>
          </div>
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {contacts.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                {searchQuery ? 'No contacts match your search' : 'No contacts found. Add your first contact!'}
              </div>
            ) : (
              contacts.map(contact => (
                <div
                  key={contact.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedContact?.id === contact.id ? 'bg-primary-light border-l-4 border-primary' : ''
                  }`}
                  onClick={() => handleSelectContact(contact)}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      {contact.avatar_url ? (
                        <img
                          src={contact.avatar_url}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-blue-600 font-medium text-sm">
                          {getInitials(contact)}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {contact.display_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed'}
                        </h4>
                        {contact.relationship_type && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${getRelationshipColor(contact.relationship_type)}`}>
                            {contact.relationship_type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        {contact.linked_profile && contact.linked_profile_id && friendIds.has(contact.linked_profile_id) ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                            </svg>
                            Friend
                          </span>
                        ) : contact.linked_profile ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            On Kizu
                          </span>
                        ) : null}
                        {contact.notification_sound && contact.notification_sound !== 'default' && (
                          <span className="text-gray-400 flex items-center gap-1">
                            <FontAwesomeIcon icon={getIcon(getSoundById(contact.notification_sound).icon)} className="w-3 h-3" />
                            {getSoundById(contact.notification_sound).name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* DM Button for friends */}
                    {contact.linked_profile_id && friendIds.has(contact.linked_profile_id) && (
                      <button
                        onClick={(e) => handleStartDM(e, contact)}
                        disabled={dmLoading === contact.id}
                        className="flex-shrink-0 p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50"
                        title="Send message"
                      >
                        {dmLoading === contact.id ? (
                          <div className="w-5 h-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Contact Details */}
        <div className="bg-white rounded-lg shadow">
          {selectedContact ? (
            <>
              <div className="p-6 border-b">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                      {selectedContact.avatar_url ? (
                        <img
                          src={selectedContact.avatar_url}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-blue-600 font-bold text-xl">
                          {getInitials(selectedContact)}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">
                        {selectedContact.display_name || `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim()}
                      </h3>
                      {selectedContact.relationship_type && (
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${getRelationshipColor(selectedContact.relationship_type)}`}>
                          {selectedContact.relationship_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditContact(selectedContact)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteContact(selectedContact)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Linked Profile */}
                {selectedContact.linked_profile && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Kizu Profile</h4>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center">
                          {selectedContact.linked_profile.avatar_url ? (
                            <img
                              src={selectedContact.linked_profile.avatar_url}
                              alt=""
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-green-700 font-medium">
                              {(selectedContact.linked_profile.full_name || '?')[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-green-800">{selectedContact.linked_profile.full_name}</p>
                          <p className="text-sm text-green-600">{selectedContact.linked_profile.email}</p>
                        </div>
                        {/* Friendship Status Badge */}
                        {friendshipLoading ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                        ) : friendshipStatus?.isFriend ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Connected
                          </span>
                        ) : null}
                      </div>

                      {/* Friendship Actions */}
                      {!friendshipLoading && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {friendshipStatus?.isFriend ? (
                            // Already friends - show Remove Friend button
                            <button
                              onClick={handleRemoveFriend}
                              disabled={friendshipActionLoading}
                              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {friendshipActionLoading ? 'Removing...' : 'Remove Friend'}
                            </button>
                          ) : friendshipStatus?.pendingRequest?.isIncoming ? (
                            // Incoming request - show Accept/Decline buttons
                            <>
                              <button
                                onClick={handleAcceptFriendRequest}
                                disabled={friendshipActionLoading}
                                className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {friendshipActionLoading ? 'Accepting...' : 'Accept'}
                              </button>
                              <button
                                onClick={handleDeclineFriendRequest}
                                disabled={friendshipActionLoading}
                                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </>
                          ) : friendshipStatus?.pendingRequest ? (
                            // Outgoing request - show Cancel button
                            <button
                              onClick={handleCancelFriendRequest}
                              disabled={friendshipActionLoading}
                              className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {friendshipActionLoading ? 'Cancelling...' : 'Cancel Request'}
                            </button>
                          ) : (
                            // No relationship - show Friend Request button
                            <button
                              onClick={handleSendFriendRequest}
                              disabled={friendshipActionLoading}
                              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {friendshipActionLoading ? 'Sending...' : 'Friend Request'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notification Sound */}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Notification Sound</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => playSound(selectedContact.notification_sound || 'default')}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        playingSoundId === (selectedContact.notification_sound || 'default')
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}
                      title={playingSoundId === (selectedContact.notification_sound || 'default') ? 'Stop' : 'Preview sound'}
                    >
                      <FontAwesomeIcon
                        icon={playingSoundId === (selectedContact.notification_sound || 'default') ? faPause : faPlay}
                        className="text-sm"
                      />
                    </button>
                    <button
                      onClick={() => handleEditContact(selectedContact)}
                      className="flex-1 flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                    >
                      <FontAwesomeIcon icon={getIcon(getSoundById(selectedContact.notification_sound).icon)} className="text-2xl text-blue-500" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{getSoundById(selectedContact.notification_sound).name}</p>
                        <p className="text-sm text-gray-500">{getSoundById(selectedContact.notification_sound).description}</p>
                      </div>
                      <span className="text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>

                {/* Social Media */}
                {(selectedContact.instagram_handle || selectedContact.facebook_handle || selectedContact.twitter_handle || selectedContact.linkedin_handle) && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Social Media</h4>
                    <div className="space-y-2">
                      {selectedContact.instagram_handle && (
                        <a
                          href={`https://instagram.com/${selectedContact.instagram_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <span className="w-5 h-5 bg-gradient-to-br from-purple-600 to-pink-500 rounded text-white text-xs flex items-center justify-center">IG</span>
                          @{selectedContact.instagram_handle}
                        </a>
                      )}
                      {selectedContact.twitter_handle && (
                        <a
                          href={`https://twitter.com/${selectedContact.twitter_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <span className="w-5 h-5 bg-black rounded text-white text-xs flex items-center justify-center">X</span>
                          @{selectedContact.twitter_handle}
                        </a>
                      )}
                      {selectedContact.facebook_handle && (
                        <a
                          href={`https://facebook.com/${selectedContact.facebook_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <span className="w-5 h-5 bg-blue-600 rounded text-white text-xs flex items-center justify-center">f</span>
                          {selectedContact.facebook_handle}
                        </a>
                      )}
                      {selectedContact.linkedin_handle && (
                        <a
                          href={`https://linkedin.com/in/${selectedContact.linkedin_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <span className="w-5 h-5 bg-blue-700 rounded text-white text-xs flex items-center justify-center">in</span>
                          {selectedContact.linkedin_handle}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Phone Numbers */}
                {selectedContact.phone_numbers && selectedContact.phone_numbers.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Phone Numbers</h4>
                    <div className="space-y-2">
                      {selectedContact.phone_numbers.map((phone, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 capitalize">{phone.type}:</span>
                          <a href={`tel:${phone.number}`} className="text-blue-600 hover:underline">
                            {phone.number}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email Addresses */}
                {selectedContact.email_addresses && selectedContact.email_addresses.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Email Addresses</h4>
                    <div className="space-y-2">
                      {selectedContact.email_addresses.map((email, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 capitalize">{email.type}:</span>
                          <a href={`mailto:${email.email}`} className="text-blue-600 hover:underline">
                            {email.email}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedContact.notes && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Notes</h4>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                      {selectedContact.notes}
                    </p>
                  </div>
                )}

                {/* Photos */}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    Photos {contactImages.length > 0 && `(${contactImages.length})`}
                  </h4>
                  {loadingImages ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : contactImages.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {contactImages.slice(0, 12).map((img) => (
                        <div
                          key={img.asset_id}
                          className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                        >
                          <img
                            src={img.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {contactImages.length > 12 && (
                        <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
                          +{contactImages.length - 12} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 py-4 text-center bg-gray-50 rounded-lg">
                      No photos linked to this contact
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-gray-500">
              Select a contact to view details
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content p-6 max-h-[90vh] overflow-y-auto relative">
            <button
              type="button"
              onClick={() => {
                stopSound();
                setShowEditModal(false);
              }}
              className="icon-btn absolute top-4 right-4"
              title="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-lg font-semibold mb-4 pr-8 text-theme-primary">
              {editingContact ? 'Edit Contact' : 'New Contact'}
            </h3>
            <form onSubmit={handleSaveContact} className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    value={formData.first_name || ''}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="input"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name || ''}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="input"
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  value={formData.display_name || ''}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="input"
                  placeholder="Display name (optional)"
                />
              </div>

              {/* Email and Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              {/* Relationship Type */}
              <div>
                <label className="form-label">Relationship</label>
                <div className="flex flex-wrap gap-2">
                  {RELATIONSHIP_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        relationship_type: formData.relationship_type === type ? '' : type
                      })}
                      className={`chip ${formData.relationship_type === type ? 'active' : ''}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Social Media */}
              <div className="section-divider">
                <h4 className="section-title">Social Media</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label text-xs">Instagram</label>
                    <div className="input-group">
                      <span className="input-prefix">@</span>
                      <input
                        type="text"
                        value={formData.instagram_handle || ''}
                        onChange={(e) => setFormData({ ...formData, instagram_handle: e.target.value })}
                        className="input-with-prefix"
                        placeholder="username"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label text-xs">Twitter / X</label>
                    <div className="input-group">
                      <span className="input-prefix">@</span>
                      <input
                        type="text"
                        value={formData.twitter_handle || ''}
                        onChange={(e) => setFormData({ ...formData, twitter_handle: e.target.value })}
                        className="input-with-prefix"
                        placeholder="username"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label text-xs">Facebook</label>
                    <input
                      type="text"
                      value={formData.facebook_handle || ''}
                      onChange={(e) => setFormData({ ...formData, facebook_handle: e.target.value })}
                      className="input"
                      placeholder="Profile name or ID"
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">LinkedIn</label>
                    <input
                      type="text"
                      value={formData.linkedin_handle || ''}
                      onChange={(e) => setFormData({ ...formData, linkedin_handle: e.target.value })}
                      className="input"
                      placeholder="Profile username"
                    />
                  </div>
                </div>
              </div>

              {/* Notification Sound */}
              <div className="section-divider">
                <label className="form-label">Notification Sound</label>
                <div className="max-h-64 overflow-y-auto border border-default rounded-md">
                  {SOUND_CATEGORIES.map((category) => {
                    const categorySounds = NOTIFICATION_SOUNDS.filter(s => s.category === category.id);
                    if (categorySounds.length === 0) return null;
                    return (
                      <div key={category.id}>
                        <div className="sound-category">{category.name}</div>
                        {categorySounds.map((sound) => (
                          <div
                            key={sound.id}
                            className={`sound-item ${formData.notification_sound === sound.id ? 'selected' : ''}`}
                            onClick={() => setFormData({ ...formData, notification_sound: sound.id })}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playSound(sound.id);
                              }}
                              className={`play-btn ${playingSoundId === sound.id ? 'playing' : ''}`}
                              title={playingSoundId === sound.id ? 'Stop' : 'Preview'}
                            >
                              <FontAwesomeIcon
                                icon={playingSoundId === sound.id ? faPause : faPlay}
                                className="text-xs"
                              />
                            </button>
                            <FontAwesomeIcon
                              icon={getIcon(sound.icon)}
                              className="text-theme-accent w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-theme-primary truncate">{sound.name}</p>
                              <p className="text-xs text-theme-muted truncate">{sound.description}</p>
                            </div>
                            {formData.notification_sound === sound.id && (
                              <svg className="w-5 h-5 text-theme-accent flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <p className="hint-text">
                  Click play to preview, click the row to select
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="form-label">Notes</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="textarea"
                  placeholder="Add notes about this contact..."
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 py-2"
                >
                  {saving ? 'Saving...' : (editingContact ? 'Save Changes' : 'Create Contact')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopSound();
                    setShowEditModal(false);
                  }}
                  className="btn-secondary flex-1 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
