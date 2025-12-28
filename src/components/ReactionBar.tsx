import React, { useState, useEffect, useCallback } from 'react';
import {
  reactionsApi,
  EMOJI_MAP,
  EMOJI_LABELS,
  EMOJI_CODES,
  type ReactionSummary,
  type Reaction,
  type EmojiCode,
  type TargetType,
} from '../services/reactionsApi';

interface ReactionBarProps {
  targetId: string;
  targetType: TargetType;
  onReactionChange?: () => void;
  compact?: boolean;
  className?: string;
  addButtonOnly?: boolean;
  hideAddButton?: boolean;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
  targetId,
  targetType,
  onReactionChange,
  compact = false,
  className = '',
  addButtonOnly = false,
  hideAddButton = false,
}) => {
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [reactionDetails, setReactionDetails] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadReactions = useCallback(async () => {
    setIsLoading(true);
    const data = await reactionsApi.getReactions(targetId, targetType);
    setReactions(data.summary);
    setReactionDetails(data.details);
    setIsLoading(false);
  }, [targetId, targetType]);

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

  const handleShowDetails = (emoji?: string) => {
    setSelectedEmoji(emoji || null);
    setShowDetailsModal(true);
  };

  const filteredDetails = selectedEmoji
    ? reactionDetails.filter((r) => r.emoji === selectedEmoji)
    : reactionDetails;

  useEffect(() => {
    loadReactions();
  }, [loadReactions]);

  const handleToggleReaction = async (emoji: EmojiCode) => {
    const existingReaction = reactions.find(
      (r) => r.emoji === emoji && r.hasReacted
    );

    // Optimistic update
    setReactions((prev) => {
      const updated = prev.map((r) => {
        if (r.emoji === emoji) {
          return {
            ...r,
            count: r.hasReacted ? r.count - 1 : r.count + 1,
            hasReacted: !r.hasReacted,
            reactionId: r.hasReacted ? null : 'temp',
          };
        }
        return r;
      }).filter((r) => r.count > 0 || r.hasReacted);

      // If adding a new emoji that didn't exist before
      if (!existingReaction && !prev.find((r) => r.emoji === emoji)) {
        return [
          ...updated,
          {
            emoji,
            emojiChar: EMOJI_MAP[emoji],
            count: 1,
            hasReacted: true,
            reactionId: 'temp',
          },
        ];
      }

      return updated;
    });

    // Make the API call
    await reactionsApi.toggleReaction(
      targetId,
      targetType,
      emoji,
      existingReaction?.reactionId || null
    );

    // Reload to get accurate state
    await loadReactions();
    onReactionChange?.();
    setShowPicker(false);
  };

  const selectedEmojis = reactions
    .filter((r) => r.hasReacted)
    .map((r) => r.emoji);

  // Add button component - Flaticon smile-plus icon (yellow) with emoji fallback
  const addButton = (
    <button
      onClick={() => setShowPicker(!showPicker)}
      className={`
        transition-transform hover:scale-110
        ${compact ? 'text-lg' : 'text-xl'}
      `}
      style={{ color: '#F4C430' }}
      title="Add reaction"
    >
      <i className="fi fi-sr-smile-plus" aria-hidden="true"></i>
      <span className="sr-only">Add reaction</span>
    </button>
  );

  if (isLoading) {
    return (
      <div className={`flex items-center ${className}`}>
        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Picker modal component
  const pickerModal = showPicker && (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setShowPicker(false)}
      />

      {/* Picker */}
      <div className="absolute left-0 bottom-full mb-2 z-50 bg-white rounded-lg shadow-lg border p-3 min-w-[280px]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Add Reaction</span>
          <button
            onClick={() => setShowPicker(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {EMOJI_CODES.map((code) => {
            const isSelected = selectedEmojis.includes(code);
            return (
              <button
                key={code}
                onClick={() => handleToggleReaction(code)}
                className={`
                  flex flex-col items-center justify-center p-2 rounded-lg transition-colors
                  ${
                    isSelected
                      ? 'bg-blue-100 ring-2 ring-blue-400'
                      : 'hover:bg-gray-100'
                  }
                `}
                title={EMOJI_LABELS[code]}
              >
                <span className="text-xl">{EMOJI_MAP[code]}</span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1"></span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mt-2 text-center">
          Tap to add or remove
        </p>
      </div>
    </>
  );

  // If addButtonOnly, just render the add button and picker
  if (addButtonOnly) {
    return (
      <div className={`relative ${className}`}>
        {addButton}
        {pickerModal}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!hideAddButton && addButton}

        {reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            onClick={() => handleToggleReaction(reaction.emoji)}
            onContextMenu={(e) => {
              e.preventDefault();
              handleShowDetails(reaction.emoji);
            }}
            title="Click to react, right-click to see who reacted"
            className={`
              flex items-center gap-0.5 text-sm transition-colors hover:opacity-70
              ${compact ? 'text-xs' : ''}
              ${reaction.hasReacted ? 'text-blue-600' : 'text-gray-600'}
            `}
          >
            <span className={compact ? 'text-sm' : 'text-base'}>{reaction.emojiChar}</span>
            <span className="font-medium">{reaction.count}</span>
          </button>
        ))}

        {/* View all reactions button */}
        {reactions.length > 0 && (
          <button
            onClick={() => handleShowDetails()}
            className={`
              flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors
              ${compact ? 'text-xs' : 'text-sm'}
            `}
            title="See who reacted"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Reaction Picker Popover */}
      {pickerModal}

      {/* Reaction Details Modal */}
      {showDetailsModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowDetailsModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[70vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedEmoji
                    ? `${EMOJI_MAP[selectedEmoji as EmojiCode] || selectedEmoji} Reactions`
                    : 'All Reactions'}
                </h3>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Filter tabs */}
              {reactionDetails.length > 0 && (
                <div className="flex gap-2 px-4 py-2 border-b overflow-x-auto">
                  <button
                    onClick={() => setSelectedEmoji(null)}
                    className={`
                      px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                      ${!selectedEmoji ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                    `}
                  >
                    All ({reactionDetails.length})
                  </button>
                  {reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      onClick={() => setSelectedEmoji(reaction.emoji)}
                      className={`
                        flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                        ${selectedEmoji === reaction.emoji ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                      `}
                    >
                      <span>{reaction.emojiChar}</span>
                      <span>{reaction.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Reactions list */}
              <div className="flex-1 overflow-y-auto p-4">
                {filteredDetails.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No reactions yet</p>
                ) : (
                  <div className="space-y-3">
                    {filteredDetails.map((detail) => (
                      <div key={detail.id} className="flex items-center gap-3">
                        {detail.user.avatar_url ? (
                          <img
                            src={detail.user.avatar_url}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {detail.user.name || 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatTimeAgo(detail.created_at)}
                          </p>
                        </div>
                        <span className="text-2xl">
                          {EMOJI_MAP[detail.emoji as EmojiCode] || detail.emoji}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ReactionBar;
