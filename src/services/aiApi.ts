/**
 * AI API Service
 * Communicates with Kizu-AI backend for image processing
 */

import { supabase } from '../lib/supabase';
import type {
  AIApiResponse,
  AIHealthStatus,
  ProcessingResult,
  ProcessingJob,
  ProcessingOperation,
  FaceCluster,
  SampleFace,
  SearchResult,
} from '../types/ai';

class AIApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';
    console.log('[AI Service] Using AI server:', this.baseUrl);
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<AIApiResponse<T>> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle Pydantic validation errors (array of {type, loc, msg, input})
        let errorMsg = `HTTP ${response.status}`;
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            errorMsg = data.detail.map((e: { msg?: string; loc?: string[] }) =>
              e.msg || JSON.stringify(e)
            ).join(', ');
          } else if (typeof data.detail === 'string') {
            errorMsg = data.detail;
          } else {
            errorMsg = JSON.stringify(data.detail);
          }
        } else if (data.error) {
          errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        }
        return { success: false, error: errorMsg };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Health check
  async healthCheck(): Promise<AIApiResponse<AIHealthStatus>> {
    return this.request<AIHealthStatus>('/health');
  }

  // Process single image
  async processImage(params: {
    image_url?: string;
    image_base64?: string;
    asset_id?: string;
    user_id?: string;
    operations?: ProcessingOperation[];
    features?: ProcessingOperation[]; // Alias for operations
    store_results?: boolean; // Store embeddings to database
    force_reprocess?: boolean; // Clear existing AI data before processing
  }): Promise<AIApiResponse<ProcessingResult>> {
    // Map 'features' to 'operations' for API compatibility
    const body = {
      asset_id: params.asset_id || crypto.randomUUID(),
      image_url: params.image_url,
      image_base64: params.image_base64,
      operations: params.operations || params.features || ['all'],
      store_results: params.store_results ?? false,
      force_reprocess: params.force_reprocess ?? false,
    };
    return this.request<ProcessingResult>('/api/v1/process/image', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Start batch processing job
  async processBatch(params: {
    asset_ids?: string[];
    user_id?: string;
    features: ProcessingOperation[];
    limit?: number;
  }): Promise<AIApiResponse<ProcessingJob>> {
    return this.request<ProcessingJob>('/api/v1/process/batch', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Get job status
  async getJob(jobId: string): Promise<AIApiResponse<ProcessingJob>> {
    return this.request<ProcessingJob>(`/api/v1/jobs/${jobId}`);
  }

  // List all jobs
  async listJobs(status?: string): Promise<AIApiResponse<ProcessingJob[]>> {
    const params = status ? `?status=${status}` : '';
    return this.request<ProcessingJob[]>(`/api/v1/jobs${params}`);
  }

  // Cancel/delete a job
  async cancelJob(jobId: string): Promise<AIApiResponse<void>> {
    return this.request<void>(`/api/v1/jobs/${jobId}`, { method: 'DELETE' });
  }

  // Get face clusters
  async getClusters(params?: {
    include_labeled?: boolean;
    include_unlabeled?: boolean;
  }): Promise<AIApiResponse<{ clusters: FaceCluster[]; total: number }>> {
    const searchParams = new URLSearchParams();
    if (params?.include_labeled !== undefined) {
      searchParams.set('include_labeled', String(params.include_labeled));
    }
    if (params?.include_unlabeled !== undefined) {
      searchParams.set('include_unlabeled', String(params.include_unlabeled));
    }
    const query = searchParams.toString() ? `?${searchParams}` : '';
    return this.request(`/api/v1/faces/clusters${query}`);
  }

  // Get single cluster with sample faces
  async getCluster(clusterId: string): Promise<AIApiResponse<{
    cluster: FaceCluster;
    sample_faces: SampleFace[];
  }>> {
    return this.request(`/api/v1/faces/clusters/${clusterId}`);
  }

  // Get ALL faces in a cluster
  async getClusterFaces(clusterId: string): Promise<AIApiResponse<{
    cluster_id: string;
    faces: SampleFace[];
    total: number;
  }>> {
    return this.request(`/api/v1/faces/clusters/${clusterId}/faces`);
  }

  // Assign cluster to Knox contact
  async assignCluster(
    clusterId: string,
    contactId: string,
    name?: string,
    excludeFaceIds?: string[]
  ): Promise<AIApiResponse<void>> {
    return this.request(`/api/v1/faces/clusters/${clusterId}/assign`, {
      method: 'POST',
      body: JSON.stringify({
        knox_contact_id: contactId,
        name,
        exclude_face_ids: excludeFaceIds?.length ? excludeFaceIds : undefined,
      }),
    });
  }

  // Merge multiple clusters
  async mergeClusters(clusterIds: string[]): Promise<AIApiResponse<{ new_cluster_id: string }>> {
    return this.request('/api/v1/faces/clusters/merge', {
      method: 'POST',
      body: JSON.stringify({ cluster_ids: clusterIds }),
    });
  }

  // Run face clustering algorithm
  async runClustering(params?: {
    threshold?: number;
    min_cluster_size?: number;
  }): Promise<AIApiResponse<ProcessingJob>> {
    return this.request('/api/v1/faces/cluster', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  // Clear all clustering data
  async clearClustering(clearThumbnails: boolean = false): Promise<AIApiResponse<{ status: string; message: string }>> {
    const params = clearThumbnails ? '?clear_thumbnails=true' : '';
    return this.request(`/api/v1/faces/clear-clustering${params}`, {
      method: 'POST',
    });
  }

  // Get images linked to a contact
  async getContactImages(contactId: string, limit: number = 50): Promise<AIApiResponse<{
    contact_id: string;
    images: { asset_id: string; thumbnail_url: string }[];
    total: number;
  }>> {
    return this.request(`/api/v1/faces/contact/${contactId}/images?limit=${limit}`);
  }

  // Backfill face thumbnails for existing embeddings
  async backfillFaceThumbnails(): Promise<AIApiResponse<{ job_id: string; status: string }>> {
    return this.request('/api/v1/faces/backfill-thumbnails', {
      method: 'POST',
    });
  }

  // Search by text query
  async searchByText(params: {
    query: string;
    limit?: number;
    threshold?: number;
    user_id?: string;
  }): Promise<AIApiResponse<{ results: SearchResult[]; total: number }>> {
    return this.request('/api/v1/search', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Search by face (find photos of person)
  async searchByFace(params: {
    contact_id?: string;
    cluster_id?: string;
    face_embedding?: number[];
    limit?: number;
    threshold?: number;
  }): Promise<AIApiResponse<{ results: SearchResult[]; total: number }>> {
    return this.request('/api/v1/search/by-face', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Search by detected object (YOLO detection)
  async searchByObject(params: {
    object_class: string;
    min_confidence?: number;
    limit?: number;
  }): Promise<AIApiResponse<{ results: SearchResult[]; total: number; status: string }>> {
    const searchParams = new URLSearchParams({
      object_class: params.object_class,
    });
    if (params.min_confidence !== undefined) {
      searchParams.set('min_confidence', String(params.min_confidence));
    }
    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    return this.request(`/api/v1/search/by-object?${searchParams}`, {
      method: 'POST',
    });
  }

  // Get list of detected object classes
  async getDetectedObjects(): Promise<AIApiResponse<{ objects: { class: string; count: number }[] }>> {
    return this.request('/api/v1/search/objects');
  }

  // Reindex assets (batch process unprocessed assets)
  async reindex(limit: number = 10, offset: number = 0): Promise<AIApiResponse<{
    status: string;
    processed: number;
    errors: number;
    next_offset: number;
    message: string;
  }>> {
    return this.request(`/api/v1/process/reindex?limit=${limit}&offset=${offset}`, {
      method: 'POST',
    });
  }
}

export const aiApi = new AIApiService();
