import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { MediaGallery } from '../MediaGallery';

export const ImagesManager: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAssetId = searchParams.get('assetId') || undefined;

  const handleAssetConsumed = () => {
    if (searchParams.has('assetId')) {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className="p-4">
      <MediaGallery initialAssetId={initialAssetId} onInitialAssetConsumed={handleAssetConsumed} />
    </div>
  );
};
