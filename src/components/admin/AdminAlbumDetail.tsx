import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MemoriesPanel } from '../MemoriesPanel';
import { memoriesApi, Memory, MemoryInput } from '../../services/memoriesApi';
import { VideoPlayer } from '../VideoPlayer';
import { AlbumPhotoGrid, AlbumAsset, ContextMenuItem, getDisplayUrl } from '../AlbumPhotoGrid';
import { PhotoPicker } from './PhotoPicker';
import { ImageUploader } from './ImageUploader';
import { ReactionBar } from '../ReactionBar';
import { PermissionRequestDialog } from '../PermissionRequestDialog';

interface Album {
  id: string;
  title: string;
  description: string | null;
  keyphoto: string | null;
  user_id: string;
  isOwner?: boolean;
  shared_via?: { circle_id: string; circle_name: string; role: string }[];
  album_assets?: AlbumAsset[];
  album_shares?: { id: string; circle_id: string; role: string; is_active: boolean; circles: { id: string; name: string } }[];
}

interface Circle {
  id: string;
  name: string;
}

const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin': return 'bg-purple-100 text-purple-800';
    case 'editor': return 'bg-blue-100 text-blue-800';
    case 'contributor': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

// Helper to check if role can add memories
const canAddMemory = (role: string, isOwner: boolean) => {
  if (isOwner) return true;
  return ['contributor', 'editor', 'admin'].includes(role);
};

// Asset Modal with inline memories
interface AssetModalWithMemoriesProps {
  asset: AlbumAsset;
  memoryCounts: Record<string, number>;
  isOwner: boolean;
  userRole: string;
  albumId: string;
  albumTitle: string;
  onClose: () => void;
  onSetKeyPhoto: () => void;
  onRemove: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

const AssetModalWithMemories: React.FC<AssetModalWithMemoriesProps> = ({
  asset,
  memoryCounts,
  isOwner,
  userRole,
  albumId,
  albumTitle,
  onClose,
  onSetKeyPhoto,
  onRemove,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);
  const [showAddMemoryForm, setShowAddMemoryForm] = useState(false);
  const [submittingMemory, setSubmittingMemory] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  // Edit/Delete memory state
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemoryText, setEditMemoryText] = useState('');
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [memoryActionLoading, setMemoryActionLoading] = useState(false);

  const hasMemoryPermission = canAddMemory(userRole, isOwner);

  // Check if user can manage (edit/delete) a specific memory
  // Editors and above can manage any memory, or users can manage their own
  const canManageMemory = (memory: Memory) => {
    if (isOwner) return true;
    if (['editor', 'admin'].includes(userRole)) return true;
    // Check if user owns this memory (would need current user ID)
    return false;
  };

  const handleAddMemoryClick = () => {
    if (hasMemoryPermission) {
      setShowAddMemoryForm(true);
    } else {
      setShowPermissionDialog(true);
    }
  };

  const handleEditMemory = (memory: Memory) => {
    setEditingMemoryId(memory.id);
    setEditMemoryText(memory.content_text || '');
  };

  const handleSaveEditMemory = async () => {
    if (!editingMemoryId || !editMemoryText.trim()) return;

    setMemoryActionLoading(true);
    try {
      const result = await memoriesApi.editMemory(editingMemoryId, { content_text: editMemoryText.trim() });
      if (result.success) {
        await loadMemories();
        setEditingMemoryId(null);
        setEditMemoryText('');
      }
    } catch (err) {
      console.error('Failed to edit memory:', err);
    } finally {
      setMemoryActionLoading(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    setMemoryActionLoading(true);
    try {
      const result = await memoriesApi.deleteMemory(memoryId);
      if (result.success) {
        await loadMemories();
        setDeletingMemoryId(null);
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    } finally {
      setMemoryActionLoading(false);
    }
  };

  // Add memory form state
  const [formType, setFormType] = useState<'text' | 'video' | 'audio'>('text');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Recording state
  const [inputMode, setInputMode] = useState<'file' | 'record'>('file');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const videoPreviewRef = React.useRef<HTMLVideoElement>(null);
  const recordedChunksRef = React.useRef<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const MAX_TEXT_LENGTH = 4000;

  const loadMemories = useCallback(async () => {
    try {
      setMemoriesLoading(true);
      const result = await memoriesApi.getMemories(asset.asset_id);
      if (result.success && result.data) {
        setMemories(result.data.memories);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setMemoriesLoading(false);
    }
  }, [asset.asset_id]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAddMemoryForm) return; // Don't navigate when form is open
      if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddMemoryForm, hasPrevious, hasNext, onPrevious, onNext, onClose]);

  const cleanupMediaStream = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const closeForm = () => {
    stopRecording();
    cleanupMediaStream();
    setShowAddMemoryForm(false);
    setTextContent('');
    setSelectedFile(null);
    setInputMode('file');
    setRecordedBlob(null);
    setRecordingTime(0);
    setFormType('text');
  };

  const startRecording = async () => {
    try {
      const constraints: MediaStreamConstraints = formType === 'video'
        ? { video: { facingMode: 'user' }, audio: true }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setMediaStream(stream);

      if (videoPreviewRef.current && formType === 'video') {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }

      const mimeType = formType === 'video'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        cleanupMediaStream();
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Error accessing media devices:', err);
      alert(`Could not access ${formType === 'video' ? 'camera' : 'microphone'}. Please check permissions.`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const discardRecording = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      setSelectedFile(file);
      if (isAudio) setFormType('audio');
      else if (isVideo) setFormType('video');
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formType === 'text' && !textContent.trim()) {
      alert('Please enter some text');
      return;
    }

    const hasMedia = selectedFile || recordedBlob;
    if ((formType === 'video' || formType === 'audio') && !hasMedia) {
      alert('Please select or record a file');
      return;
    }

    try {
      setSubmittingMemory(true);
      let input: MemoryInput;

      if (formType === 'text') {
        input = {
          memory_type: 'text',
          content_text: textContent.trim(),
        };
      } else {
        let fileToUpload: File;
        if (recordedBlob) {
          const extension = 'webm';
          const filename = `recorded_${formType}_${Date.now()}.${extension}`;
          fileToUpload = new File([recordedBlob], filename, { type: recordedBlob.type });
        } else {
          fileToUpload = selectedFile!;
        }

        const uploadResult = await memoriesApi.uploadMemoryMedia(fileToUpload, asset.asset_id, formType);
        if (!uploadResult) throw new Error('Failed to upload file');

        input = {
          memory_type: formType,
          content_url: uploadResult.url,
          thumbnail_url: uploadResult.thumbnailUrl,
        };
      }

      const result = await memoriesApi.addMemory(asset.asset_id, input);
      if (result.success) {
        closeForm();
        loadMemories();
      } else {
        throw new Error(result.error || 'Failed to add memory');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add memory');
    } finally {
      setSubmittingMemory(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const [showFullSize, setShowFullSize] = useState(false);

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleDoubleClick = () => {
    setShowFullSize(true);
  };

  // Full size image modal
  if (showFullSize) {
    return (
      <div className="fixed inset-0 bg-black z-[60] flex items-center justify-center" onClick={() => setShowFullSize(false)}>
        <button onClick={() => setShowFullSize(false)} className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-10">×</button>
        {asset.asset_type === 'video' ? (
          <VideoPlayer src={getDisplayUrl(asset) || ''} className="max-w-full max-h-full" />
        ) : (
          <img src={getDisplayUrl(asset) || ''} alt="" className="max-w-full max-h-full object-contain" />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex" onClick={onClose}>
      {/* Left side - Photo */}
      <div className={`flex flex-col p-4 transition-all duration-300 ${showAddMemoryForm ? 'w-1/4' : 'flex-1'}`} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="text-white/70 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        {/* Media content with navigation */}
        <div className="flex-1 flex items-center justify-center relative min-h-0">
          {/* Previous button */}
          {hasPrevious && onPrevious && (
            <button
              onClick={onPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full z-10 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Photo/Video */}
          <div className="w-full h-full flex items-center justify-center">
            {asset.asset_type === 'video' ? (
              <VideoPlayer src={getDisplayUrl(asset) || ''} className="max-w-full max-h-full rounded-lg object-contain" />
            ) : (
              <img
                src={getDisplayUrl(asset) || ''}
                alt=""
                className="max-w-full max-h-full rounded-lg object-contain cursor-zoom-in"
                style={{ maxHeight: 'calc(100vh - 250px)' }}
                onDoubleClick={handleDoubleClick}
                title="Double-click to view full size"
              />
            )}
          </div>

          {/* Next button */}
          {hasNext && onNext && (
            <button
              onClick={onNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full z-10 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Date, Location, and Reactions */}
        <div className="mt-4 space-y-3">
          {(asset.created_at || asset.location_name) && (
            <div className="text-white/80 text-sm">
              {asset.created_at && <span>{formatDate(asset.created_at)}</span>}
              {asset.created_at && asset.location_name && <span className="mx-2">•</span>}
              {asset.location_name && <span>📍 {asset.location_name}</span>}
            </div>
          )}

          <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
            <ReactionBar targetId={asset.asset_id} targetType="asset" />
          </div>

          {/* Action buttons */}
          {isOwner && (
            <div className="flex gap-3">
              <button onClick={onSetKeyPhoto} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm">Set as Key Photo</button>
              <button onClick={onRemove} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm">Remove</button>
            </div>
          )}
        </div>
      </div>

      {/* Right side - Memories pane */}
      <div className={`bg-white flex flex-col transition-all duration-300 ${showAddMemoryForm ? 'flex-1' : 'w-96'}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <h3 className="font-bold text-gray-900 text-lg">
            {showAddMemoryForm ? 'Add Memory' : <>Memories {memories.length > 0 && <span className="text-gray-500 font-normal">({memories.length})</span>}</>}
          </h3>
          {showAddMemoryForm ? (
            <button
              onClick={closeForm}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              &times;
            </button>
          ) : (
            <button
              onClick={handleAddMemoryClick}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1"
            >
              <span>+</span> Add
            </button>
          )}
        </div>

        {/* Add Memory Form (inline) */}
        {showAddMemoryForm ? (
          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleAddMemory} className="max-w-2xl mx-auto">
              {/* Type Tabs */}
              <div className="flex gap-3 mb-6">
                <button type="button" onClick={() => { setFormType('text'); setSelectedFile(null); setRecordedBlob(null); cleanupMediaStream(); }}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-colors ${formType === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  💬 Text
                </button>
                <button type="button" onClick={() => { setFormType('video'); setInputMode('record'); setSelectedFile(null); setRecordedBlob(null); cleanupMediaStream(); }}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-colors ${formType === 'video' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  🎥 Video
                </button>
                <button type="button" onClick={() => { setFormType('audio'); setSelectedFile(null); setRecordedBlob(null); cleanupMediaStream(); }}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-colors ${formType === 'audio' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  🎤 Audio
                </button>
              </div>

              {/* Content Input */}
              {formType === 'text' ? (
                <div className="mb-6">
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                    placeholder="Share a memory, thought, or story..."
                    className="w-full h-48 px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    autoFocus
                  />
                  <div className="text-right text-sm text-gray-500 mt-2">{textContent.length}/{MAX_TEXT_LENGTH}</div>
                </div>
              ) : (
                <div className="mb-6">
                  {/* Input Mode Toggle */}
                  <div className="flex gap-3 mb-4">
                    <button type="button" onClick={() => { setInputMode('file'); setRecordedBlob(null); cleanupMediaStream(); }}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${inputMode === 'file' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      📁 Upload File
                    </button>
                    <button type="button" onClick={() => { setInputMode('record'); setSelectedFile(null); }}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${inputMode === 'record' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {formType === 'video' ? '📹 Use Camera' : '🎙️ Use Microphone'}
                    </button>
                  </div>

                  {inputMode === 'file' ? (
                    <>
                      <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept={formType === 'video' ? 'video/*' : 'audio/*'} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className={`w-full py-12 border-2 border-dashed rounded-xl transition-colors text-center ${formType === 'audio' ? 'border-orange-400 hover:border-orange-500 hover:bg-orange-50' : 'border-purple-400 hover:border-purple-500 hover:bg-purple-50'}`}>
                        {selectedFile ? (
                          <div>
                            <div className="text-4xl mb-2">{formType === 'video' ? '🎥' : '🎤'}</div>
                            <p className="text-sm text-gray-900">{selectedFile.name}</p>
                            <p className="text-xs text-gray-500 mt-1">Click to change</p>
                          </div>
                        ) : (
                          <div>
                            <div className="text-4xl mb-2">📁</div>
                            <p className="text-sm text-gray-600">Click to select {formType === 'video' ? 'a video' : 'an audio file'}</p>
                            <p className="text-xs text-gray-400 mt-1">Max 30 seconds</p>
                          </div>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className={`rounded-xl border-2 ${formType === 'video' ? 'border-purple-300 bg-purple-50' : 'border-orange-300 bg-orange-50'} p-4`}>
                      {formType === 'video' && (
                        <div className="relative mb-4 rounded-xl overflow-hidden bg-black aspect-video">
                          <video ref={videoPreviewRef} muted playsInline className={`w-full h-full object-cover ${!mediaStream && !recordedBlob ? 'hidden' : ''}`} />
                          {recordedBlob && !mediaStream && <video src={URL.createObjectURL(recordedBlob)} controls className="w-full h-full object-cover" />}
                          {!mediaStream && !recordedBlob && <div className="absolute inset-0 flex items-center justify-center text-gray-500"><span className="text-5xl">📹</span></div>}
                          {isRecording && <div className="absolute top-3 right-3 bg-red-600 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1.5"><span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>REC {recordingTime}s</div>}
                        </div>
                      )}
                      {formType === 'audio' && (
                        <div className="mb-4">
                          {recordedBlob ? <audio src={URL.createObjectURL(recordedBlob)} controls className="w-full" /> : (
                            <div className="flex items-center justify-center py-8">
                              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`}>
                                <span className="text-2xl">{isRecording ? '🔴' : '🎤'}</span>
                              </div>
                              {isRecording && <span className="ml-4 text-lg font-mono text-gray-700">{recordingTime}s / 30s</span>}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        {!isRecording && !recordedBlob && (
                          <button type="button" onClick={startRecording} className={`flex-1 py-2 px-4 rounded-lg text-white text-sm font-medium transition-colors ${formType === 'video' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-orange-600 hover:bg-orange-700'}`}>Start Recording</button>
                        )}
                        {isRecording && <button type="button" onClick={stopRecording} className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">Stop Recording</button>}
                        {recordedBlob && !isRecording && <button type="button" onClick={discardRecording} className="flex-1 py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors">Discard & Re-record</button>}
                      </div>
                      <p className="text-xs text-gray-500 mt-3 text-center">Maximum recording length: 30 seconds</p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button type="button" onClick={closeForm} className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={submittingMemory || (formType === 'text' && !textContent.trim()) || ((formType === 'video' || formType === 'audio') && !selectedFile && !recordedBlob)}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {submittingMemory ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Posting...</>) : 'Post Memory'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Memories list */
          <div className="flex-1 overflow-y-auto p-4">
          {memoriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-5xl mb-4">💭</div>
              <p className="text-lg font-medium text-gray-700 mb-2">No memories yet</p>
              <p className="text-sm text-gray-500 mb-4">Share your thoughts about this photo</p>
              <button
                onClick={handleAddMemoryClick}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Add the first memory
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map((memory) => (
                <div key={memory.id} className="flex gap-3 group">
                  {memory.user.avatar_url ? (
                    <img src={memory.user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-medium">
                        {(memory.user.name || memory.user.email || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{memory.user.name || memory.user.email}</span>
                        <span className="text-xs text-gray-500">{formatTimeAgo(memory.created_at)}</span>
                      </div>
                      {/* Edit/Delete buttons for editors */}
                      {canManageMemory(memory) && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {memory.memory_type === 'text' && editingMemoryId !== memory.id && (
                            <button
                              onClick={() => handleEditMemory(memory)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => setDeletingMemoryId(memory.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Inline editing for text memories */}
                    {editingMemoryId === memory.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editMemoryText}
                          onChange={(e) => setEditMemoryText(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEditMemory}
                            disabled={memoryActionLoading || !editMemoryText.trim()}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm rounded-lg"
                          >
                            {memoryActionLoading ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingMemoryId(null); setEditMemoryText(''); }}
                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : memory.memory_type === 'text' ? (
                      <p className="text-gray-700">{memory.content_text}</p>
                    ) : memory.memory_type === 'image' ? (
                      <img src={memory.content_url || ''} alt="Memory" className="max-w-full rounded-lg cursor-pointer hover:opacity-90" onClick={() => window.open(memory.content_url || '', '_blank')} />
                    ) : memory.memory_type === 'video' ? (
                      <video src={memory.content_url || ''} controls className="max-w-full rounded-lg" />
                    ) : memory.memory_type === 'audio' ? (
                      <audio src={memory.content_url || ''} controls className="w-full" />
                    ) : null}
                    <div className="mt-2">
                      <ReactionBar targetId={memory.id} targetType="memory" compact />
                    </div>

                    {/* Delete confirmation */}
                    {deletingMemoryId === memory.id && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700 mb-2">Delete this memory?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteMemory(memory.id)}
                            disabled={memoryActionLoading}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm rounded-lg"
                          >
                            {memoryActionLoading ? 'Deleting...' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setDeletingMemoryId(null)}
                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Permission Request Dialog */}
      <PermissionRequestDialog
        isOpen={showPermissionDialog}
        onClose={() => setShowPermissionDialog(false)}
        albumId={albumId}
        albumTitle={albumTitle}
        currentRole={userRole}
        requestedPermission="add_memory"
      />
    </div>
  );
};

export const AdminAlbumDetail: React.FC = () => {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<Album | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareCircleId, setShareCircleId] = useState('');
  const [shareRole, setShareRole] = useState('read_only');
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [memoriesAssetId, setMemoriesAssetId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('read_only');

  // Selection mode state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [allAlbums, setAllAlbums] = useState<{ id: string; title: string }[]>([]);
  const [showCopyMoveModal, setShowCopyMoveModal] = useState<'copy' | 'move' | null>(null);
  const [targetAlbumId, setTargetAlbumId] = useState<string>('');
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const fetchAlbum = useCallback(async () => {
    if (!albumId) return;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login'); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?album_id=${albumId}`,
        { headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch album');

      setAlbum({ ...data.album, isOwner: data.isOwner, album_assets: data.assets });
      setEditedTitle(data.album.title);
      setUserRole(data.userRole || (data.isOwner ? 'owner' : 'read_only'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load album');
    } finally {
      setLoading(false);
    }
  }, [albumId, navigate]);

  const fetchCircles = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-circles-api`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` }, method: 'GET' }
      );
      const data = await response.json();
      if (data.circles) setCircles(data.circles);
    } catch (err) { console.error('Error fetching circles:', err); }
  };

  const loadMemoryCounts = useCallback(async () => {
    if (!album?.album_assets?.length) return;
    const counts = await memoriesApi.getMemoryCounts(album.album_assets.map(a => a.asset_id));
    setMemoryCounts(counts);
  }, [album?.album_assets]);

  useEffect(() => { fetchAlbum(); fetchCircles(); }, [fetchAlbum]);
  useEffect(() => { loadMemoryCounts(); }, [loadMemoryCounts]);

  const handleUpdateTitle = async () => {
    if (!album || !editedTitle.trim()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, title: editedTitle.trim() })
      });
      if (response.ok) {
        setAlbum({ ...album, title: editedTitle.trim() });
        setIsEditingTitle(false);
      }
    } catch (err) { console.error('Error updating title:', err); }
  };

  const handleShareAlbum = async () => {
    if (!album || !shareCircleId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=share`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, circle_ids: [shareCircleId], role: shareRole })
      });
      setShowShareForm(false);
      setShareCircleId('');
      fetchAlbum();
    } catch (err) { console.error('Error sharing album:', err); }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!confirm('Remove this share?')) return;
    try {
      const { data: shareData } = await supabase.from('album_shares').select('circle_id').eq('id', shareId).single();
      if (!shareData || !album) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const remainingCircleIds = album.album_shares?.filter(s => s.id !== shareId && s.is_active).map(s => s.circle_id) || [];
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=share`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, circle_ids: remainingCircleIds, role: 'read_only' })
      });
      fetchAlbum();
    } catch (err) { console.error('Error removing share:', err); }
  };

  const handleRemovePhoto = async (assetId: string) => {
    if (!album || !confirm('Remove this photo from the album?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?album_id=${album.id}&action=remove_photo`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId })
      });
      fetchAlbum();
    } catch (err) { console.error('Error removing photo:', err); }
  };

  const handleSetKeyPhoto = async (assetId: string) => {
    if (!album) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, keyphoto: assetId })
      });
      fetchAlbum();
    } catch (err) { console.error('Error setting key photo:', err); }
  };

  const contextMenuItems: ContextMenuItem[] = album?.isOwner ? [
    { label: 'Set as Key Photo', onClick: (asset) => handleSetKeyPhoto(asset.asset_id), color: 'blue' },
    { label: 'Remove from Album', onClick: (asset) => handleRemovePhoto(asset.asset_id), color: 'red' },
  ] : [];

  // Fetch all albums for copy/move
  const fetchAllAlbums = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` } }
      );
      const data = await response.json();
      if (data.albums) {
        setAllAlbums(data.albums.filter((a: { id: string }) => a.id !== albumId));
      }
    } catch (err) { console.error('Error fetching albums:', err); }
  };

  // Toggle asset selection
  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    if (selectedAssetIds.size === album?.album_assets?.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(album?.album_assets?.map(a => a.asset_id) || []));
    }
  };

  // Exit select mode
  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedAssetIds(new Set());
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedAssetIds.size === 0) return;
    if (!confirm(`Remove ${selectedAssetIds.size} photo(s) from this album?`)) return;

    try {
      setBulkActionLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      for (const assetId of selectedAssetIds) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?album_id=${album?.id}&action=remove_photo`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ asset_id: assetId })
        });
      }

      exitSelectMode();
      fetchAlbum();
    } catch (err) {
      console.error('Error deleting photos:', err);
      alert('Failed to delete some photos');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Open copy/move modal
  const openCopyMoveModal = (action: 'copy' | 'move') => {
    fetchAllAlbums();
    setShowCopyMoveModal(action);
    setTargetAlbumId('');
    setNewAlbumTitle('');
  };

  // Handle copy/move
  const handleCopyMove = async () => {
    if (selectedAssetIds.size === 0) return;
    if (!targetAlbumId && !newAlbumTitle.trim()) {
      alert('Please select an album or enter a new album name');
      return;
    }

    try {
      setBulkActionLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let destinationAlbumId = targetAlbumId;

      // Create new album if needed
      if (targetAlbumId === 'new' && newAlbumTitle.trim()) {
        const createResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newAlbumTitle.trim() })
        });
        const createData = await createResponse.json();
        if (!createResponse.ok) throw new Error(createData.error || 'Failed to create album');
        destinationAlbumId = createData.album.id;
      }

      // Add photos to destination album
      const assetIds = Array.from(selectedAssetIds);
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=add_photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: destinationAlbumId, asset_ids: assetIds })
      });

      // If moving, remove from current album
      if (showCopyMoveModal === 'move') {
        for (const assetId of selectedAssetIds) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?album_id=${album?.id}&action=remove_photo`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_id: assetId })
          });
        }
      }

      setShowCopyMoveModal(null);
      exitSelectMode();
      fetchAlbum();
      alert(`Successfully ${showCopyMoveModal === 'copy' ? 'copied' : 'moved'} ${selectedAssetIds.size} photo(s)`);
    } catch (err) {
      console.error('Error copying/moving photos:', err);
      alert('Failed to copy/move photos');
    } finally {
      setBulkActionLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  if (error || !album) return (
    <div className="text-center py-16">
      <div className="text-6xl mb-4">😕</div>
      <h3 className="text-xl font-bold text-gray-700 mb-2">Album Not Found</h3>
      <p className="text-gray-500 mb-4">{error}</p>
      <button onClick={() => navigate('/admin/albums')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Back to Albums</button>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/albums')} className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              {album.isOwner && isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)}
                    className="text-2xl font-bold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateTitle(); if (e.key === 'Escape') setIsEditingTitle(false); }}
                  />
                  <button onClick={handleUpdateTitle} className="p-1 text-green-600 hover:text-green-800">✓</button>
                  <button onClick={() => setIsEditingTitle(false)} className="p-1 text-red-600 hover:text-red-800">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{album.title}</h1>
                  {album.isOwner && (
                    <button onClick={() => { setEditedTitle(album.title); setIsEditingTitle(true); }} className="p-1 text-gray-400 hover:text-blue-600">✎</button>
                  )}
                </div>
              )}
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${album.isOwner ? 'bg-amber-100 text-amber-800' : getRoleColor(album.shared_via?.[0]?.role || 'read_only')}`}>
                {album.isOwner ? 'Owner' : (album.shared_via?.[0]?.role || 'read_only').replace('_', ' ')}
              </span>
            </div>
            {album.description && <p className="text-gray-600 mt-1">{album.description}</p>}
            {!album.isOwner && album.shared_via?.length && <p className="text-sm text-blue-600 mt-1">via {album.shared_via.map(s => s.circle_name).join(', ')}</p>}
          </div>
        </div>

        {album.isOwner && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowShareForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Share</button>
            <button onClick={() => setShowPhotoPicker(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Add from Library</button>
            <button onClick={() => setShowImageUploader(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Upload New</button>
          </div>
        )}
      </div>

      {/* Shared Circles */}
      {album.isOwner && album.album_shares?.filter(s => s.is_active).length ? (
        <div className="mb-6 bg-gray-50 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Shared with</h4>
          <div className="flex flex-wrap gap-2">
            {album.album_shares.filter(s => s.is_active).map(share => (
              <div key={share.id} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
                <span className="font-medium text-sm">{share.circles.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(share.role)}`}>{share.role.replace('_', ' ')}</span>
                <button onClick={() => handleRemoveShare(share.id)} className="text-red-500 hover:text-red-700 ml-1">×</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* View Toggle and Select Mode */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h4 className="font-semibold text-gray-900">Photos ({album.album_assets?.length || 0})</h4>
          {isSelectMode && (
            <div className="flex items-center gap-2">
              <button onClick={toggleSelectAll} className="text-sm text-blue-600 hover:text-blue-800">
                {selectedAssetIds.size === album.album_assets?.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-gray-500">
                {selectedAssetIds.size} selected
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {album.isOwner && (
            <button
              onClick={() => isSelectMode ? exitSelectMode() : setIsSelectMode(true)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${isSelectMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {isSelectMode ? 'Cancel' : 'Select'}
            </button>
          )}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewMode('grid')} className={`px-3 py-1 rounded text-sm font-medium ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>Grid</button>
            <button onClick={() => setViewMode('carousel')} className={`px-3 py-1 rounded text-sm font-medium ${viewMode === 'carousel' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>Carousel</button>
          </div>
        </div>
      </div>

      {/* Selection Action Bar */}
      {isSelectMode && selectedAssetIds.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">
            {selectedAssetIds.size} photo{selectedAssetIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openCopyMoveModal('copy')}
              disabled={bulkActionLoading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium flex items-center gap-1"
            >
              📋 Copy to...
            </button>
            <button
              onClick={() => openCopyMoveModal('move')}
              disabled={bulkActionLoading}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium flex items-center gap-1"
            >
              📦 Move to...
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkActionLoading}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium flex items-center gap-1"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {album.album_assets?.length ? (
          viewMode === 'grid' ? (
            <AlbumPhotoGrid
              assets={album.album_assets}
              onAssetClick={setSelectedAsset}
              contextMenuItems={contextMenuItems}
              memoryCounts={memoryCounts}
              onMemoryClick={(id) => setMemoriesAssetId(id)}
            />
          ) : (
            <div className="relative h-[70vh] bg-black rounded-lg overflow-hidden">
              {album.album_assets[carouselIndex] && (
                <>
                  {album.album_assets[carouselIndex].asset_type === 'video' ? (
                    <VideoPlayer src={getDisplayUrl(album.album_assets[carouselIndex]) || ''} className="w-full h-full object-contain" />
                  ) : (
                    <img src={getDisplayUrl(album.album_assets[carouselIndex]) || ''} alt="" className="w-full h-full object-contain" />
                  )}
                  {carouselIndex > 0 && (
                    <button onClick={() => setCarouselIndex(carouselIndex - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                  )}
                  {carouselIndex < album.album_assets.length - 1 && (
                    <button onClick={() => setCarouselIndex(carouselIndex + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  )}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">{carouselIndex + 1} / {album.album_assets.length}</div>
                </>
              )}
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 opacity-50">📷</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Photos Yet</h3>
            {album.isOwner && (
              <div className="flex justify-center gap-3 mt-4">
                <button onClick={() => setShowPhotoPicker(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Add from Library</button>
                <button onClick={() => setShowImageUploader(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg">Upload New</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Asset Modal with Inline Memories */}
      {selectedAsset && (
        <AssetModalWithMemories
          asset={selectedAsset}
          memoryCounts={memoryCounts}
          isOwner={album.isOwner || false}
          userRole={userRole}
          albumId={album.id}
          albumTitle={album.title}
          onClose={() => setSelectedAsset(null)}
          onSetKeyPhoto={() => { handleSetKeyPhoto(selectedAsset.asset_id); setSelectedAsset(null); }}
          onRemove={() => { handleRemovePhoto(selectedAsset.asset_id); setSelectedAsset(null); }}
          hasPrevious={(() => {
            const idx = album.album_assets?.findIndex(a => a.asset_id === selectedAsset.asset_id) ?? -1;
            return idx > 0;
          })()}
          hasNext={(() => {
            const idx = album.album_assets?.findIndex(a => a.asset_id === selectedAsset.asset_id) ?? -1;
            return idx >= 0 && idx < (album.album_assets?.length ?? 0) - 1;
          })()}
          onPrevious={() => {
            const idx = album.album_assets?.findIndex(a => a.asset_id === selectedAsset.asset_id) ?? -1;
            if (idx > 0 && album.album_assets) {
              setSelectedAsset(album.album_assets[idx - 1]);
            }
          }}
          onNext={() => {
            const idx = album.album_assets?.findIndex(a => a.asset_id === selectedAsset.asset_id) ?? -1;
            if (idx >= 0 && album.album_assets && idx < album.album_assets.length - 1) {
              setSelectedAsset(album.album_assets[idx + 1]);
            }
          }}
        />
      )}

      {/* Share Modal */}
      {showShareForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowShareForm(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Share Album</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Circle</label>
                <select value={shareCircleId} onChange={(e) => setShareCircleId(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                  <option value="">Choose a circle...</option>
                  {circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={shareRole} onChange={(e) => setShareRole(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                  <option value="read_only">View Only</option>
                  <option value="contributor">Contributor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowShareForm(false)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleShareAlbum} disabled={!shareCircleId} className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg">Share</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Picker */}
      {showPhotoPicker && (
        <PhotoPicker
          targetAlbumId={album.id}
          onPhotosAdded={() => { setShowPhotoPicker(false); fetchAlbum(); }}
          onClose={() => setShowPhotoPicker(false)}
        />
      )}

      {/* Image Uploader */}
      {showImageUploader && (
        <ImageUploader
          targetAlbumId={album.id}
          onImagesUploaded={() => { setShowImageUploader(false); fetchAlbum(); }}
          onClose={() => setShowImageUploader(false)}
        />
      )}

      {/* Memories Panel */}
      {memoriesAssetId && (
        <MemoriesPanel assetId={memoriesAssetId} onClose={() => { setMemoriesAssetId(null); loadMemoryCounts(); }} />
      )}
    </div>
  );
};

export default AdminAlbumDetail;
