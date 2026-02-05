import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/adminApi';
import { supabase } from '../../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../../lib/environments';
import { contactsApi } from '../../services/contactsApi';
import { getFolders, Folder } from '../../services/foldersApi';
import { chatApi, Conversation } from '../../services/chatApi';

interface CircleAlbum {
  id: string;
  title: string;
  keyphoto: string | null;
  keyphoto_thumbnail?: string | null;
  photo_count?: number;
  album_shares?: {
    id: string;
    circle_id: string;
    role: string;
    is_active: boolean;
  }[];
}

interface CircleMember {
  user_id: string | null;
  role: string;
  profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface Circle {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  date_created: string;
  date_modified: string;
  is_active: boolean;
  user_role?: string; // The user's role if they're a guest (not owner)
  members?: CircleMember[];
  member_count?: number;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
}

interface CircleUser {
  id: string;
  email: string | null;
  role: string;
  status: string;
  date_invited: string;
  user_id: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
}

export const CirclesManager: React.FC = () => {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [circleUsers, setCircleUsers] = useState<CircleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewCircleForm, setShowNewCircleForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<{email: string; role: string; name: string}[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [showEditCircleForm, setShowEditCircleForm] = useState(false);
  const [editingCircle, setEditingCircle] = useState<Circle | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);
  const [allAlbums, setAllAlbums] = useState<CircleAlbum[]>([]);
  const [showAddAlbumForm, setShowAddAlbumForm] = useState(false);
  const [sharingAlbum, setSharingAlbum] = useState(false);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);

  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      loadCircles();
      loadAlbums();
      loadFolders();
      loadConversations();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadCircles = async () => {
    if (!user?.id) {
      console.warn('No user ID available for filtering circles');
      setCircles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Loading circles for user:', user?.id);

      // Check authentication state first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.error('Authentication issue:', sessionError);
        await signOut();
        navigate('/login');
        return;
      }
      
      const result = await adminApi.getCircles();
      console.log('Circles API result:', result);

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      console.log('Circles API response:', result.data?.circles);
      console.log('Circles API debug:', result.data?.debug);
      setCircles(result.data?.circles || []);
      setError(null);
    } catch (err) {
      console.error('Error loading circles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load circles');
    } finally {
      setLoading(false);
    }
  };

  const loadCircleUsers = async (circleId: string) => {
    try {
      const result = await adminApi.getCircleUsers(circleId);

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        console.warn('Circle users could not be loaded:', adminApi.handleApiError(result));
        setCircleUsers([]);
        return;
      }
      setCircleUsers(result.data?.users || []);
    } catch (err) {
      console.error('Error loading circle users:', err);
      setCircleUsers([]);
    }
  };

  const loadAlbums = async () => {
    try {
      const result = await adminApi.getAlbums();
      if (result.success && result.data?.albums) {
        setAllAlbums(result.data.albums);
      }
    } catch (err) {
      console.error('Error loading albums:', err);
    }
  };

  const loadFolders = async () => {
    try {
      const result = await getFolders(true);
      setAllFolders(result.folders || []);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  };

  const loadConversations = async () => {
    try {
      const result = await chatApi.getConversations();
      if (result.success && result.data?.conversations) {
        setAllConversations(result.data.conversations);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  };

  const getCircleAlbums = (circleId: string) => {
    return allAlbums.filter(album =>
      album.album_shares?.some(s => s.circle_id === circleId && s.is_active)
    );
  };

  const getCircleFolders = (circleId: string) => {
    return allFolders.filter(folder =>
      folder.shared_via?.some(s => s.circle_id === circleId)
    );
  };

  const getCircleConversations = (circleId: string) => {
    return allConversations.filter(c => c.circle_id === circleId);
  };

  const handleShareAlbumToCircle = async (albumId: string) => {
    if (!selectedCircle) return;
    try {
      setSharingAlbum(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const album = allAlbums.find(a => a.id === albumId);
      const existingCircleIds = (album?.album_shares || [])
        .filter(s => s.is_active)
        .map(s => s.circle_id);
      const newCircleIds = [...new Set([...existingCircleIds, selectedCircle.id])];

      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/admin-albums-api?action=share`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            album_id: albumId,
            circle_ids: newCircleIds,
            role: 'read_only',
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to share album');

      setShowAddAlbumForm(false);
      await loadAlbums();
    } catch (err) {
      console.error('Error sharing album to circle:', err);
      setError(err instanceof Error ? err.message : 'Failed to share album');
    } finally {
      setSharingAlbum(false);
    }
  };

  const handleRemoveAlbumFromCircle = async (albumId: string) => {
    if (!selectedCircle) return;
    if (!confirm('Remove this album from the circle?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const album = allAlbums.find(a => a.id === albumId);
      const remainingCircleIds = (album?.album_shares || [])
        .filter(s => s.is_active && s.circle_id !== selectedCircle.id)
        .map(s => s.circle_id);

      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/admin-albums-api?action=share`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            album_id: albumId,
            circle_ids: remainingCircleIds,
            role: 'read_only',
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to remove album');

      await loadAlbums();
    } catch (err) {
      console.error('Error removing album from circle:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove album');
    }
  };

  const handleCircleSelect = async (circle: Circle) => {
    setSelectedCircle(circle);
    await loadCircleUsers(circle.id);
  };

  const handleCreateCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
      const result = await adminApi.createCircle({
        name: formData.get('name') as string,
        description: formData.get('description') as string || undefined,
      });

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      setShowNewCircleForm(false);
      form.reset();
      await loadCircles();
    } catch (err) {
      console.error('Error creating circle:', err);
      alert(`Failed to create circle: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDoubleClickCircle = (circle: Circle) => {
    setEditingCircle(circle);
    setEditName(circle.name);
    setEditDescription(circle.description || '');
    setShowEditCircleForm(true);
  };

  // Render avatar group for circle members
  const renderAvatarGroup = (members: CircleMember[] | undefined, size: 'sm' | 'md' = 'md') => {
    if (!members || members.length === 0) {
      return (
        <div className={`${size === 'md' ? 'w-12 h-12' : 'w-10 h-10'} rounded-full bg-blue-100 flex items-center justify-center`}>
          <span className="text-blue-600 font-medium text-lg">👥</span>
        </div>
      );
    }

    const maxShow = 3;
    const toShow = members.slice(0, maxShow);
    const remaining = members.length - maxShow;
    const containerSize = size === 'md' ? 'w-12 h-12' : 'w-10 h-10';
    const avatarSize = size === 'md' ? 'w-7 h-7' : 'w-6 h-6';
    const avatarSizeFirst = size === 'md' ? 'w-8 h-8' : 'w-7 h-7';

    return (
      <div className={`${containerSize} relative flex-shrink-0`}>
        {toShow.map((member, index) => {
          const isFirst = index === 0;
          const positionClass = isFirst
            ? 'top-0 left-0'
            : index === 1
            ? 'bottom-0 right-0'
            : 'top-0 right-0';
          const sizeClass = isFirst ? avatarSizeFirst : avatarSize;

          return (
            <div
              key={member.user_id || index}
              className={`absolute ${positionClass} ${sizeClass} rounded-full border-2 border-white overflow-hidden`}
              style={{ zIndex: maxShow - index }}
            >
              {member.profile?.avatar_url ? (
                <img
                  src={member.profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-medium">
                    {(member.profile?.full_name || '?')[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {remaining > 0 && (
          <div className="absolute bottom-0 left-3 w-5 h-5 rounded-full bg-gray-400 border-2 border-white flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">+{remaining}</span>
          </div>
        )}
      </div>
    );
  };

  const handleSaveCircleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCircle || !editName.trim()) return;

    try {
      setSavingEdit(true);

      const result = await adminApi.updateCircle({
        circle_id: editingCircle.id,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });

      if (!result.success) throw new Error(result.error || 'Failed to update circle');

      setShowEditCircleForm(false);
      setEditingCircle(null);
      await loadCircles();

      // Update selected circle if it was the one being edited
      if (selectedCircle?.id === editingCircle.id) {
        setSelectedCircle({
          ...selectedCircle,
          name: editName.trim(),
          description: editDescription.trim() || null
        });
      }
    } catch (err) {
      console.error('Error updating circle:', err);
      alert(`Failed to update circle: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddToInviteList = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const email = (formData.get('email') as string).trim().toLowerCase();
    const name = (formData.get('name') as string).trim();
    const role = formData.get('role') as string;

    // Check if already in list
    if (pendingInvites.some(inv => inv.email === email)) {
      alert('This email is already in the invite list');
      return;
    }

    // Check if already a member
    if (circleUsers.some(u => u.email?.toLowerCase() === email)) {
      alert('This user is already a member of the circle');
      return;
    }

    setPendingInvites(prev => [...prev, { email, role, name }]);
    form.reset();
  };

  const handleRemoveFromInviteList = (email: string) => {
    setPendingInvites(prev => prev.filter(inv => inv.email !== email));
  };

  const handleSendInvitations = async () => {
    if (!selectedCircle || pendingInvites.length === 0) return;

    try {
      setSendingInvites(true);

      // Send all invitations
      const results = await Promise.all(
        pendingInvites.map(invite =>
          adminApi.inviteUserToCircle(selectedCircle.id, {
            email: invite.email,
            role: invite.role,
            full_name: invite.name || undefined,
          })
        )
      );

      const failures = results.filter(r => !r.success);
      const emailsSent = results.filter(r => r.success && r.data?.emailSent).length;
      const emailsFailed = results.filter(r => r.success && !r.data?.emailSent).length;

      if (failures.length > 0) {
        alert(`${pendingInvites.length - failures.length} invitation(s) created. ${failures.length} failed.`);
      } else if (emailsFailed > 0) {
        alert(`${pendingInvites.length} invitation(s) created. ${emailsSent} email(s) sent, ${emailsFailed} email(s) failed to send.`);
      } else {
        alert(`${pendingInvites.length} invitation(s) sent successfully! (${emailsSent} emails sent)`);
      }

      console.log('Invitation results:', results.map(r => ({ success: r.success, emailSent: r.data?.emailSent })));

      setPendingInvites([]);
      setShowInviteForm(false);
      await loadCircleUsers(selectedCircle.id);
    } catch (err) {
      console.error('Error sending invitations:', err);
      alert(`Failed to send invitations: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSendingInvites(false);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'editor': return 'bg-orange-100 text-orange-800';
      case 'contributor': return 'bg-green-100 text-green-800';
      case 'read_only': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'declined': return 'bg-red-100 text-red-800';
      case 'removed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const copyInviteLink = (inviteId: string) => {
    const link = `${window.location.origin}/album/${inviteId}`;
    navigator.clipboard.writeText(link);
    alert('Invite link copied to clipboard!');
  };

  const handleImportCircleToContacts = async () => {
    if (!selectedCircle || circleUsers.length === 0) return;

    try {
      setImportingContacts(true);

      // Filter to only accepted members with user_ids (actual users, not pending invites)
      const membersToImport = circleUsers.filter(
        member => member.status === 'accepted' && member.user_id && member.user_id !== user?.id
      );

      if (membersToImport.length === 0) {
        alert('No members to import. Only accepted members (excluding yourself) can be imported as contacts.');
        return;
      }

      let imported = 0;
      let updated = 0;
      let failed = 0;

      // Get existing contacts to check for duplicates
      const { contacts: existingContacts } = await contactsApi.getContacts(undefined, 1, 1000);

      for (const member of membersToImport) {
        try {
          // Check if contact already exists with this linked_profile_id
          const existingContact = existingContacts.find(
            c => c.linked_profile_id === member.user_id
          );

          const contactData = {
            display_name: member.profiles?.full_name || member.email || 'Unknown',
            first_name: member.profiles?.full_name?.split(' ')[0] || undefined,
            last_name: member.profiles?.full_name?.split(' ').slice(1).join(' ') || undefined,
            relationship_type: 'friend' as const,
            notes: `Imported from circle: ${selectedCircle.name}`,
          };

          if (existingContact) {
            // Update existing contact
            await contactsApi.updateContact(existingContact.id, contactData);
            updated++;
          } else {
            // Create new contact
            const newContact = await contactsApi.createContact(contactData);
            if (newContact && member.user_id) {
              // Link to Knox profile
              await contactsApi.linkProfile(newContact.id, member.user_id);
            }
            imported++;
          }
        } catch (err) {
          console.error('Error importing member:', member, err);
          failed++;
        }
      }

      let message = '';
      if (imported > 0) message += `${imported} contact(s) imported. `;
      if (updated > 0) message += `${updated} contact(s) updated. `;
      if (failed > 0) message += `${failed} failed.`;

      alert(message || 'No contacts were imported.');
    } catch (err) {
      console.error('Error importing contacts:', err);
      alert('Failed to import contacts: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setImportingContacts(false);
    }
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
        <h2 className="text-2xl font-bold text-gray-900">Circles Management</h2>
        <button
          onClick={() => setShowNewCircleForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <span>+</span>
          Create New Circle
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Circles List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">Your Circles</h3>
          </div>
          <div className="divide-y">
            {circles.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No circles found. Create your first circle to start sharing photos!
              </div>
            ) : (
              circles.map(circle => {
                const isOwner = circle.owner_id === user?.id;
                return (
                  <div
                    key={circle.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedCircle?.id === circle.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => handleCircleSelect(circle)}
                    onDoubleClick={() => isOwner && handleDoubleClickCircle(circle)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar Group */}
                      {renderAvatarGroup(circle.members)}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-gray-900 truncate">{circle.name}</h4>
                          {isOwner ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 flex-shrink-0 ml-2">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                              </svg>
                              Owner
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${getRoleColor(circle.user_role || 'read_only')}`}>
                              Guest • {(circle.user_role || 'read_only').replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        {circle.description && (
                          <p className="text-sm text-gray-600 mt-1 truncate">{circle.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {circle.member_count !== undefined ? `${circle.member_count} member${circle.member_count !== 1 ? 's' : ''}` : ''}
                          {circle.member_count !== undefined && ' • '}
                          Created {new Date(circle.date_created).toLocaleDateString()}
                          {isOwner && <span className="ml-2 text-gray-400">(double-click to edit)</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Circle Details */}
        <div className="bg-white rounded-lg shadow">
          {selectedCircle ? (
            <>
              <div className="p-6 border-b">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{selectedCircle.name}</h3>
                      {selectedCircle.owner_id === user?.id ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          Owner
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(selectedCircle.user_role || 'read_only')}`}>
                          Guest • {(selectedCircle.user_role || 'read_only').replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    {selectedCircle.description && (
                      <p className="text-gray-600 mt-1">{selectedCircle.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleImportCircleToContacts}
                      disabled={importingContacts || circleUsers.length === 0}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-1"
                      title="Import circle members to your contacts"
                    >
                      {importingContacts ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Importing...
                        </>
                      ) : (
                        <>
                          <span>📇</span>
                          Import to Contacts
                        </>
                      )}
                    </button>
                    {(selectedCircle.owner_id === user?.id || ['admin', 'editor'].includes(selectedCircle.user_role || '')) && (
                      <button
                        onClick={() => setShowInviteForm(true)}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                      >
                        Invite User
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                <h4 className="font-medium text-gray-900 mb-4">Members & Invitations</h4>
                <div className="space-y-3">
                  {circleUsers.length === 0 ? (
                    <p className="text-gray-500 text-sm">No members or pending invitations</p>
                  ) : (
                    circleUsers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">
                            {member.profiles?.full_name || member.email}
                          </p>
                          {member.profiles?.email && member.profiles.email !== member.email && (
                            <p className="text-xs text-gray-500">{member.profiles.email}</p>
                          )}
                          {!member.user_id && member.email && (
                            <p className="text-xs text-gray-500">{member.email} (invited)</p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(member.role)}`}>
                            {member.role.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(member.status)}`}>
                            {member.status}
                          </span>
                          {member.status === 'pending' && member.role === 'read_only' && (
                            <button
                              onClick={() => copyInviteLink(member.id)}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                              title="Copy invite link"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Albums Section */}
              <div className="p-6 border-t">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-gray-900">Albums</h4>
                  {selectedCircle.owner_id === user?.id && (
                    <button
                      onClick={() => setShowAddAlbumForm(true)}
                      className="btn-primary flex items-center gap-1 text-sm"
                    >
                      <span>+</span> Add Album
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {getCircleAlbums(selectedCircle.id).length === 0 ? (
                    <p className="text-gray-500 text-sm">No albums shared to this circle</p>
                  ) : (
                    getCircleAlbums(selectedCircle.id).map(album => (
                      <div key={album.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-gray-200 overflow-hidden flex-shrink-0">
                            {album.keyphoto_thumbnail || album.keyphoto ? (
                              <img
                                src={album.keyphoto_thumbnail || album.keyphoto || ''}
                                alt={album.title}
                                className="w-full h-full object-cover"
                                crossOrigin="anonymous"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">
                                <i className="fi fi-sr-picture"></i>
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{album.title}</p>
                            {album.photo_count !== undefined && (
                              <p className="text-xs text-gray-500">{album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}</p>
                            )}
                          </div>
                        </div>
                        {selectedCircle.owner_id === user?.id && (
                          <button
                            onClick={() => handleRemoveAlbumFromCircle(album.id)}
                            className="text-red-500 hover:text-red-700 text-sm"
                            title="Remove from circle"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Folders Section */}
              <div className="p-6 border-t">
                <h4 className="font-medium text-gray-900 mb-4">Folders</h4>
                <div className="space-y-2">
                  {getCircleFolders(selectedCircle.id).length === 0 ? (
                    <p className="text-gray-500 text-sm">No folders shared to this circle</p>
                  ) : (
                    getCircleFolders(selectedCircle.id).map(folder => (
                      <div
                        key={folder.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => navigate('/admin/folders')}
                      >
                        <div className="w-10 h-10 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <i className="fi fi-sr-folder text-blue-500"></i>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{folder.title}</p>
                          {folder.item_count !== undefined && (
                            <p className="text-xs text-gray-500">{folder.item_count} item{folder.item_count !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chats Section */}
              <div className="p-6 border-t">
                <h4 className="font-medium text-gray-900 mb-4">Chats</h4>
                <div className="space-y-2">
                  {getCircleConversations(selectedCircle.id).length === 0 ? (
                    <p className="text-gray-500 text-sm">No conversations in this circle</p>
                  ) : (
                    getCircleConversations(selectedCircle.id).map(conv => (
                      <div
                        key={conv.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => navigate('/admin/chat')}
                      >
                        <div className="w-10 h-10 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                          <i className="fi fi-sr-messages text-green-500"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{conv.title || 'General'}</p>
                          {conv.last_message_preview && (
                            <p className="text-xs text-gray-500 truncate">{conv.last_message_preview}</p>
                          )}
                        </div>
                        {conv.unread_count > 0 && (
                          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-gray-500">
              Select a circle to view details and manage members
            </div>
          )}
        </div>
      </div>

      {/* New Circle Modal */}
      {showNewCircleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Circle</h3>
            <form onSubmit={handleCreateCircle} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Circle Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                  placeholder="Family, Friends, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                  placeholder="Describe what this circle is for..."
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Create Circle
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCircleForm(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {showInviteForm && selectedCircle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Invite Users to {selectedCircle.name}</h3>

            {/* Add to invite list form */}
            <form onSubmit={handleAddToInviteList} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  name="name"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Their name (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  name="role"
                  defaultValue="read_only"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="read_only">Read Only</option>
                  <option value="contributor">Contributor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-medium transition-colors"
              >
                + Add to Invite List
              </button>
            </form>

            {/* Pending invites list */}
            {pendingInvites.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-3">
                  Pending Invitations ({pendingInvites.length})
                </h4>
                <div className="space-y-2 mb-4">
                  {pendingInvites.map((invite, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div>
                        {invite.name && (
                          <span className="text-sm font-medium block">{invite.name}</span>
                        )}
                        <span className={`text-sm ${invite.name ? 'text-gray-500' : 'font-medium'}`}>{invite.email}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(invite.role)}`}>
                          {invite.role.replace('_', ' ')}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveFromInviteList(invite.email)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSendInvitations}
                  disabled={sendingInvites}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-2 px-4 rounded-md font-medium transition-colors"
                >
                  {sendingInvites ? 'Sending...' : `Send ${pendingInvites.length} Invitation(s)`}
                </button>
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowInviteForm(false);
                  setPendingInvites([]);
                }}
                className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Circle Modal */}
      {showEditCircleForm && editingCircle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Circle</h3>
            <form onSubmit={handleSaveCircleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Circle Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Family, Friends, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this circle is for..."
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={savingEdit || !editName.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 px-4 rounded-md font-medium transition-colors"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditCircleForm(false);
                    setEditingCircle(null);
                  }}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Add Album to Circle Modal */}
      {showAddAlbumForm && selectedCircle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add Album to {selectedCircle.name}</h3>
            {(() => {
              const sharedIds = new Set(getCircleAlbums(selectedCircle.id).map(a => a.id));
              const available = allAlbums.filter(a => !sharedIds.has(a.id));
              if (available.length === 0) {
                return <p className="text-gray-500 text-sm">All albums are already shared to this circle.</p>;
              }
              return (
                <div className="space-y-2">
                  {available.map(album => (
                    <button
                      key={album.id}
                      onClick={() => handleShareAlbumToCircle(album.id)}
                      disabled={sharingAlbum}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded bg-gray-200 overflow-hidden flex-shrink-0">
                        {album.keyphoto_thumbnail || album.keyphoto ? (
                          <img
                            src={album.keyphoto_thumbnail || album.keyphoto || ''}
                            alt={album.title}
                            className="w-full h-full object-cover"
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">
                            <i className="fi fi-sr-picture"></i>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{album.title}</p>
                        {album.photo_count !== undefined && (
                          <p className="text-xs text-gray-500">{album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
            <div className="mt-4 pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowAddAlbumForm(false)}
                className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};