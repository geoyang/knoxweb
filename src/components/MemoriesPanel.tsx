import React, { useState, useEffect, useCallback, useRef } from 'react';
import { memoriesApi, Memory, MemoryInput } from '../services/memoriesApi';

interface MemoriesPanelProps {
  assetId: string;
  canAddMemory?: boolean;
  onClose: () => void;
  onMemoriesUpdated?: () => void;
}

export const MemoriesPanel: React.FC<MemoriesPanelProps> = ({
  assetId,
  canAddMemory = true,
  onClose,
  onMemoriesUpdated,
}) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  // Add memory form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [replyToMemoryId, setReplyToMemoryId] = useState<string | null>(null);
  const [formType, setFormType] = useState<'text' | 'image' | 'video' | 'audio'>('text');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit memory state
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Camera/microphone recording state
  const [inputMode, setInputMode] = useState<'file' | 'record'>('file');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_TEXT_LENGTH = 4000;

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await memoriesApi.getMemories(assetId);
      if (result.success && result.data) {
        setMemories(result.data.memories);
      } else {
        setError(result.error || 'Failed to load memories');
      }
    } catch (err) {
      setError('Failed to load memories');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const formatDate = (dateString: string) => {
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

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;

    const result = await memoriesApi.deleteMemory(memoryId);
    if (result.success) {
      loadMemories();
      onMemoriesUpdated?.();
    } else {
      alert(result.error || 'Failed to delete memory');
    }
  };

  const handleStartEdit = (memory: Memory) => {
    if (memory.memory_type === 'text') {
      setEditingMemoryId(memory.id);
      setEditText(memory.content_text || '');
    }
  };

  const handleCancelEdit = () => {
    setEditingMemoryId(null);
    setEditText('');
  };

  const handleSaveEdit = async (memoryId: string) => {
    if (!editText.trim()) {
      alert('Memory text cannot be empty');
      return;
    }

    const result = await memoriesApi.editMemory(memoryId, { content_text: editText.trim() });
    if (result.success) {
      setEditingMemoryId(null);
      setEditText('');
      loadMemories();
      onMemoriesUpdated?.();
    } else {
      alert(result.error || 'Failed to save changes');
    }
  };

  const toggleReplies = (memoryId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(memoryId)) {
        next.delete(memoryId);
      } else {
        next.add(memoryId);
      }
      return next;
    });
  };

  const openReplyForm = (memoryId: string) => {
    setReplyToMemoryId(memoryId);
    setShowAddForm(true);
    setFormType('text');
    setTextContent('');
    setSelectedFile(null);
  };

  const openAddForm = () => {
    setReplyToMemoryId(null);
    setShowAddForm(true);
    setFormType('text');
    setTextContent('');
    setSelectedFile(null);
  };

  const closeForm = () => {
    stopRecording();
    cleanupMediaStream();
    setShowAddForm(false);
    setReplyToMemoryId(null);
    setTextContent('');
    setSelectedFile(null);
    setInputMode('file');
    setRecordedBlob(null);
    setRecordingTime(0);
  };

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
      if (isAudio) {
        setFormType('audio');
      } else if (isVideo) {
        setFormType('video');
      } else {
        setFormType('image');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formType === 'text' && !textContent.trim()) {
      alert('Please enter some text');
      return;
    }

    const hasMedia = selectedFile || recordedBlob;
    if ((formType === 'image' || formType === 'video' || formType === 'audio') && !hasMedia) {
      alert('Please select or record a file');
      return;
    }

    try {
      setSubmitting(true);

      let input: MemoryInput;

      if (formType === 'text') {
        input = {
          memory_type: 'text',
          content_text: textContent.trim(),
        };
      } else {
        // Convert recorded blob to File if needed
        let fileToUpload: File;
        if (recordedBlob) {
          const extension = formType === 'video' ? 'webm' : 'webm';
          const filename = `recorded_${formType}_${Date.now()}.${extension}`;
          fileToUpload = new File([recordedBlob], filename, { type: recordedBlob.type });
        } else {
          fileToUpload = selectedFile!;
        }

        // Upload file first
        const uploadResult = await memoriesApi.uploadMemoryMedia(
          fileToUpload,
          assetId,
          formType
        );

        if (!uploadResult) {
          throw new Error('Failed to upload file');
        }

        input = {
          memory_type: formType,
          content_url: uploadResult.url,
          thumbnail_url: uploadResult.thumbnailUrl,
        };
      }

      let result;
      if (replyToMemoryId) {
        result = await memoriesApi.addReply(replyToMemoryId, input);
      } else {
        result = await memoriesApi.addMemory(assetId, input);
      }

      if (result.success) {
        closeForm();
        loadMemories();
        onMemoriesUpdated?.();
      } else {
        throw new Error(result.error || 'Failed to add memory');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add memory');
    } finally {
      setSubmitting(false);
    }
  };

  const renderMemoryContent = (memory: Memory) => {
    const isEditing = editingMemoryId === memory.id;

    switch (memory.memory_type) {
      case 'text':
        if (isEditing) {
          return (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                autoFocus
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-500">{editText.length}/{MAX_TEXT_LENGTH}</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 text-sm text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveEdit(memory.id)}
                    className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          );
        }
        return <p className="text-gray-700 whitespace-pre-wrap">{memory.content_text}</p>;

      case 'image':
        return (
          <img
            src={memory.content_url || ''}
            alt="Memory"
            className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(memory.content_url || '', '_blank')}
          />
        );

      case 'video':
        return (
          <div className="relative">
            <video
              src={memory.content_url || ''}
              controls
              className="max-w-full rounded-lg"
            />
            {memory.duration && (
              <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {memory.duration}s
              </span>
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white">🎤</span>
              </div>
              <div className="flex-1">
                <audio
                  src={memory.content_url || ''}
                  controls
                  className="w-full h-8"
                />
              </div>
              {memory.duration && (
                <span className="text-orange-600 text-sm font-medium">
                  {memory.duration}s
                </span>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderReply = (reply: Memory) => (
    <div key={reply.id} className="flex gap-3 ml-8 mt-3 pt-3 border-t border-gray-100">
      {reply.user.avatar_url ? (
        <img
          src={reply.user.avatar_url}
          alt=""
          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-gray-500 text-sm font-medium">
            {(reply.user.name || reply.user.email || '?').charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-gray-900">
            {reply.user.name || reply.user.email}
          </span>
          <span className="text-xs text-gray-500">{formatDate(reply.created_at)}</span>
        </div>
        <div className="text-sm">{renderMemoryContent(reply)}</div>
        <div className="flex items-center gap-3 mt-2">
          {reply.memory_type === 'text' && canAddMemory && (
            <button
              onClick={() => handleStartEdit(reply)}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => handleDeleteMemory(reply.id)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  const renderMemory = (memory: Memory) => {
    const hasReplies = memory.replies && memory.replies.length > 0;
    const isExpanded = expandedReplies.has(memory.id);

    return (
      <div key={memory.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
        {/* Memory Header */}
        <div className="flex items-start gap-3">
          {memory.user.avatar_url ? (
            <img
              src={memory.user.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 font-medium">
                {(memory.user.name || memory.user.email || '?').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-gray-900">
                {memory.user.name || memory.user.email}
              </span>
              <span className="text-sm text-gray-500">{formatDate(memory.created_at)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                memory.memory_type === 'text' ? 'bg-gray-100 text-gray-600' :
                memory.memory_type === 'image' ? 'bg-blue-100 text-blue-600' :
                memory.memory_type === 'audio' ? 'bg-orange-100 text-orange-600' :
                'bg-purple-100 text-purple-600'
              }`}>
                {memory.memory_type === 'text' ? '💬' :
                 memory.memory_type === 'image' ? '🖼️' :
                 memory.memory_type === 'audio' ? '🎤' : '🎥'}
              </span>
            </div>
            <div className="mt-2">{renderMemoryContent(memory)}</div>

            {/* Actions */}
            <div className="flex items-center gap-4 mt-3 text-sm">
              {canAddMemory && (
                <button
                  onClick={() => openReplyForm(memory.id)}
                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <span>↩️</span> Reply
                </button>
              )}
              {hasReplies && (
                <button
                  onClick={() => toggleReplies(memory.id)}
                  className="text-gray-600 hover:text-gray-800 flex items-center gap-1"
                >
                  {isExpanded ? '🔼' : '🔽'} {memory.replies!.length} {memory.replies!.length === 1 ? 'Reply' : 'Replies'}
                </button>
              )}
              {memory.memory_type === 'text' && canAddMemory && (
                <button
                  onClick={() => handleStartEdit(memory)}
                  className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                >
                  ✏️ Edit
                </button>
              )}
              <button
                onClick={() => handleDeleteMemory(memory.id)}
                className="text-red-500 hover:text-red-700 ml-auto"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>

        {/* Replies */}
        {hasReplies && isExpanded && (
          <div className="mt-2">
            {memory.replies!.map(renderReply)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white rounded-t-xl">
          <h2 className="text-xl font-bold text-gray-900">Memories</h2>
          <div className="flex items-center gap-3">
            {canAddMemory && (
              <button
                onClick={openAddForm}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <span>➕</span> Add Memory
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 mb-2">⚠️</div>
              <p className="text-gray-600">{error}</p>
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">💭</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No memories yet</h3>
              <p className="text-gray-500 mb-4">Be the first to share a memory about this photo!</p>
              {canAddMemory && (
                <button
                  onClick={openAddForm}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Add Memory
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map(renderMemory)}
            </div>
          )}
        </div>

        {/* Add Memory Form Modal */}
        {showAddForm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {replyToMemoryId ? 'Add Reply' : 'Add Memory'}
              </h3>

              <form onSubmit={handleSubmit}>
                {/* Type Tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => { setFormType('text'); setSelectedFile(null); setRecordedBlob(null); cleanupMediaStream(); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      formType === 'text'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    💬 Text
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormType('video'); setSelectedFile(null); setRecordedBlob(null); cleanupMediaStream(); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      formType === 'video'
                        ? 'bg-purple-100 text-purple-700 border border-purple-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    🎥 Video
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormType('audio'); setSelectedFile(null); setRecordedBlob(null); cleanupMediaStream(); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      formType === 'audio'
                        ? 'bg-orange-100 text-orange-700 border border-orange-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    🎤 Audio
                  </button>
                </div>

                {/* Content Input */}
                {formType === 'text' ? (
                  <div className="mb-4">
                    <textarea
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                      placeholder="Share a memory, thought, or story..."
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                    <div className="text-right text-xs text-gray-500 mt-1">
                      {textContent.length}/{MAX_TEXT_LENGTH}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    {/* Input Mode Toggle for video/audio */}
                    {(formType === 'video' || formType === 'audio') && (
                      <div className="flex gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => { setInputMode('file'); setRecordedBlob(null); cleanupMediaStream(); }}
                          className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors ${
                            inputMode === 'file'
                              ? 'bg-gray-700 text-white'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          Upload File
                        </button>
                        <button
                          type="button"
                          onClick={() => { setInputMode('record'); setSelectedFile(null); }}
                          className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors ${
                            inputMode === 'record'
                              ? 'bg-gray-700 text-white'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {formType === 'video' ? 'Use Camera' : 'Use Microphone'}
                        </button>
                      </div>
                    )}

                    {inputMode === 'file' ? (
                      <>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                          accept={formType === 'video' ? 'video/*' : formType === 'audio' ? 'audio/*' : 'image/*'}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`w-full py-8 border-2 border-dashed rounded-lg transition-colors text-center ${
                            formType === 'audio'
                              ? 'border-orange-300 hover:border-orange-400 hover:bg-orange-50'
                              : formType === 'video'
                              ? 'border-purple-300 hover:border-purple-400 hover:bg-purple-50'
                              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                          }`}
                        >
                          {selectedFile ? (
                            <div>
                              <div className="text-2xl mb-2">
                                {formType === 'video' ? '🎥' : formType === 'audio' ? '🎤' : '🖼️'}
                              </div>
                              <p className="text-sm text-gray-600">{selectedFile.name}</p>
                              <p className="text-xs text-gray-400 mt-1">Click to change</p>
                            </div>
                          ) : (
                            <div>
                              <div className="text-2xl mb-2">📁</div>
                              <p className="text-sm text-gray-600">
                                Click to select {formType === 'video' ? 'a video' : formType === 'audio' ? 'an audio file' : 'an image'}
                              </p>
                              {(formType === 'video' || formType === 'audio') && (
                                <p className="text-xs text-gray-400 mt-1">Max 30 seconds</p>
                              )}
                            </div>
                          )}
                        </button>
                      </>
                    ) : (
                      /* Recording Mode */
                      <div className={`rounded-lg border-2 ${
                        formType === 'video' ? 'border-purple-300 bg-purple-50' : 'border-orange-300 bg-orange-50'
                      } p-4`}>
                        {formType === 'video' && (
                          <div className="relative mb-3 rounded-lg overflow-hidden bg-black aspect-video">
                            <video
                              ref={videoPreviewRef}
                              muted
                              playsInline
                              className={`w-full h-full object-cover ${!mediaStream && !recordedBlob ? 'hidden' : ''}`}
                            />
                            {recordedBlob && !mediaStream && (
                              <video
                                src={URL.createObjectURL(recordedBlob)}
                                controls
                                className="w-full h-full object-cover"
                              />
                            )}
                            {!mediaStream && !recordedBlob && (
                              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                <span className="text-4xl">📹</span>
                              </div>
                            )}
                            {isRecording && (
                              <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                                REC {recordingTime}s
                              </div>
                            )}
                          </div>
                        )}

                        {formType === 'audio' && (
                          <div className="mb-3">
                            {recordedBlob ? (
                              <audio
                                src={URL.createObjectURL(recordedBlob)}
                                controls
                                className="w-full"
                              />
                            ) : (
                              <div className="flex items-center justify-center py-6">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-orange-200'
                                }`}>
                                  <span className="text-2xl">{isRecording ? '🔴' : '🎤'}</span>
                                </div>
                                {isRecording && (
                                  <span className="ml-3 text-lg font-mono">{recordingTime}s / 30s</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          {!isRecording && !recordedBlob && (
                            <button
                              type="button"
                              onClick={startRecording}
                              className={`flex-1 py-2 px-4 rounded-lg text-white font-medium transition-colors ${
                                formType === 'video' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-orange-600 hover:bg-orange-700'
                              }`}
                            >
                              Start Recording
                            </button>
                          )}
                          {isRecording && (
                            <button
                              type="button"
                              onClick={stopRecording}
                              className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                            >
                              Stop Recording
                            </button>
                          )}
                          {recordedBlob && !isRecording && (
                            <>
                              <button
                                type="button"
                                onClick={discardRecording}
                                className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
                              >
                                Discard
                              </button>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">Max 30 seconds</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || (formType === 'text' && !textContent.trim()) || ((formType === 'image' || formType === 'video' || formType === 'audio') && !selectedFile && !recordedBlob)}
                    className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Posting...</span>
                      </>
                    ) : (
                      <span>Post</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
