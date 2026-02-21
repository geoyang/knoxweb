import React, { useState, useRef, useCallback, useEffect } from 'react';
import { memoriesApi, MemoryInput } from '../services/memoriesApi';

interface MemoryInputBarProps {
  assetId: string;
  parentMemoryId?: string;
  onMemoryAdded?: () => void;
  placeholder?: string;
  variant?: 'inline' | 'compact' | 'full';
  autoFocus?: boolean;
}

export const MemoryInputBar: React.FC<MemoryInputBarProps> = ({
  assetId,
  parentMemoryId,
  onMemoryAdded,
  placeholder = 'Add a memory...',
  variant = 'inline',
  autoFocus = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video' | 'audio'>('text');

  // Recording state
  const [inputMode, setInputMode] = useState<'text' | 'file' | 'record'>('text');
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const MAX_TEXT_LENGTH = 4000;
  const MAX_RECORDING_TIME = 30;

  const hasContent = text.trim().length > 0 || selectedFile !== null || recordedBlob !== null;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMediaMenu(false);
      }
    };
    if (showMediaMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMediaMenu]);

  // Attach media stream to video preview when available
  useEffect(() => {
    if (mediaStream && videoPreviewRef.current && (mediaType === 'video' || mediaType === 'image')) {
      videoPreviewRef.current.srcObject = mediaStream;
      videoPreviewRef.current.play().catch(err => {
        console.error('Failed to play video preview:', err);
      });
    }
  }, [mediaStream, mediaType, isRecording]);

  // Handle focus to scroll input into view on mobile
  const handleTextareaFocus = useCallback(() => {
    // Small delay to let the keyboard open first
    setTimeout(() => {
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, []);

  const cleanupMediaStream = useCallback(() => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, [mediaStream]);

  const handleExpand = () => {
    setIsExpanded(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleCollapse = () => {
    if (!hasContent) {
      setIsExpanded(false);
      setInputMode('text');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);

      if (file.type.startsWith('video/')) {
        setMediaType('video');
        setFilePreviewUrl(URL.createObjectURL(file));
      } else if (file.type.startsWith('audio/')) {
        setMediaType('audio');
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        setMediaType('image');
        // Check if HEIC/HEIF and convert for display
        const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
                       file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
        if (isHeic) {
          try {
            const heic2any = (await import('heic2any')).default;
            const jpegBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 }) as Blob;
            setFilePreviewUrl(URL.createObjectURL(jpegBlob));
          } catch (err) {
            console.error('Failed to convert HEIC:', err);
            // Fallback - try to display anyway (won't work in most browsers)
            setFilePreviewUrl(URL.createObjectURL(file));
          }
        } else {
          setFilePreviewUrl(URL.createObjectURL(file));
        }
      }
      setInputMode('file');
      setIsExpanded(true);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    setMediaType('text');
    setInputMode('text');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRecording = async (type: 'video' | 'audio' | 'image') => {
    try {
      const constraints: MediaStreamConstraints = type === 'audio'
        ? { audio: true }
        : { video: { facingMode: 'user' }, audio: type === 'video' };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setMediaStream(stream);
      setMediaType(type);
      setInputMode('record');
      setIsExpanded(true);

      // For still photos, we don't need MediaRecorder
      if (type === 'image') {
        setIsRecording(true);
        return;
      }

      const mimeType = type === 'video'
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
          if (prev >= MAX_RECORDING_TIME) {
            stopRecording();
            return MAX_RECORDING_TIME;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Error accessing media devices:', err);
      alert(`Could not access ${type === 'audio' ? 'microphone' : 'camera'}. Please check permissions.`);
    }
  };

  const capturePhoto = () => {
    if (videoPreviewRef.current && mediaStream) {
      const video = videoPreviewRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            setRecordedBlob(blob);
            setIsRecording(false);
            cleanupMediaStream();
          }
        }, 'image/jpeg', 0.9);
      }
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
    setInputMode('text');
    setMediaType('text');
    cleanupMediaStream();
  };

  const handleSubmit = async () => {
    if (!hasContent || submitting) return;

    try {
      setSubmitting(true);

      let input: MemoryInput;

      if (selectedFile || recordedBlob) {
        let fileToUpload: File;
        if (recordedBlob) {
          const extension = mediaType === 'video' ? 'webm' : 'webm';
          const filename = `recorded_${mediaType}_${Date.now()}.${extension}`;
          fileToUpload = new File([recordedBlob], filename, { type: recordedBlob.type });
        } else {
          fileToUpload = selectedFile!;
        }

        const uploadResult = await memoriesApi.uploadMemoryMedia(fileToUpload, assetId, mediaType as 'image' | 'video' | 'audio');
        if (!uploadResult) {
          throw new Error('Failed to upload file');
        }

        input = {
          memory_type: mediaType,
          content_url: uploadResult.url,
          thumbnail_url: uploadResult.thumbnailUrl,
          content_text: text.trim() || undefined,
        };
      } else {
        input = {
          memory_type: 'text',
          content_text: text.trim(),
        };
      }

      let result;
      if (parentMemoryId) {
        result = await memoriesApi.addReply(parentMemoryId, input);
      } else {
        result = await memoriesApi.addMemory(assetId, input);
      }

      if (result.success) {
        // Reset form
        setText('');
        handleRemoveFile();
        discardRecording();
        setIsExpanded(false);
        onMemoryAdded?.();
      } else {
        throw new Error(result.error || 'Failed to add memory');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add memory');
    } finally {
      setSubmitting(false);
    }
  };

  // Compact variant - just a clickable bar
  if (variant === 'compact' && !isExpanded) {
    return (
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
      >
        <span className="text-lg">+</span>
        <span className="text-sm">{placeholder}</span>
      </button>
    );
  }

  // Inline variant - always shows input
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${
      variant === 'full' ? 'p-4' : ''
    }`}>
      {/* Media Preview */}
      {(selectedFile || recordedBlob || isRecording) && (
        <div className="p-3 border-b border-gray-100 bg-gray-50">
          {/* Image preview */}
          {selectedFile && mediaType === 'image' && filePreviewUrl && (
            <div className="relative inline-block">
              <img src={filePreviewUrl} alt="Preview" className="max-h-32 rounded-lg" />
              <button
                onClick={handleRemoveFile}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm"
              >
                x
              </button>
            </div>
          )}

          {/* Camera photo capture */}
          {(mediaType === 'image' && (isRecording || recordedBlob) && !selectedFile) && (
            <div className="relative">
              {isRecording && mediaStream ? (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-h-48">
                  <video
                    ref={videoPreviewRef}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : recordedBlob ? (
                <div className="relative inline-block">
                  <img
                    src={URL.createObjectURL(recordedBlob)}
                    alt="Captured"
                    className="max-h-48 rounded-lg"
                  />
                  <button
                    onClick={discardRecording}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm"
                  >
                    x
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Video recording/preview */}
          {(mediaType === 'video' && (isRecording || recordedBlob)) && (
            <div className="relative">
              {isRecording && mediaStream ? (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-h-48">
                  <video
                    ref={videoPreviewRef}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    REC {recordingTime}s
                  </div>
                </div>
              ) : recordedBlob ? (
                <div className="relative">
                  <video
                    src={URL.createObjectURL(recordedBlob)}
                    controls
                    className="max-h-48 rounded-lg"
                  />
                  <button
                    onClick={discardRecording}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm"
                  >
                    x
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Audio recording/preview */}
          {(mediaType === 'audio' && (isRecording || recordedBlob)) && (
            <div className="flex items-center gap-3">
              {isRecording ? (
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-white">🎤</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-red-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${(recordingTime / MAX_RECORDING_TIME) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 mt-1">{recordingTime}s / {MAX_RECORDING_TIME}s</span>
                  </div>
                </div>
              ) : recordedBlob ? (
                <div className="flex items-center gap-3 flex-1">
                  <audio src={URL.createObjectURL(recordedBlob)} controls className="flex-1" />
                  <button
                    onClick={discardRecording}
                    className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm"
                  >
                    x
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Video file preview */}
          {selectedFile && mediaType === 'video' && filePreviewUrl && (
            <div className="relative inline-block">
              <video src={filePreviewUrl} controls className="max-h-32 rounded-lg" />
              <button
                onClick={handleRemoveFile}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm"
              >
                x
              </button>
            </div>
          )}

          {/* Recording controls */}
          {isRecording && (
            <div className="flex justify-center mt-3 gap-3">
              {mediaType === 'image' ? (
                <>
                  <button
                    onClick={discardRecording}
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={capturePhoto}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <i className="fi fi-sr-camera mr-2"></i>
                    Capture Photo
                  </button>
                </>
              ) : (
                <button
                  onClick={stopRecording}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  Stop Recording
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-center gap-1.5 p-2">
        {/* Media button with menu */}
        <div className="relative" ref={menuRef}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              handleFileSelect(e);
              setShowMediaMenu(false);
            }}
            accept="image/*,video/*,audio/*"
            className="hidden"
          />
          <button
            ref={buttonRef}
            onClick={() => {
              if (!showMediaMenu && buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setMenuPosition({
                  top: rect.top - 8,
                  left: rect.left
                });
              }
              setShowMediaMenu(!showMediaMenu);
            }}
            disabled={isRecording || submitting}
            className={`w-7 h-7 flex items-center justify-center rounded-full transition-all ${
              showMediaMenu
                ? 'bg-indigo-600 text-white rotate-45'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            } disabled:opacity-50`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Media menu popover - fixed positioning to escape overflow */}
          {showMediaMenu && (
            <div
              className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px]"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                transform: 'translateY(-100%)'
              }}
            >
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <i className="fi fi-sr-picture text-blue-500"></i>
                Photo Library
              </button>
              <button
                onClick={() => {
                  setShowMediaMenu(false);
                  startRecording('image');
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <i className="fi fi-sr-camera text-green-500"></i>
                Take Photo
              </button>
              <button
                onClick={() => {
                  setShowMediaMenu(false);
                  startRecording('video');
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <i className="fi fi-sr-video-camera-alt text-purple-500"></i>
                Record Video
              </button>
              <button
                onClick={() => {
                  setShowMediaMenu(false);
                  startRecording('audio');
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <i className="fi fi-sr-microphone text-orange-500"></i>
                Record Audio
              </button>
            </div>
          )}
        </div>

        {/* Text input */}
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
            onFocus={() => {
              setIsExpanded(true);
              handleTextareaFocus();
            }}
            onBlur={handleCollapse}
            placeholder={placeholder}
            disabled={submitting}
            autoFocus={autoFocus}
            rows={1}
            className="w-full px-3 py-1.5 bg-gray-100 rounded-full resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all text-sm text-gray-900 placeholder-gray-500 disabled:opacity-50"
            style={{ minHeight: '32px', maxHeight: '80px' }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!hasContent || submitting || isRecording}
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
            hasContent && !submitting && !isRecording
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
              : 'bg-gray-200 text-gray-400'
          }`}
        >
          {submitting ? (
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default MemoryInputBar;
