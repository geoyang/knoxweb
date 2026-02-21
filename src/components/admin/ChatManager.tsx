import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { chatApi, Conversation, Message, MessageContent } from '../../services/chatApi';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  reactionsApi,
  EMOJI_MAP,
  EMOJI_CODES,
  type ReactionSummary,
  type Reaction,
  type EmojiCode,
} from '../../services/reactionsApi';
import { ChatSearchGlobal } from './chat/ChatSearchGlobal';
import { getDisplayIdentifier } from '../../utils/phoneDisplayUtils';
import { ChatSearchInChat, highlightSearchText } from './chat/ChatSearchInChat';

// Sticker data - matching mobile app
const STICKER_CATEGORIES = [
  { id: 'reactions', name: 'Reactions', icon: '😀' },
  { id: 'love', name: 'Love', icon: '❤️' },
  { id: 'celebrations', name: 'Celebrations', icon: '🎉' },
  { id: 'animals', name: 'Animals', icon: '🐱' },
];

const STICKERS = [
  // Reactions
  { id: 'thumbs-up', category: 'reactions', emoji: '👍' },
  { id: 'thumbs-down', category: 'reactions', emoji: '👎' },
  { id: 'clap', category: 'reactions', emoji: '👏' },
  { id: 'fire', category: 'reactions', emoji: '🔥' },
  { id: 'laugh', category: 'reactions', emoji: '😂' },
  { id: 'wow', category: 'reactions', emoji: '😮' },
  { id: 'sad', category: 'reactions', emoji: '😢' },
  { id: 'angry', category: 'reactions', emoji: '😠' },
  { id: 'thinking', category: 'reactions', emoji: '🤔' },
  { id: 'cool', category: 'reactions', emoji: '😎' },
  // Love
  { id: 'heart', category: 'love', emoji: '❤️' },
  { id: 'heart-eyes', category: 'love', emoji: '😍' },
  { id: 'kiss', category: 'love', emoji: '😘' },
  { id: 'hug', category: 'love', emoji: '🤗' },
  { id: 'sparkling-heart', category: 'love', emoji: '💖' },
  { id: 'two-hearts', category: 'love', emoji: '💕' },
  { id: 'rose', category: 'love', emoji: '🌹' },
  // Celebrations
  { id: 'party', category: 'celebrations', emoji: '🎉' },
  { id: 'confetti', category: 'celebrations', emoji: '🎊' },
  { id: 'balloon', category: 'celebrations', emoji: '🎈' },
  { id: 'gift', category: 'celebrations', emoji: '🎁' },
  { id: 'cake', category: 'celebrations', emoji: '🎂' },
  { id: 'trophy', category: 'celebrations', emoji: '🏆' },
  { id: 'star', category: 'celebrations', emoji: '⭐' },
  // Animals
  { id: 'dog', category: 'animals', emoji: '🐕' },
  { id: 'cat', category: 'animals', emoji: '🐱' },
  { id: 'bear', category: 'animals', emoji: '🐻' },
  { id: 'panda', category: 'animals', emoji: '🐼' },
  { id: 'unicorn', category: 'animals', emoji: '🦄' },
  { id: 'butterfly', category: 'animals', emoji: '🦋' },
];

export const ChatManager: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef<string | null>(null);

  // Attachment picker state
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [selectedStickerCategory, setSelectedStickerCategory] = useState('reactions');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reactions state
  const [messageReactions, setMessageReactions] = useState<Record<string, ReactionSummary[]>>({});
  const [messageReactionDetails, setMessageReactionDetails] = useState<Record<string, Reaction[]>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [loadingReactions, setLoadingReactions] = useState<Set<string>>(new Set());
  const [showReactionDetailsModal, setShowReactionDetailsModal] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search state
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isSearchNavigating = useRef(false);

  // Fetch conversations (lite mode for fast initial load)
  const fetchConversations = useCallback(async (ensureCircleChats: boolean = false) => {
    try {
      const result = await chatApi.getConversations({
        lite: true,
        ensureCircleChats // Only ensure circle chats on first load
      });
      if (result.success && result.data) {
        setConversations(result.data.conversations);
      } else {
        setError(result.error || 'Failed to load conversations');
      }
    } catch (err) {
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async (conversationId: string, messageList: Message[]) => {
    if (!user) return;

    // Get unread message IDs (messages not sent by current user)
    const unreadMessageIds = messageList
      .filter(m => m.sender_id !== user.id)
      .map(m => m.id);

    if (unreadMessageIds.length > 0) {
      const success = await chatApi.markMessagesAsRead(conversationId, unreadMessageIds);
      if (success) {
        // Update conversation unread count locally
        setConversations(prev => prev.map(c =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c
        ));
      }
    }
  }, [user?.id]);

  // Fetch messages for selected conversation (initial load)
  const fetchMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    setCurrentPage(1);
    setHasMore(false);
    try {
      const result = await chatApi.getMessages(conversationId, 1, 20);
      if (result.success && result.data) {
        setMessages(result.data.messages);
        setHasMore(result.data.pagination?.hasMore || false);
        if (result.data.messages.length > 0) {
          lastMessageTimeRef.current = result.data.messages[result.data.messages.length - 1].created_at;
          // Mark messages as read when loaded
          markMessagesAsRead(conversationId, result.data.messages);
        }
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [markMessagesAsRead]);

  // Poll for new messages
  const pollMessages = useCallback(async () => {
    if (!selectedConversation || !lastMessageTimeRef.current) return;

    try {
      const result = await chatApi.pollMessages(selectedConversation.id, lastMessageTimeRef.current);
      if (result.success && result.data && result.data.messages.length > 0) {
        const newMessages = result.data.messages;
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const filteredMessages = newMessages.filter(m => !existingIds.has(m.id));
          if (filteredMessages.length === 0) return prev;
          lastMessageTimeRef.current = filteredMessages[filteredMessages.length - 1].created_at;
          return [...prev, ...filteredMessages];
        });
        // Mark new messages as read
        markMessagesAsRead(selectedConversation.id, newMessages);
      }
    } catch (err) {
      console.error('Error polling messages:', err);
    }
  }, [selectedConversation, markMessagesAsRead]);

  // Initial fetch - ensure circle chats exist on first load
  useEffect(() => {
    fetchConversations(true); // ensureCircleChats=true on initial load
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle URL search params for deep linking
  const pendingNavigationRef = useRef<{ conversationId: string; messageId?: string } | null>(null);

  useEffect(() => {
    const conversationId = searchParams.get('conversationId');
    if (!conversationId || conversations.length === 0) return;

    const messageId = searchParams.get('messageId');
    const conv = conversations.find(c => c.id === conversationId);
    if (conv) {
      setSelectedConversation(conv);
      if (messageId) {
        pendingNavigationRef.current = { conversationId, messageId };
      }
      setSearchParams({}, { replace: true });
    }
  }, [conversations, searchParams, setSearchParams]);

  // Navigate to message after messages load
  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending?.messageId || messagesLoading || messages.length === 0) return;
    if (selectedConversation?.id !== pending.conversationId) return;

    handleNavigateToMessage(pending.messageId);
    pendingNavigationRef.current = null;
  }, [messages, messagesLoading, selectedConversation]);

  // Fetch messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);

      // Start polling
      pollingRef.current = setInterval(pollMessages, 5000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [selectedConversation, fetchMessages, pollMessages]);

  // Scroll to bottom on new messages (skip during search navigation)
  useEffect(() => {
    if (isSearchNavigating.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch reactions for a message
  const fetchMessageReactions = useCallback(async (messageId: string) => {
    try {
      const data = await reactionsApi.getReactions(messageId, 'message');
      setMessageReactions(prev => ({ ...prev, [messageId]: data.summary }));
      setMessageReactionDetails(prev => ({ ...prev, [messageId]: data.details }));
    } catch (err) {
      console.error('Error fetching reactions:', err);
    }
  }, []);

  // Format time ago helper
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

  // Fetch reactions for all visible messages
  const fetchAllMessageReactions = useCallback(async (messageList: Message[]) => {
    for (const message of messageList) {
      fetchMessageReactions(message.id);
    }
  }, [fetchMessageReactions]);

  // Load more (older) messages
  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversation || loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPage = currentPage + 1;

    try {
      const result = await chatApi.getMessages(selectedConversation.id, nextPage, 20);
      if (result.success && result.data) {
        // Prepend older messages to the beginning
        setMessages(prev => [...result.data!.messages, ...prev]);
        setCurrentPage(nextPage);
        setHasMore(result.data.pagination?.hasMore || false);
        // Fetch reactions for the new messages
        fetchAllMessageReactions(result.data.messages);
      }
    } catch (err) {
      console.error('Error loading more messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [selectedConversation, currentPage, loadingMore, hasMore, fetchAllMessageReactions]);

  // Toggle reaction on a message
  const handleToggleReaction = useCallback(async (messageId: string, emoji: EmojiCode) => {
    setLoadingReactions(prev => new Set(prev).add(messageId));
    setShowReactionPicker(null);

    try {
      const currentReactions = messageReactions[messageId] || [];
      const existingReaction = currentReactions.find(r => r.emoji === emoji && r.hasReacted);

      await reactionsApi.toggleReaction(messageId, 'message', emoji, existingReaction?.reactionId || null);
      await fetchMessageReactions(messageId);
    } catch (err) {
      console.error('Error toggling reaction:', err);
    } finally {
      setLoadingReactions(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, [messageReactions, fetchMessageReactions]);

  // Fetch reactions when messages load
  useEffect(() => {
    if (messages.length > 0) {
      fetchAllMessageReactions(messages);
    }
  }, [messages, fetchAllMessageReactions]);

  // Close reaction picker when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowReactionPicker(null);
    if (showReactionPicker) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showReactionPicker]);

  // Handle file upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

    setShowAttachmentPicker(false);
    setUploading(true);

    try {
      const isVideo = file.type.startsWith('video/');
      const extension = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
      const sanitizedName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50);
      const filename = `chat/${selectedConversation.id}/${Date.now()}_${sanitizedName}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(filename, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Failed to upload file. Please try again.');
        return;
      }

      // Generate signed URL
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('chat-images')
        .createSignedUrl(filename, 60 * 60 * 24 * 365);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('Signed URL error:', signedUrlError);
        alert('Failed to process upload.');
        return;
      }

      // Send message with media
      const result = await chatApi.sendMessage(selectedConversation.id, {
        type: isVideo ? 'video' : 'image',
        url: signedUrlData.signedUrl,
      });

      if (result.success && result.data) {
        setMessages(prev => [...prev, result.data!.message]);
        lastMessageTimeRef.current = result.data.message.created_at;
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Failed to upload file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Send sticker
  const handleStickerSelect = async (sticker: { id: string; emoji: string }) => {
    if (!selectedConversation) return;

    setShowStickerPicker(false);
    setSending(true);

    try {
      const result = await chatApi.sendMessage(selectedConversation.id, {
        type: 'sticker',
        metadata: { stickerId: sticker.id, emoji: sticker.emoji },
      });

      if (result.success && result.data) {
        setMessages(prev => [...prev, result.data!.message]);
        lastMessageTimeRef.current = result.data.message.created_at;
      }
    } catch (err) {
      console.error('Error sending sticker:', err);
    } finally {
      setSending(false);
    }
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversation || sending) return;

    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      const result = await chatApi.sendMessage(selectedConversation.id, { type: 'text', text });
      if (result.success && result.data) {
        setMessages(prev => [...prev, result.data!.message]);
        lastMessageTimeRef.current = result.data.message.created_at;

        // Update conversation preview
        setConversations(prev => prev.map(c =>
          c.id === selectedConversation.id
            ? { ...c, last_message_preview: text, last_message_at: result.data!.message.created_at }
            : c
        ));
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setMessageText(text);
    } finally {
      setSending(false);
    }
  };

  // Format time - show date if not today
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
      return timeStr;
    } else {
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${dateStr}, ${timeStr}`;
    }
  };

  // Get conversation display name
  const getConversationName = (conversation: Conversation) => {
    if (conversation.title) return conversation.title;
    if (conversation.type === 'dm' && conversation.participants) {
      const otherParticipant = conversation.participants.find(p => p.user_id !== user?.id);
      return otherParticipant?.profile?.full_name || getDisplayIdentifier(otherParticipant?.profile?.email) || 'Unknown';
    }
    return 'Conversation';
  };

  // Get avatar for conversation
  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.type === 'dm') {
      // Lite mode: use dm_avatar_url from server
      if ((conversation as any).dm_avatar_url) {
        return (conversation as any).dm_avatar_url;
      }
      // Full mode: use participant profile
      if (conversation.participants) {
        const otherParticipant = conversation.participants.find(p => p.user_id !== user?.id);
        return otherParticipant?.profile?.avatar_url;
      }
    }
    return null;
  };

  // Handle global search result selection
  const handleGlobalSearchSelect = (conversationId: string, query: string) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (conv) {
      setSelectedConversation(conv);
      setSearchQuery(query);
      setShowInChatSearch(true);
    }
  };

  // Handle navigating to a specific message, loading older pages if needed
  const handleNavigateToMessage = useCallback(async (messageId: string) => {
    setHighlightedMessageId(messageId);

    // Helper to scroll once the element is in the DOM
    const scrollToMessage = () => {
      requestAnimationFrame(() => {
        const el = messageRefs.current[messageId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        isSearchNavigating.current = false;
      });
      setTimeout(() => setHighlightedMessageId(null), 2000);
    };

    // Check if message is already rendered
    if (messageRefs.current[messageId]) {
      scrollToMessage();
      return;
    }

    // Check if message is loaded but not yet rendered
    if (messages.some(m => m.id === messageId)) {
      scrollToMessage();
      return;
    }

    // Message not loaded yet — load older pages until found
    if (!selectedConversation) return;

    isSearchNavigating.current = true;
    let page = currentPage;
    let moreAvailable = hasMore;
    const MAX_PAGES_TO_LOAD = 50;

    for (let i = 0; i < MAX_PAGES_TO_LOAD && moreAvailable; i++) {
      page += 1;
      try {
        const result = await chatApi.getMessages(selectedConversation.id, page, 20);
        if (!result.success || !result.data) break;

        const newMessages = result.data.messages;
        moreAvailable = result.data.pagination?.hasMore || false;

        setMessages(prev => [...newMessages, ...prev]);
        setCurrentPage(page);
        setHasMore(moreAvailable);
        fetchAllMessageReactions(newMessages);

        if (newMessages.some((m: Message) => m.id === messageId)) {
          // Wait for React to render the new messages, then scroll
          await new Promise(resolve => setTimeout(resolve, 100));
          scrollToMessage();
          return;
        }
      } catch (err) {
        console.error('Error loading messages for search navigation:', err);
        break;
      }
    }

    // Exhausted pages without finding the message
    isSearchNavigating.current = false;
    setTimeout(() => setHighlightedMessageId(null), 2000);
  }, [messages, selectedConversation, currentPage, hasMore, fetchAllMessageReactions]);

  // Close in-chat search
  const handleCloseInChatSearch = () => {
    setShowInChatSearch(false);
    setSearchQuery('');
    setHighlightedMessageId(null);
  };

  // Render avatar group for circle chats
  const renderAvatarGroup = (participants: Conversation['participants'], size: 'sm' | 'md' = 'md') => {
    if (!participants || participants.length === 0) {
      return (
        <div className={`${size === 'md' ? 'w-12 h-12' : 'w-10 h-10'} rounded-full bg-blue-100 flex items-center justify-center`}>
          <span className="text-blue-600 font-medium text-lg">👥</span>
        </div>
      );
    }

    const maxShow = 3;
    const toShow = participants.slice(0, maxShow);
    const remaining = participants.length - maxShow;
    const containerSize = size === 'md' ? 'w-12 h-12' : 'w-10 h-10';
    const avatarSize = size === 'md' ? 'w-7 h-7' : 'w-6 h-6';
    const avatarSizeFirst = size === 'md' ? 'w-8 h-8' : 'w-7 h-7';

    return (
      <div className={`${containerSize} relative flex-shrink-0`}>
        {toShow.map((participant, index) => {
          const isFirst = index === 0;
          const positionClass = isFirst
            ? 'top-0 left-0'
            : index === 1
            ? 'bottom-0 right-0'
            : 'top-0 right-0';
          const sizeClass = isFirst ? avatarSizeFirst : avatarSize;

          return (
            <div
              key={participant.id}
              className={`absolute ${positionClass} ${sizeClass} rounded-full border-2 border-white overflow-hidden`}
              style={{ zIndex: maxShow - index }}
            >
              {participant.profile?.avatar_url ? (
                <img
                  src={participant.profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-medium">
                    {(participant.profile?.full_name || '?')[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {remaining > 0 && (
          <div className="absolute bottom-0 left-3 w-5 h-5 rounded-full bg-gray-400 border-2 border-white flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">+{remaining}</span>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-bg border border-error text-error p-4 rounded-lg">
        {error}
        <button onClick={() => fetchConversations(false)} className="ml-4 text-error underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-12rem)]">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-theme-primary">Chat</h2>
        <p className="text-theme-secondary">Messages with your circles and contacts</p>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-default h-[calc(100%-4rem)] flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-80 border-r border-default flex flex-col">
          <div className="p-4 border-b border-light">
            <h3 className="font-semibold text-theme-primary">Conversations</h3>
          </div>

          {/* Global Search */}
          <ChatSearchGlobal
            onSelectConversation={handleGlobalSearchSelect}
            onClearSearch={() => {}}
          />

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-theme-muted">
                <p>No conversations yet</p>
                <p className="text-sm mt-1">Start a chat from a circle or contact</p>
              </div>
            ) : (
              conversations.map(conversation => (
                <div
                  key={conversation.id}
                  className={`group relative flex items-start gap-3 p-4 border-b border-light transition-colors ${
                    selectedConversation?.id === conversation.id ? 'bg-primary-light' : 'hover:bg-surface-hover'
                  }`}
                >
                  {/* Main clickable area */}
                  <button
                    onClick={() => setSelectedConversation(conversation)}
                    className="absolute inset-0 w-full h-full"
                    aria-label={`Open ${getConversationName(conversation)}`}
                  />

                  {/* Avatar */}
                  {conversation.type === 'circle' ? (
                    renderAvatarGroup(conversation.participants, 'md')
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {getConversationAvatar(conversation) ? (
                        <img
                          src={getConversationAvatar(conversation)!}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-theme-accent font-medium text-lg">
                          {getConversationName(conversation)[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-theme-primary truncate">
                        {getConversationName(conversation)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-theme-muted">
                          {formatTime(conversation.last_message_at)}
                        </span>
                        {/* Search icon for this conversation */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedConversation(conversation);
                            setShowInChatSearch(true);
                            setSearchQuery('');
                          }}
                          className="relative z-10 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-all"
                          title={`Search in ${getConversationName(conversation)}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-theme-muted truncate mt-0.5">
                      {conversation.last_message_preview || 'No messages yet'}
                    </p>
                    {conversation.unread_count > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-primary rounded-full mt-1">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat View */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-default flex items-center gap-3">
                {selectedConversation.type === 'circle' ? (
                  renderAvatarGroup(selectedConversation.participants, 'sm')
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center overflow-hidden">
                    {getConversationAvatar(selectedConversation) ? (
                      <img
                        src={getConversationAvatar(selectedConversation)!}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-theme-accent font-medium">
                        {getConversationName(selectedConversation)[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-theme-primary">
                    {getConversationName(selectedConversation)}
                  </h3>
                  <p className="text-xs text-theme-muted">
                    {selectedConversation.type === 'circle' ? 'Circle Chat' : 'Direct Message'}
                  </p>
                </div>
                {/* Search Button */}
                <button
                  onClick={() => setShowInChatSearch(!showInChatSearch)}
                  className={`p-2 rounded-lg transition-colors ${
                    showInChatSearch ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  title="Search in conversation (Ctrl+F)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>

              {/* In-Chat Search Bar */}
              {showInChatSearch && (
                <ChatSearchInChat
                  conversationId={selectedConversation.id}
                  initialQuery={searchQuery}
                  onNavigateToMessage={handleNavigateToMessage}
                  onClose={handleCloseInChatSearch}
                />
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-app">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-theme-muted">
                    <div className="text-center">
                      <p className="text-4xl mb-2">💬</p>
                      <p>No messages yet</p>
                      <p className="text-sm">Send a message to start the conversation</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Load Older Messages Button */}
                    {hasMore && (
                      <div className="flex justify-center pb-2">
                        <button
                          onClick={loadMoreMessages}
                          disabled={loadingMore}
                          className="px-4 py-2 text-sm text-theme-accent hover:bg-primary-light rounded-full transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {loadingMore ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                              Loading...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                              Load older messages
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {messages.map(message => {
                    const isOwn = message.sender_id === user?.id;
                    const reactions = messageReactions[message.id] || [];
                    const isHighlighted = highlightedMessageId === message.id;
                    return (
                      <div
                        key={message.id}
                        ref={(el) => { messageRefs.current[message.id] = el; }}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${
                          isHighlighted ? 'animate-pulse' : ''
                        }`}
                      >
                        <div className={`flex items-end gap-2 max-w-[70%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                          {/* Avatar for others */}
                          {!isOwn && (
                            <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {message.sender?.avatar_url ? (
                                <img
                                  src={message.sender.avatar_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-theme-secondary text-sm font-medium">
                                  {message.sender?.full_name?.[0]?.toUpperCase() || '?'}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Message Bubble + Reactions Container */}
                          <div className="flex flex-col">
                            {/* Message Bubble */}
                            <div
                              className={`rounded-2xl px-4 py-2 ${
                                isOwn
                                  ? 'bg-primary text-white'
                                  : 'bg-surface text-theme-primary border border-default'
                              }`}
                            >
                              {!isOwn && selectedConversation.type === 'circle' && (
                                <p className="text-xs font-medium mb-1 opacity-75">
                                  {message.sender?.full_name || getDisplayIdentifier(message.sender?.email)}
                                </p>
                              )}

                              {/* Content based on type */}
                              {message.content_type === 'text' && (
                                <p className="whitespace-pre-wrap break-words">
                                  {showInChatSearch && searchQuery
                                    ? highlightSearchText(message.content_text || '', searchQuery)
                                    : message.content_text}
                                </p>
                              )}
                              {message.content_type === 'image' && message.content_url && (
                                <img
                                  src={message.content_url}
                                  alt="Shared image"
                                  className="max-w-full rounded-lg"
                                  style={{ maxHeight: '300px' }}
                                />
                              )}
                              {message.content_type === 'video' && message.content_url && (
                                <video
                                  src={message.content_url}
                                  controls
                                  className="max-w-full rounded-lg"
                                  style={{ maxHeight: '300px' }}
                                />
                              )}
                              {message.content_type === 'sticker' && (
                                <p className="text-4xl">{message.content_metadata?.emoji || '🎨'}</p>
                              )}

                              <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-500'}`}>
                                {formatTime(message.created_at)}
                                {message.is_edited && ' (edited)'}
                              </p>
                            </div>

                            {/* Reactions Display & Picker - Below the bubble */}
                            <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                              {/* Existing Reactions */}
                              {reactions.map(reaction => (
                                <button
                                  key={reaction.emoji}
                                  onClick={() => handleToggleReaction(message.id, reaction.emoji)}
                                  className={`px-2 py-0.5 rounded-full text-sm flex items-center gap-1 transition-colors ${
                                    reaction.hasReacted
                                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                  disabled={loadingReactions.has(message.id)}
                                >
                                  <span>{EMOJI_MAP[reaction.emoji]}</span>
                                  <span className="text-xs">{reaction.count}</span>
                                </button>
                              ))}

                              {/* Add Reaction Button */}
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowReactionPicker(showReactionPicker === message.id ? null : message.id);
                                  }}
                                  className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                                  disabled={loadingReactions.has(message.id)}
                                >
                                  {loadingReactions.has(message.id) ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500"></div>
                                  ) : (
                                    <span className="text-xs">😊</span>
                                  )}
                                </button>

                                {/* Reaction Picker Popup */}
                                {showReactionPicker === message.id && (
                                  <div
                                    className={`absolute ${isOwn ? 'right-0' : 'left-0'} bottom-full mb-1 bg-white rounded-lg shadow-xl border p-2 flex gap-1 z-10`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {EMOJI_CODES.slice(0, 6).map(code => (
                                      <button
                                        key={code}
                                        onClick={() => handleToggleReaction(message.id, code)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-gray-100 transition-colors ${
                                          reactions.find(r => r.emoji === code && r.hasReacted)
                                            ? 'bg-blue-100'
                                            : ''
                                        }`}
                                      >
                                        {EMOJI_MAP[code]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Info button - show who reacted */}
                              {reactions.length > 0 && (
                                <button
                                  onClick={() => setShowReactionDetailsModal(message.id)}
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                                  title="See who reacted"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 relative">
                <div className="flex items-center gap-2">
                  {/* + Button */}
                  <button
                    type="button"
                    onClick={() => setShowAttachmentPicker(!showAttachmentPicker)}
                    disabled={uploading}
                    className="w-10 h-10 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>

                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-default bg-surface text-theme-primary rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-muted"
                    disabled={sending || uploading}
                  />
                  <button
                    type="submit"
                    disabled={!messageText.trim() || sending || uploading}
                    className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {sending ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Hidden file input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,video/*"
                  className="hidden"
                />

                {/* Attachment Picker Popup */}
                {showAttachmentPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-surface rounded-xl shadow-xl border border-default p-4 w-72">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-theme-primary">Share</span>
                      <button
                        type="button"
                        onClick={() => setShowAttachmentPicker(false)}
                        className="text-slate-400 hover:text-theme-secondary"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-surface-hover transition-colors"
                      >
                        <div className="w-12 h-12 rounded-full bg-teal-500 flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="text-xs text-theme-secondary font-medium">Photos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachmentPicker(false);
                          setShowStickerPicker(true);
                        }}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-surface-hover transition-colors"
                      >
                        <div className="w-12 h-12 rounded-full bg-yellow-400 flex items-center justify-center">
                          <span className="text-2xl">😀</span>
                        </div>
                        <span className="text-xs text-theme-secondary font-medium">Stickers</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachmentPicker(false);
                          alert('Albums sharing coming soon!');
                        }}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-surface-hover transition-colors"
                      >
                        <div className="w-12 h-12 rounded-full bg-green-400 flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </div>
                        <span className="text-xs text-theme-secondary font-medium">Albums</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Sticker Picker Popup */}
                {showStickerPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-surface rounded-xl shadow-xl border border-default w-80">
                    <div className="flex justify-between items-center p-3 border-b border-default">
                      <span className="font-semibold text-theme-primary">Stickers</span>
                      <button
                        type="button"
                        onClick={() => setShowStickerPicker(false)}
                        className="text-slate-400 hover:text-theme-secondary"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {/* Category tabs */}
                    <div className="flex gap-1 p-2 border-b border-default overflow-x-auto">
                      {STICKER_CATEGORIES.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedStickerCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                            selectedStickerCategory === cat.id
                              ? 'bg-primary text-white'
                              : 'bg-surface-elevated text-theme-secondary hover:bg-surface-hover'
                          }`}
                        >
                          {cat.icon} {cat.name}
                        </button>
                      ))}
                    </div>
                    {/* Sticker grid */}
                    <div className="grid grid-cols-5 gap-1 p-3 max-h-48 overflow-y-auto">
                      {STICKERS.filter(s => s.category === selectedStickerCategory).map(sticker => (
                        <button
                          key={sticker.id}
                          type="button"
                          onClick={() => handleStickerSelect(sticker)}
                          className="w-12 h-12 flex items-center justify-center text-2xl hover:bg-surface-hover rounded-lg transition-colors"
                        >
                          {sticker.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-theme-muted bg-app">
              <div className="text-center">
                <p className="text-6xl mb-4">💬</p>
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Choose a conversation from the list to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reaction Details Modal */}
      {showReactionDetailsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowReactionDetailsModal(null)}>
          <div className="bg-surface rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col border border-default" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-default">
              <h3 className="text-lg font-semibold text-theme-primary">Reactions</h3>
              <button
                onClick={() => setShowReactionDetailsModal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface-hover hover:text-theme-secondary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {(messageReactionDetails[showReactionDetailsModal] || []).length === 0 ? (
                <p className="text-theme-muted text-center py-8">No reactions yet</p>
              ) : (
                <div className="space-y-3">
                  {(messageReactionDetails[showReactionDetailsModal] || []).map(reaction => (
                    <div key={reaction.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover">
                      {reaction.user.avatar_url ? (
                        <img
                          src={reaction.user.avatar_url}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center">
                          <span className="text-theme-secondary font-medium">
                            {(reaction.user.name || '?')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-theme-primary truncate">
                          {reaction.user.name || 'Unknown'}
                        </p>
                        <p className="text-sm text-theme-muted">
                          {formatTimeAgo(reaction.created_at)}
                        </p>
                      </div>
                      <span className="text-2xl">{EMOJI_MAP[reaction.emoji]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
