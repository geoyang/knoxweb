import { supabase, getAccessToken } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

const getFoldersApiUrl = () => `${getSupabaseUrl()}/functions/v1/admin-folders-api`;
const getDocumentsApiUrl = () => `${getSupabaseUrl()}/functions/v1/admin-documents-api`;
const getListsApiUrl = () => `${getSupabaseUrl()}/functions/v1/admin-lists-api`;
const getEventsApiUrl = () => `${getSupabaseUrl()}/functions/v1/admin-events-api`;

// Types
export interface Folder {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  parent_folder_id: string | null;
  user_id: string;
  depth: number;
  path_ids: string[];
  display_order: number;
  is_active: boolean;
  date_created: string;
  date_modified: string;
  isOwner?: boolean;
  item_count?: number;
  type_counts?: Record<string, number>;
  previews?: {
    album_previews: Array<{ id: string; title: string; keyphoto?: string; keyphoto_thumbnail?: string }>;
    asset_previews: Array<{ id: string; thumbnail: string | null; web_uri: string | null; media_type: string | null }>;
  };
  child_folder_count?: number;
  shared_via?: Array<{
    circle_id?: string;
    circle_name?: string;
    direct_share?: boolean;
    role: string;
  }>;
}

export interface FolderItem {
  id: string;
  folder_id: string;
  item_type: 'folder' | 'album' | 'document' | 'list' | 'asset' | 'live_event';
  item_id: string;
  display_order: number;
  added_by: string;
  date_added: string;
  // Enriched data
  folder?: { id: string; title: string; description?: string; cover_image?: string; depth: number };
  album?: { id: string; title: string; description?: string; keyphoto?: string; keyphoto_thumbnail?: string; asset_count?: number; date_created?: string };
  document?: { id: string; title: string; description?: string; content_type: string; thumbnail_url?: string; file_url?: string; file_mime_type?: string; file_size?: number };
  list?: { id: string; title: string; description?: string; list_type: string; item_count: number };
  asset?: { id: string; path?: string; thumbnail?: string; web_uri?: string; media_type?: string };
  live_event?: { id: string; title: string; description?: string; cover_image?: string; event_type: string; upload_code: string };
}

export interface Document {
  id: string;
  title: string;
  description: string | null;
  content_type: 'text' | 'markdown' | 'rich_text' | 'file';
  content_text: string | null;
  file_url: string | null;
  file_size: number | null;
  file_mime_type: string | null;
  thumbnail_url: string | null;
  user_id: string;
  is_active: boolean;
  date_created: string;
  date_modified: string;
}

export interface List {
  id: string;
  title: string;
  description: string | null;
  list_type: 'checklist' | 'numbered' | 'bullet' | 'shopping' | 'todo';
  user_id: string;
  is_active: boolean;
  date_created: string;
  date_modified: string;
  item_count?: number;
  completed_count?: number;
}

export interface ListItem {
  id: string;
  list_id: string;
  content: string;
  is_completed: boolean;
  display_order: number;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  date_created: string;
  date_modified: string;
  assigned_profile?: { id: string; full_name: string; avatar_url?: string };
}

export interface LiveEvent {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  event_type: 'scheduled' | 'live_now' | 'ended';
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  location_name: string | null;
  location_address: string | null;
  latitude: number | null;
  longitude: number | null;
  upload_code: string;
  auto_accept_uploads: boolean;
  upload_requires_approval: boolean;
  allow_guest_uploads: boolean;
  max_uploads_per_user: number;
  user_id: string;
  target_album_id: string | null;
  is_active: boolean;
  date_created: string;
  date_modified: string;
  total_uploads?: number;
  pending_uploads?: number;
}

export interface LiveEventUpload {
  id: string;
  event_id: string;
  asset_id: string;
  uploaded_by: string | null;
  guest_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  date_uploaded: string;
  uploader_profile?: { id: string; full_name: string; avatar_url?: string };
}

export interface FolderShare {
  id: string;
  type: 'circle' | 'user';
  circle_id?: string;
  user_id?: string;
  role: string;
  inherit_to_children: boolean;
  date_shared: string;
  circles?: { id: string; name: string };
  profile?: { id: string; full_name: string; email?: string; avatar_url?: string };
}

// Helper to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('User not authenticated');
  }
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'apikey': accessToken,
  };
}

// ==================== FOLDERS API ====================

/**
 * Get all folders (owned + shared)
 * @param showAll - if true, returns all folders flat; if false, returns only root-level folders (hierarchy view)
 */
export async function getFolders(showAll: boolean = false): Promise<{
  folders: Folder[];
  count: number;
  viewMode: 'flat' | 'hierarchy';
  stats: { owned: number; shared: number };
}> {
  const headers = await getAuthHeaders();
  const url = showAll ? `${getFoldersApiUrl()}?show_all=true` : getFoldersApiUrl();
  const response = await fetch(url, { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch folders');
  return data;
}

/**
 * Get folder detail with items
 */
export async function getFolderDetail(folderId: string): Promise<{
  folder: Folder;
  items: FolderItem[];
  shares: FolderShare[];
  userRole: string;
  isOwner: boolean;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getFoldersApiUrl()}?folder_id=${folderId}`, { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch folder details');
  return data;
}

/**
 * Get folder ancestry path
 */
export async function getFolderAncestry(folderId: string): Promise<{
  ancestry: Array<{ id: string; title: string; depth: number }>;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getFoldersApiUrl()}?folder_id=${folderId}&action=ancestry`, { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch folder ancestry');
  return data;
}

/**
 * Create a new folder
 */
export async function createFolder(params: {
  title: string;
  description?: string;
  parent_folder_id?: string;
  cover_image?: string;
}): Promise<{ folder: Folder }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getFoldersApiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to create folder');
  return data;
}

/**
 * Update a folder
 */
export async function updateFolder(params: {
  folder_id: string;
  title?: string;
  description?: string;
  cover_image?: string;
  parent_folder_id?: string;
}): Promise<{ folder: Folder }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getFoldersApiUrl(), {
    method: 'PUT',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to update folder');
  return data;
}

/**
 * Delete a folder
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(getFoldersApiUrl(), {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ folder_id: folderId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to delete folder');
}

/**
 * Add item to folder
 */
export async function addItemToFolder(params: {
  folder_id: string;
  item_type: string;
  item_id: string;
}): Promise<{ item: FolderItem }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getFoldersApiUrl()}?action=add_item`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to add item to folder');
  return data;
}

/**
 * Remove item from folder
 */
export async function removeItemFromFolder(params: {
  folder_id: string;
  item_id: string;
  item_type?: string;
}): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getFoldersApiUrl()}?action=remove_item`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to remove item from folder');
}

/**
 * Share folder with circles
 */
export async function shareFolderWithCircles(params: {
  folder_id: string;
  circle_ids: string[];
  role?: string;
  inherit_to_children?: boolean;
}): Promise<{ added: number; removed: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getFoldersApiUrl()}?action=share`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to share folder');
  return data;
}

/**
 * Share folder with user
 */
export async function shareFolderWithUser(params: {
  folder_id: string;
  user_id: string;
  role?: string;
  inherit_to_children?: boolean;
}): Promise<{ share: FolderShare }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getFoldersApiUrl()}?action=share_user`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to share folder with user');
  return data;
}

// ==================== DOCUMENTS API ====================

/**
 * Get all documents
 */
export async function getDocuments(): Promise<{ documents: Document[]; count: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getDocumentsApiUrl(), { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch documents');
  return data;
}

/**
 * Get document detail
 */
export async function getDocument(documentId: string): Promise<{
  document: Document;
  isOwner: boolean;
  folders: Array<{ id: string; title: string }>;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getDocumentsApiUrl()}?document_id=${documentId}`, { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch document');
  return data;
}

/**
 * Create a document
 */
export async function createDocument(params: {
  title: string;
  description?: string;
  content_type?: 'text' | 'markdown' | 'rich_text' | 'file';
  content_text?: string;
  file_url?: string;
  file_size?: number;
  file_mime_type?: string;
  thumbnail_url?: string;
  folder_id?: string;
}): Promise<{ document: Document }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getDocumentsApiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to create document');
  return data;
}

/**
 * Update a document
 */
export async function updateDocument(params: {
  document_id: string;
  title?: string;
  description?: string;
  content_text?: string;
  file_url?: string;
  file_size?: number;
  file_mime_type?: string;
  thumbnail_url?: string;
}): Promise<{ document: Document }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getDocumentsApiUrl(), {
    method: 'PUT',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to update document');
  return data;
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(getDocumentsApiUrl(), {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ document_id: documentId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to delete document');
}

// ==================== LISTS API ====================

/**
 * Get all lists
 */
export async function getLists(): Promise<{ lists: List[]; count: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getListsApiUrl(), { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch lists');
  return data;
}

/**
 * Get list with items
 */
export async function getList(listId: string): Promise<{
  list: List;
  items: ListItem[];
  isOwner: boolean;
  userRole: string;
  folders: Array<{ id: string; title: string }>;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getListsApiUrl()}?list_id=${listId}`, { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch list');
  return data;
}

/**
 * Create a list
 */
export async function createList(params: {
  title: string;
  description?: string;
  list_type?: 'checklist' | 'numbered' | 'bullet' | 'shopping' | 'todo';
  folder_id?: string;
  initial_items?: string[];
}): Promise<{ list: List }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getListsApiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to create list');
  return data;
}

/**
 * Update a list
 */
export async function updateList(params: {
  list_id: string;
  title?: string;
  description?: string;
  list_type?: string;
}): Promise<{ list: List }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getListsApiUrl(), {
    method: 'PUT',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to update list');
  return data;
}

/**
 * Delete a list
 */
export async function deleteList(listId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(getListsApiUrl(), {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ list_id: listId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to delete list');
}

/**
 * Add item to list
 */
export async function addListItem(params: {
  list_id: string;
  content: string;
  due_date?: string;
  assigned_to?: string;
}): Promise<{ item: ListItem }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getListsApiUrl()}?action=add_item`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to add item to list');
  return data;
}

/**
 * Toggle list item completion
 */
export async function toggleListItem(itemId: string, isCompleted: boolean): Promise<{ item: ListItem }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getListsApiUrl()}?action=toggle_item`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ item_id: itemId, is_completed: isCompleted }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to toggle item');
  return data;
}

/**
 * Update list item
 */
export async function updateListItem(params: {
  item_id: string;
  content?: string;
  due_date?: string;
  assigned_to?: string;
}): Promise<{ item: ListItem }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getListsApiUrl()}?action=update_item`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to update item');
  return data;
}

/**
 * Reorder list items
 */
export async function reorderListItems(listId: string, itemOrder: string[]): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getListsApiUrl()}?action=reorder`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ list_id: listId, item_order: itemOrder }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to reorder items');
}

/**
 * Remove list item
 */
export async function removeListItem(itemId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getListsApiUrl()}?action=remove_item`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ item_id: itemId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to remove item');
}

// ==================== LIVE EVENTS API ====================

/**
 * Get all events
 */
export async function getEvents(): Promise<{ events: LiveEvent[]; count: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getEventsApiUrl(), { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch events');
  return data;
}

/**
 * Get event detail
 */
export async function getEvent(eventId: string): Promise<{
  event: LiveEvent;
  uploads: LiveEventUpload[];
  targetAlbum: { id: string; title: string; keyphoto?: string } | null;
  isOwner: boolean;
  userRole: string;
  folders: Array<{ id: string; title: string }>;
  stats: { total_uploads: number; pending: number; approved: number; rejected: number };
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getEventsApiUrl()}?event_id=${eventId}`, { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch event');
  return data;
}

/**
 * Get event by upload code (public)
 */
export async function getEventByCode(uploadCode: string): Promise<{
  event: LiveEvent & { can_upload: boolean };
}> {
  const response = await fetch(`${getEventsApiUrl()}?upload_code=${uploadCode}`, { method: 'GET' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Event not found');
  return data;
}

/**
 * Create an event
 */
export async function createEvent(params: {
  title: string;
  description?: string;
  cover_image?: string;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  location_name?: string;
  location_address?: string;
  latitude?: number;
  longitude?: number;
  auto_accept_uploads?: boolean;
  upload_requires_approval?: boolean;
  allow_guest_uploads?: boolean;
  max_uploads_per_user?: number;
  target_album_id?: string;
  folder_id?: string;
}): Promise<{ event: LiveEvent }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getEventsApiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to create event');
  return data;
}

/**
 * Update an event
 */
export async function updateEvent(params: {
  event_id: string;
  title?: string;
  description?: string;
  cover_image?: string;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  location_name?: string;
  location_address?: string;
  latitude?: number;
  longitude?: number;
  auto_accept_uploads?: boolean;
  upload_requires_approval?: boolean;
  allow_guest_uploads?: boolean;
  max_uploads_per_user?: number;
  target_album_id?: string;
}): Promise<{ event: LiveEvent }> {
  const headers = await getAuthHeaders();
  const response = await fetch(getEventsApiUrl(), {
    method: 'PUT',
    headers,
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to update event');
  return data;
}

/**
 * Start an event (set to live)
 */
export async function startEvent(eventId: string): Promise<{ event: LiveEvent }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getEventsApiUrl()}?action=start`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ event_id: eventId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to start event');
  return data;
}

/**
 * End an event
 */
export async function endEvent(eventId: string): Promise<{ event: LiveEvent }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getEventsApiUrl()}?action=end`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ event_id: eventId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to end event');
  return data;
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(getEventsApiUrl(), {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ event_id: eventId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to delete event');
}

/**
 * Upload to event (authenticated)
 */
export async function uploadToEvent(eventId: string, assetId: string): Promise<{ upload: LiveEventUpload }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getEventsApiUrl()}?action=upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ event_id: eventId, asset_id: assetId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to upload');
  return data;
}

/**
 * Guest upload to event (public)
 */
export async function guestUploadToEvent(params: {
  upload_code: string;
  asset_id: string;
  guest_name?: string;
}): Promise<{ upload: LiveEventUpload; message: string }> {
  const response = await fetch(`${getEventsApiUrl()}?action=guest_upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to upload');
  return data;
}

/**
 * Review upload (approve/reject)
 */
export async function reviewUpload(uploadId: string, action: 'approve' | 'reject'): Promise<{ upload: LiveEventUpload }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${getEventsApiUrl()}?action=review`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ upload_id: uploadId, action }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to review upload');
  return data;
}

// ==================== FILE UPLOAD HELPERS ====================

/**
 * Upload a file to the documents bucket and create a document record
 */
export async function uploadDocumentFile(
  file: File,
  folderId?: string
): Promise<{ document: Document }> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('User not authenticated');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const userId = user.id;
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}_${safeName}`;

  // Upload file to documents bucket
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }

  // Get the file URL (signed URL for private bucket)
  const { data: urlData } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiry

  const fileUrl = urlData?.signedUrl || `${getSupabaseUrl()}/storage/v1/object/documents/${filePath}`;

  // Determine content type based on MIME type
  let contentType: 'text' | 'markdown' | 'rich_text' | 'file' = 'file';
  if (file.type === 'text/plain') {
    contentType = 'text';
  } else if (file.type === 'text/markdown') {
    contentType = 'markdown';
  }

  // Create document record via API
  const result = await createDocument({
    title: file.name,
    content_type: contentType,
    file_url: fileUrl,
    file_size: file.size,
    file_mime_type: file.type,
    folder_id: folderId,
  });

  return result;
}

/**
 * Check if a file is a photo/video (should use asset upload) or document
 */
export function isMediaFile(file: File): boolean {
  const mediaTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    'audio/flac',
    'audio/x-m4a',
    'audio/mp4',
  ];
  return mediaTypes.includes(file.type);
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/');
}

/**
 * Get appropriate icon for file type
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
  if (mimeType === 'text/plain') return '📄';
  if (mimeType === 'text/csv') return '📊';
  if (mimeType === 'application/json') return '{ }';
  if (mimeType === 'application/zip') return '📦';
  return '📄';
}
