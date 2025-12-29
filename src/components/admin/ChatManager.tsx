import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatApi, Conversation, Message, MessageContent } from '../../services/chatApi';
import { useAuth } from '../../context/AuthContext';

export const ChatManager: React.FC = () => {
  const { user } = useAuth();
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

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const result = await chatApi.getConversations();
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

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const result = await chatApi.getMessages(conversationId);
      if (result.success && result.data) {
        setMessages(result.data.messages);
        if (result.data.messages.length > 0) {
          lastMessageTimeRef.current = result.data.messages[result.data.messages.length - 1].created_at;
        }
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Poll for new messages
  const pollMessages = useCallback(async () => {
    if (!selectedConversation || !lastMessageTimeRef.current) return;

    try {
      const result = await chatApi.pollMessages(selectedConversation.id, lastMessageTimeRef.current);
      if (result.success && result.data && result.data.messages.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMessages = result.data!.messages.filter(m => !existingIds.has(m.id));
          if (newMessages.length === 0) return prev;
          lastMessageTimeRef.current = newMessages[newMessages.length - 1].created_at;
          return [...prev, ...newMessages];
        });
      }
    } catch (err) {
      console.error('Error polling messages:', err);
    }
  }, [selectedConversation]);

  // Initial fetch
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      return otherParticipant?.profile?.full_name || otherParticipant?.profile?.email || 'Unknown';
    }
    return 'Conversation';
  };

  // Get avatar for conversation
  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.type === 'dm' && conversation.participants) {
      const otherParticipant = conversation.participants.find(p => p.user_id !== user?.id);
      return otherParticipant?.profile?.avatar_url;
    }
    return null;
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
        <button onClick={fetchConversations} className="ml-4 text-red-600 underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-12rem)]">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Chat</h2>
        <p className="text-gray-600">Messages with your circles and contacts</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100%-4rem)] flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-80 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Conversations</h3>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p>No conversations yet</p>
                <p className="text-sm mt-1">Start a chat from a circle or contact</p>
              </div>
            ) : (
              conversations.map(conversation => (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversation(conversation)}
                  className={`w-full p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left ${
                    selectedConversation?.id === conversation.id ? 'bg-blue-50' : ''
                  }`}
                >
                  {/* Avatar */}
                  {conversation.type === 'circle' ? (
                    renderAvatarGroup(conversation.participants, 'md')
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {getConversationAvatar(conversation) ? (
                        <img
                          src={getConversationAvatar(conversation)!}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-blue-600 font-medium text-lg">
                          {getConversationName(conversation)[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 truncate">
                        {getConversationName(conversation)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTime(conversation.last_message_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-0.5">
                      {conversation.last_message_preview || 'No messages yet'}
                    </p>
                    {conversation.unread_count > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-blue-600 rounded-full mt-1">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat View */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                {selectedConversation.type === 'circle' ? (
                  renderAvatarGroup(selectedConversation.participants, 'sm')
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
                    {getConversationAvatar(selectedConversation) ? (
                      <img
                        src={getConversationAvatar(selectedConversation)!}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-blue-600 font-medium">
                        {getConversationName(selectedConversation)[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {getConversationName(selectedConversation)}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedConversation.type === 'circle' ? 'Circle Chat' : 'Direct Message'}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <p className="text-4xl mb-2">💬</p>
                      <p>No messages yet</p>
                      <p className="text-sm">Send a message to start the conversation</p>
                    </div>
                  </div>
                ) : (
                  messages.map(message => {
                    const isOwn = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex items-end gap-2 max-w-[70%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                          {/* Avatar for others */}
                          {!isOwn && (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {message.sender?.avatar_url ? (
                                <img
                                  src={message.sender.avatar_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-gray-600 text-sm font-medium">
                                  {message.sender?.full_name?.[0]?.toUpperCase() || '?'}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Message Bubble */}
                          <div
                            className={`rounded-2xl px-4 py-2 ${
                              isOwn
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-900'
                            }`}
                          >
                            {!isOwn && selectedConversation.type === 'circle' && (
                              <p className="text-xs font-medium mb-1 opacity-75">
                                {message.sender?.full_name || message.sender?.email}
                              </p>
                            )}

                            {/* Content based on type */}
                            {message.content_type === 'text' && (
                              <p className="whitespace-pre-wrap break-words">{message.content_text}</p>
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
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={!messageText.trim() || sending}
                    className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-6xl mb-4">💬</p>
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Choose a conversation from the list to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
