import React from 'react';

interface JoinCircleSuccessProps {
  circleName: string;
  hasPromo: boolean;
  promoMessage: string | null;
}

export const JoinCircleSuccess: React.FC<JoinCircleSuccessProps> = ({
  circleName,
  hasPromo,
  promoMessage,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Welcome to {circleName}!</h1>
      <p className="text-gray-600 mb-6">
        You've been added to the circle. Download the Kizu app to view and share photos.
      </p>

      {hasPromo && promoMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-medium text-sm">{promoMessage}</p>
          <p className="text-green-600 text-xs mt-1">
            This will be automatically applied when you subscribe.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <a
          href="https://apps.apple.com/app/kizu/id6738030817"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gray-900 hover:bg-black text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          Download on the App Store
        </a>
        <a
          href="https://play.google.com/store/apps/details?id=com.knox.mediavault"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          Get it on Google Play
        </a>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Already have the app? Open it and sign in with your email.
      </p>
    </div>
  );
};
