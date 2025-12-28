import React, { useState, useRef } from 'react';

interface VideoPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  controls?: boolean;
  onError?: () => void;
}

// Detect video format from URL
const getVideoFormat = (url: string): string => {
  const extension = url.split('.').pop()?.toLowerCase().split('?')[0] || '';
  switch (extension) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'avi': return 'video/x-msvideo';
    case 'm4v': return 'video/x-m4v';
    case 'mkv': return 'video/x-matroska';
    default: return 'video/mp4';
  }
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  className = '',
  autoPlay = true,
  controls = true,
  onError,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isMovFile = src.toLowerCase().includes('.mov');
  const videoType = getVideoFormat(src);

  const handleError = () => {
    console.error('Video playback error for:', src);
    if (isMovFile) {
      setError('MOV format may not be supported in your browser. Try downloading the video instead.');
    } else {
      setError('Unable to play this video. The format may not be supported by your browser.');
    }
    setLoading(false);
    onError?.();
  };

  const handleLoadedData = () => {
    setLoading(false);
    setError(null);
  };

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black ${className}`}>
        <div className="text-6xl mb-4">🎬</div>
        <div className="text-white text-center px-4">
          <p className="mb-2">{error}</p>
          <a
            href={src}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Download Video
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-white">Loading video...</div>
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        controls={controls}
        autoPlay={autoPlay}
        playsInline
        className={className}
        onError={handleError}
        onLoadedData={handleLoadedData}
      >
        <source src={src} type={videoType} />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;
