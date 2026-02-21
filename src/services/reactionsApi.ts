import { supabase, getAccessToken } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

// Emoji code to unicode mapping
export const EMOJI_MAP: Record<EmojiCode, string> = {
  thumbsup: '\u{1F44D}', // 👍
  heart: '\u{2764}\u{FE0F}', // ❤️
  laugh: '\u{1F602}', // 😂
  wow: '\u{1F62E}', // 😮
  sad: '\u{1F622}', // 😢
  angry: '\u{1F621}', // 😡
  crazy: '\u{1F92A}', // 🤪
  kiss: '\u{1F618}', // 😘
  puke: '\u{1F92E}', // 🤮
  wink: '\u{1F609}', // 😉
  cool: '\u{1F60E}', // 😎
  angel: '\u{1F607}', // 😇
};

export const EMOJI_LABELS: Record<EmojiCode, string> = {
  thumbsup: 'Like',
  heart: 'Love',
  laugh: 'Haha',
  wow: 'Wow',
  sad: 'Sad',
  angry: 'Angry',
  crazy: 'Crazy',
  kiss: 'Kiss',
  puke: 'Puke',
  wink: 'Wink',
  cool: 'Cool',
  angel: 'Angel',
};

export const EMOJI_CODES = [
  'thumbsup',
  'heart',
  'laugh',
  'wow',
  'sad',
  'angry',
  'crazy',
  'kiss',
  'puke',
  'wink',
  'cool',
  'angel',
] as const;

export type EmojiCode = typeof EMOJI_CODES[number];

export interface ReactionUser {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

export interface Reaction {
  id: string;
  user_id: string;
  asset_id: string | null;
  memory_id: string | null;
  message_id: string | null;
  emoji: EmojiCode;
  emojiChar: string;
  created_at: string;
  user: ReactionUser;
}

export interface ReactionSummary {
  emoji: EmojiCode;
  emojiChar: string;
  count: number;
  hasReacted: boolean;
  reactionId: string | null;
}

export interface ReactionsData {
  summary: ReactionSummary[];
  details: Reaction[];
}

export type TargetType = 'asset' | 'memory' | 'message';

class ReactionsApiService {
  private async getAuthHeaders(): Promise<{ Authorization: string; apikey: string } | null> {
    try {
      const accessToken = getAccessToken();

      if (!accessToken) {
        console.error('No valid session for API call');
        return null;
      }

      return {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': getSupabaseAnonKey(),
      };
    } catch (error) {
      console.error('Error getting auth headers:', error);
      return null;
    }
  }

  private async makeApiCall<T>(
    queryParams: string,
    options: { body?: any; method?: string } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const authHeaders = await this.getAuthHeaders();

      if (!authHeaders) {
        return {
          success: false,
          error: 'Authentication required'
        };
      }

      const method = options.method || 'GET';
      const supabaseUrl = getSupabaseUrl();

      const fetchOptions: RequestInit = {
        method,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
      };

      if (method !== 'GET' && options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/reactions-api${queryParams}`,
        fetchOptions
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(`Reactions API call failed:`, data);
        return {
          success: false,
          error: data.error || 'API call failed',
          details: data.details,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Reactions API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Get all reactions for an asset, memory, or message
  async getReactions(targetId: string, targetType: TargetType): Promise<ReactionsData> {
    const paramMap: Record<TargetType, string> = {
      asset: 'asset_id',
      memory: 'memory_id',
      message: 'message_id',
    };
    const param = paramMap[targetType];
    const result = await this.makeApiCall<{ reactions: ReactionsData }>(`?${param}=${targetId}`);

    if (result.success && result.data?.reactions) {
      return result.data.reactions;
    }

    return { summary: [], details: [] };
  }

  // Add a reaction
  async addReaction(
    targetId: string,
    targetType: TargetType,
    emoji: EmojiCode
  ): Promise<Reaction | null> {
    const paramMap: Record<TargetType, string> = {
      asset: 'asset_id',
      memory: 'memory_id',
      message: 'message_id',
    };
    const param = paramMap[targetType];
    const result = await this.makeApiCall<{ reaction: Reaction }>(`?${param}=${targetId}`, {
      method: 'POST',
      body: { emoji },
    });

    if (result.success && result.data?.reaction) {
      return result.data.reaction;
    }

    return null;
  }

  // Remove a reaction
  async removeReaction(reactionId: string): Promise<boolean> {
    const result = await this.makeApiCall(`?reaction_id=${reactionId}`, {
      method: 'DELETE',
    });

    return result.success;
  }

  // Toggle a reaction (add if not reacted, remove if already reacted)
  async toggleReaction(
    targetId: string,
    targetType: TargetType,
    emoji: EmojiCode,
    currentReactionId: string | null
  ): Promise<{ added: boolean; reaction: Reaction | null }> {
    if (currentReactionId) {
      await this.removeReaction(currentReactionId);
      return { added: false, reaction: null };
    } else {
      const reaction = await this.addReaction(targetId, targetType, emoji);
      return { added: true, reaction };
    }
  }
}

export const reactionsApi = new ReactionsApiService();
