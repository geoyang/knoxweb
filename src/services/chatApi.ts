import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface Participant {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export interface Conversation {
  id: string;
  type: 'dm' | 'circle';
  circle_id: string | null;
  title: string | null;
  created_by: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  created_at: string;
  updated_at: string;
  unread_count: number;
  muted_until: string | null;
  participants?: Participant[];
  circle?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content_type: string;
  content_text: string | null;
  content_url: string | null;
  content_metadata: Record<string, any>;
  reply_to_id: string | null;
  is_deleted: boolean;
  is_edited: boolean;
  created_at: string;
  sender?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  reply_to?: Message | null;
  read_by?: string[];
}

export interface MessageContent {
  type: 'text' | 'image' | 'video' | 'sticker' | 'album_link' | 'website_link';
  text?: string;
  url?: string;
  metadata?: Record<string, any>;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.error('No valid session for chat API');
    return null;
  }
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
}

async function callMessagesApi<T>(
  action: string,
  params: Record<string, string> = {},
  options: { method?: string; body?: any } = {}
): Promise<ApiResponse<T>> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) {
      return { success: false, error: 'Not authenticated' };
    }

    const queryParams = new URLSearchParams({ action, ...params });
    const url = `${SUPABASE_URL}/functions/v1/messages-api?${queryParams}`;

    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers,
    };

    if (options.body && options.method !== 'GET') {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'API call failed' };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Chat API error:', error);
    return { success: false, error: 'Network error' };
  }
}

export const chatApi = {
  // Get all conversations, ensuring every circle has a chat
  getConversations: async (): Promise<ApiResponse<{ conversations: Conversation[] }>> => {
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        return { success: false, error: 'Not authenticated' };
      }

      // First, get user's circles
      const circlesResponse = await fetch(`${SUPABASE_URL}/functions/v1/admin-circles-api`, {
        method: 'GET',
        headers,
      });

      let userCircles: { id: string; name: string }[] = [];
      if (circlesResponse.ok) {
        const circlesData = await circlesResponse.json();
        userCircles = circlesData.circles || [];
      }

      // Ensure each circle has a conversation
      for (const circle of userCircles) {
        await callMessagesApi('get_circle_chat', { circle_id: circle.id });
      }

      // Now get all conversations
      const result = await callMessagesApi<{ conversations: Conversation[] }>('conversations');
      return result;
    } catch (error) {
      console.error('Error getting conversations:', error);
      return { success: false, error: 'Failed to get conversations' };
    }
  },

  // Get messages for a conversation
  getMessages: async (
    conversationId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<ApiResponse<{
    messages: Message[];
    pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  }>> => {
    return callMessagesApi('messages', {
      conversation_id: conversationId,
      page: String(page),
      limit: String(limit),
    });
  },

  // Poll for new messages
  pollMessages: async (
    conversationId: string,
    since: string
  ): Promise<ApiResponse<{ messages: Message[] }>> => {
    return callMessagesApi('poll', {
      conversation_id: conversationId,
      since,
    });
  },

  // Send a message
  sendMessage: async (
    conversationId: string,
    content: MessageContent
  ): Promise<ApiResponse<{ message: Message }>> => {
    return callMessagesApi('send', {}, {
      method: 'POST',
      body: {
        conversation_id: conversationId,
        content_type: content.type,
        content_text: content.text || null,
        content_url: content.url || null,
        content_metadata: content.metadata || {},
      },
    });
  },

  // Mark messages as read
  markMessagesAsRead: async (
    conversationId: string,
    messageIds: string[]
  ): Promise<boolean> => {
    const result = await callMessagesApi('read', {}, {
      method: 'POST',
      body: {
        conversation_id: conversationId,
        message_ids: messageIds,
      },
    });
    return result.success;
  },

  // Get or create circle chat
  getCircleChat: async (
    circleId: string
  ): Promise<ApiResponse<{ conversation: Conversation; existing: boolean }>> => {
    return callMessagesApi('get_circle_chat', { circle_id: circleId });
  },

  // Create a DM conversation
  createDM: async (
    recipientUserId: string
  ): Promise<ApiResponse<{ conversation: Conversation; existing: boolean }>> => {
    return callMessagesApi('create_dm', {}, {
      method: 'POST',
      body: { recipient_user_id: recipientUserId },
    });
  },

  // Edit a message
  editMessage: async (
    messageId: string,
    newText: string
  ): Promise<ApiResponse<{ message: Message }>> => {
    return callMessagesApi('edit', {}, {
      method: 'PUT',
      body: {
        message_id: messageId,
        content_text: newText,
      },
    });
  },

  // Delete a message
  deleteMessage: async (messageId: string): Promise<ApiResponse<{ deleted: boolean }>> => {
    return callMessagesApi('delete', { message_id: messageId }, {
      method: 'DELETE',
    });
  },

  // Clear chat (delete all messages in conversation)
  clearChat: async (conversationId: string): Promise<ApiResponse<{ cleared: boolean; messages_deleted: number }>> => {
    return callMessagesApi('clear_chat', {}, {
      method: 'POST',
      body: { conversation_id: conversationId },
    });
  },

  // Search messages
  searchMessages: async (
    query: string,
    options: {
      page?: number;
      limit?: number;
      circleIds?: string[];
      userIds?: string[];
      dateFrom?: string;
      dateTo?: string;
    } = {}
  ): Promise<ApiResponse<{
    messages: Message[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>> => {
    const params: Record<string, string> = { query };
    if (options.page) params.page = String(options.page);
    if (options.limit) params.limit = String(options.limit);
    if (options.circleIds?.length) params.circle_ids = options.circleIds.join(',');
    if (options.userIds?.length) params.user_ids = options.userIds.join(',');
    if (options.dateFrom) params.date_from = options.dateFrom;
    if (options.dateTo) params.date_to = options.dateTo;

    return callMessagesApi('search', params);
  },

  // Get total unread count across all conversations
  getTotalUnreadCount: async (): Promise<number> => {
    const result = await chatApi.getConversations();
    if (!result.success || !result.data?.conversations) {
      return 0;
    }
    return result.data.conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
  },
};
