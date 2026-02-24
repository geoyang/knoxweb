import React from 'react';

interface StartCircleJoinFormProps {
  fullName: string;
  email: string;
  submitting: boolean;
  error: string | null;
  circleName: string;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const StartCircleJoinForm: React.FC<StartCircleJoinFormProps> = ({
  fullName,
  email,
  submitting,
  error,
  circleName,
  onFullNameChange,
  onEmailChange,
  onSubmit,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Join {circleName}</h1>
        <p className="text-gray-600 mt-2">
          Enter your details to join this circle
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
            placeholder="Enter your full name"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg text-gray-900 placeholder-gray-400 bg-white"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="your.email@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg text-gray-900 placeholder-gray-400 bg-white"
            required
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !fullName.trim() || !email.trim()}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Joining...' : 'Join Circle'}
        </button>
      </form>
    </div>
  );
};
