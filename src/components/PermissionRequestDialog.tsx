import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface PermissionRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  albumId: string;
  albumTitle: string;
  currentRole: string;
  requestedPermission: 'add_memory' | 'add_photo' | 'edit' | 'admin';
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  read_only: 'View Only',
  contributor: 'Contributor',
  editor: 'Editor',
  admin: 'Admin',
};

const PERMISSION_DESCRIPTIONS: Record<string, { title: string; requiredRole: string; description: string }> = {
  add_memory: {
    title: 'Add Memories',
    requiredRole: 'contributor',
    description: 'Adding memories to photos requires Contributor access or higher.',
  },
  add_photo: {
    title: 'Add Photos',
    requiredRole: 'contributor',
    description: 'Adding photos to this album requires Contributor access or higher.',
  },
  edit: {
    title: 'Edit Album',
    requiredRole: 'editor',
    description: 'Editing album details requires Editor access or higher.',
  },
  admin: {
    title: 'Admin Access',
    requiredRole: 'admin',
    description: 'This action requires Admin access.',
  },
};

export const PermissionRequestDialog: React.FC<PermissionRequestDialogProps> = ({
  isOpen,
  onClose,
  albumId,
  albumTitle,
  currentRole,
  requestedPermission,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const permissionInfo = PERMISSION_DESCRIPTIONS[requestedPermission];
  const currentRoleDisplay = ROLE_DISPLAY_NAMES[currentRole] || currentRole;
  const requiredRoleDisplay = ROLE_DISPLAY_NAMES[permissionInfo.requiredRole] || permissionInfo.requiredRole;

  const handleRequestPermission = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to request permissions');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=request_permission`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            album_id: albumId,
            requested_role: permissionInfo.requiredRole,
            permission_type: requestedPermission,
            message: message.trim() || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send permission request');
      }

      setRequestSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[60]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          {requestSent ? (
            // Success state
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Request Sent!</h3>
              <p className="text-gray-600 mb-6">
                The album owner and administrators have been notified of your request. You'll receive an email when your access is updated.
              </p>
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            // Request form
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Permission Required</h3>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{permissionInfo.title}</h4>
                    <p className="text-sm text-gray-500">{permissionInfo.description}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Album:</span>
                    <span className="text-sm font-medium text-gray-900">{albumTitle}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Your current role:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      currentRole === 'read_only' ? 'bg-gray-100 text-gray-800' :
                      currentRole === 'contributor' ? 'bg-green-100 text-green-800' :
                      currentRole === 'editor' ? 'bg-blue-100 text-blue-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {currentRoleDisplay}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Required role:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      permissionInfo.requiredRole === 'contributor' ? 'bg-green-100 text-green-800' :
                      permissionInfo.requiredRole === 'editor' ? 'bg-blue-100 text-blue-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {requiredRoleDisplay}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message (optional)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Add a note to your request..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestPermission}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending...
                    </>
                  ) : (
                    'Request Access'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default PermissionRequestDialog;
