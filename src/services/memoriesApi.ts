import { supabase, getAccessToken } from '../lib/supabase';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

export interface MemoryUser {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

export interface Memory {
  id: string;
  asset_id: string;
  user_id: string;
  parent_id: string | null;
  memory_type: 'video' | 'image' | 'text' | 'audio';
  content_text: string | null;
  content_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  created_at: string;
  updated_at: string;
  user: MemoryUser;
  replies?: Memory[];
}

export interface MemoryInput {
  memory_type: 'video' | 'image' | 'text' | 'audio';
  content_text?: string;
  content_url?: string;
  thumbnail_url?: string;
  duration?: number;
}

class MemoriesApiService {
  private async getAuthHeaders(): Promise<{ Authorization: string; apikey: string } | null> {
    try {
      const accessToken = getAccessToken();

      if (!accessToken) {
        console.error('No valid session for API call:', error);
        return null;
      }

      return {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

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
        `${supabaseUrl}/functions/v1/memories-api${queryParams}`,
        fetchOptions
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(`Memories API call failed:`, data);
        return {
          success: false,
          error: data.error || 'API call failed',
          details: data.details
        };
      }

      return {
        success: true,
        data
      };

    } catch (error) {
      console.error(`Exception in Memories API call:`, error);
      return {
        success: false,
        error: 'Network or system error',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Get all memories for an asset
  async getMemories(assetId: string): Promise<ApiResponse<{ memories: Memory[]; count: number }>> {
    return this.makeApiCall(`?asset_id=${assetId}`);
  }

  // Get memory count for an asset
  async getMemoryCount(assetId: string): Promise<ApiResponse<{ count: number }>> {
    console.log('Getting memory count for asset:', assetId);
    const result = await this.makeApiCall<{ count: number }>(`?asset_id=${assetId}&count=true`);
    console.log('Memory count result:', result);
    return result;
  }

  // Get memory counts for multiple assets
  async getMemoryCounts(assetIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    // Fetch counts in parallel with batching
    const batchSize = 10;
    for (let i = 0; i < assetIds.length; i += batchSize) {
      const batch = assetIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (id) => {
          const result = await this.getMemoryCount(id);
          return { id, count: result.data?.count || 0 };
        })
      );
      results.forEach(({ id, count }) => {
        counts[id] = count;
      });
    }

    return counts;
  }

  // Add a memory to an asset
  async addMemory(assetId: string, input: MemoryInput): Promise<ApiResponse<{ memory: Memory }>> {
    return this.makeApiCall(`?asset_id=${assetId}`, {
      method: 'POST',
      body: input
    });
  }

  // Add a reply to a memory
  async addReply(memoryId: string, input: MemoryInput): Promise<ApiResponse<{ memory: Memory }>> {
    return this.makeApiCall(`?memory_id=${memoryId}`, {
      method: 'POST',
      body: input
    });
  }

  // Delete a memory
  async deleteMemory(memoryId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall(`?memory_id=${memoryId}`, {
      method: 'DELETE'
    });
  }

  // Edit a memory
  async editMemory(memoryId: string, input: Partial<MemoryInput>): Promise<ApiResponse<{ memory: Memory }>> {
    return this.makeApiCall(`?memory_id=${memoryId}`, {
      method: 'PUT',
      body: input
    });
  }

  // Upload media to storage bucket
  async uploadMemoryMedia(
    file: File,
    assetId: string,
    mediaType: 'video' | 'image' | 'audio'
  ): Promise<{ url: string; thumbnailUrl?: string } | null> {
    try {
      const accessToken = getAccessToken();
      if (!session?.user) {
        throw new Error('User not authenticated');
      }

      const userId = session.user.id;
      const timestamp = Date.now();
      const getDefaultExtension = () => {
        if (mediaType === 'video') return 'mp4';
        if (mediaType === 'audio') return 'm4a';
        return 'jpg';
      };
      const extension = file.name.split('.').pop()?.toLowerCase() || getDefaultExtension();
      const filename = `${timestamp}_memory.${extension}`;
      const storagePath = `${userId}/${assetId}/${filename}`;

      // Upload to storage
      const { data, error: uploadError } = await supabase.storage
        .from('memories')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('memories')
        .getPublicUrl(storagePath);

      return {
        url: urlData.publicUrl,
        thumbnailUrl: undefined,
      };
    } catch (error) {
      console.error('Error uploading memory media:', error);
      return null;
    }
  }
}

// Export singleton instance
export const memoriesApi = new MemoriesApiService();

// Export types
export type { ApiResponse };
