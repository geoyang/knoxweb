import { supabase } from '../lib/supabase';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  isAuthError?: boolean;
}

export type ContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'sticker'
  | 'emoji'
  | 'album_link'
  | 'website_link'
  | 'calendar_event'
  | 'address';

export interface MessageContent {
  type: ContentType;
  text?: string;
  url?: string;
  metadata?: Record<string, any>;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content_type: ContentType;
  content_text: string | null;
  content_url: string | null;
  content_metadata: Record<string, any>;
  reply_to_id: string | null;
  self_destruct_seconds: number | null;
  is_deleted: boolean;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  sender?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  reply_to?: {
    id: string;
    content_text: string | null;
    sender: {
      full_name: string | null;
    };
  };
  read_by?: string[];
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
  participants?: ConversationParticipant[];
  circle?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

export interface ConversationParticipant {
  id: string;
  user_id: string;
  role: 'admin' | 'member';
  muted_until: string | null;
  joined_at: string;
  last_read_at: string;
  profile?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

class ChatApiService {
  private async getAuthHeaders(): Promise<Record<string, string> | null> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.access_token) {
        console.error('No valid session for chat API:', error);
        return null;
      }
      return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };
    } catch (error) {
      console.error('Error getting auth headers:', error);
      return null;
    }
  }

  private async apiRequest<T>(
    action: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    params?: Record<string, any>,
    body?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getAuthHeaders();
      if (!headers) {
        return { success: false, error: 'Not authenticated', isAuthError: true };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const url = new URL(`${supabaseUrl}/functions/v1/messages-api`);
      url.searchParams.set('action', action);

      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        });
      }

      const options: RequestInit = { method, headers };
      if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url.toString(), options);
      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Request failed' };
      }

      return { success: true, data };
    } catch (error) {
      console.error(`Chat API error (${action}):`, error);
      return { success: false, error: 'Network error' };
    }
  }

  async getConversations(page: number = 1, limit: number = 50): Promise<ApiResponse<{
    conversations: Conversation[];
    pagination?: { page: number; limit: number; total: number; total_pages: number };
  }>> {
    const result = await this.apiRequest<{
      conversations: Conversation[];
      pagination: { page: number; limit: number; total: number; total_pages: number };
    }>('conversations', 'GET', { page, limit });

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          conversations: result.data.conversations,
          pagination: result.data.pagination,
        },
      };
    }

    return { success: false, error: result.error };
  }

  async getTotalUnreadCount(): Promise<number> {
    const result = await this.getConversations(1, 100);
    if (!result.success || !result.data) return 0;
    return result.data.conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
  }

  async getMessages(conversationId: string, page: number = 1, limit: number = 20): Promise<ApiResponse<{
    messages: Message[];
    pagination?: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  }>> {
    const result = await this.apiRequest<{
      messages: Message[];
      pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
    }>('messages', 'GET', { conversation_id: conversationId, page, limit });

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          messages: result.data.messages,
          pagination: result.data.pagination,
        },
      };
    }

    return { success: false, error: result.error };
  }

  async pollMessages(conversationId: string, since: string): Promise<ApiResponse<{
    messages: Message[];
  }>> {
    const result = await this.apiRequest<{ messages: Message[] }>(
      'poll',
      'GET',
      { conversation_id: conversationId, since }
    );

    if (result.success && result.data) {
      return { success: true, data: { messages: result.data.messages } };
    }

    return { success: false, error: result.error };
  }

  async sendMessage(
    conversationId: string,
    content: MessageContent,
    options?: { replyToId?: string; selfDestructSeconds?: number }
  ): Promise<ApiResponse<{ message: Message }>> {
    const result = await this.apiRequest<{ message: Message }>('send', 'POST', undefined, {
      conversation_id: conversationId,
      content_type: content.type,
      content_text: content.text,
      content_url: content.url,
      content_metadata: content.metadata,
      reply_to_id: options?.replyToId,
      self_destruct_seconds: options?.selfDestructSeconds,
    });

    if (result.success && result.data) {
      return { success: true, data: { message: result.data.message } };
    }

    return { success: false, error: result.error };
  }

  async markMessagesAsRead(conversationId: string, messageIds: string[]): Promise<boolean> {
    const result = await this.apiRequest('read', 'POST', undefined, {
      conversation_id: conversationId,
      message_ids: messageIds,
    });
    return result.success;
  }

  async createDMConversation(recipientUserId: string): Promise<ApiResponse<{ conversation: Conversation }>> {
    const result = await this.apiRequest<{ conversation: Conversation }>(
      'create_dm',
      'POST',
      undefined,
      { recipient_user_id: recipientUserId }
    );

    if (result.success && result.data) {
      return { success: true, data: { conversation: result.data.conversation } };
    }

    return { success: false, error: result.error };
  }

  async getCircleConversation(circleId: string): Promise<ApiResponse<{ conversation: Conversation }>> {
    const result = await this.apiRequest<{ conversation: Conversation; existing: boolean }>(
      'get_circle_chat',
      'GET',
      { circle_id: circleId }
    );

    if (result.success && result.data) {
      return { success: true, data: { conversation: result.data.conversation } };
    }

    return { success: false, error: result.error || 'Failed to get circle chat' };
  }

  async editMessage(messageId: string, newText: string): Promise<ApiResponse<{ message: Message }>> {
    const result = await this.apiRequest<{ message: Message }>(
      'edit',
      'PUT',
      undefined,
      { message_id: messageId, content_text: newText }
    );

    if (result.success && result.data) {
      return { success: true, data: { message: result.data.message } };
    }

    return { success: false, error: result.error };
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    const result = await this.apiRequest('delete', 'DELETE', undefined, {
      message_id: messageId,
    });
    return result.success;
  }

  async clearChat(conversationId: string): Promise<ApiResponse<{ messagesDeleted: number }>> {
    const result = await this.apiRequest<{ cleared: boolean; messages_deleted: number }>(
      'clear_chat',
      'POST',
      undefined,
      { conversation_id: conversationId }
    );

    if (result.success && result.data) {
      return { success: true, data: { messagesDeleted: result.data.messages_deleted } };
    }

    return { success: false, error: result.error || 'Failed to clear chat' };
  }

  async searchMessages(
    query: string,
    filters?: {
      circle_ids?: string[];
      user_ids?: string[];
      date_from?: string;
      date_to?: string;
      content_types?: ContentType[];
    },
    page: number = 1,
    limit: number = 20
  ): Promise<ApiResponse<{
    messages: Message[];
    pagination?: { page: number; limit: number; total: number; total_pages: number };
  }>> {
    const result = await this.apiRequest<{
      messages: Message[];
      pagination: { page: number; limit: number; total: number; total_pages: number };
    }>('search', 'GET', {
      query,
      page,
      limit,
      circle_ids: filters?.circle_ids?.join(','),
      user_ids: filters?.user_ids?.join(','),
      date_from: filters?.date_from,
      date_to: filters?.date_to,
      content_types: filters?.content_types?.join(','),
    });

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          messages: result.data.messages,
          pagination: result.data.pagination,
        },
      };
    }

    return { success: false, error: result.error };
  }
}

export const chatApi = new ChatApiService();
