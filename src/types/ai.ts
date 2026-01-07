/**
 * AI Processing Types
 * Interfaces for Kizu-AI API integration
 */

// Processing operation types
export type ProcessingOperation = 'embedding' | 'faces' | 'objects' | 'ocr' | 'describe' | 'all';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Bounding box for detected items
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Face detection result
export interface FaceDetection {
  face_index?: number;
  index?: number;  // API returns 'index'
  bounding_box?: BoundingBox;
  confidence: number;
  cluster_id?: string;
  knox_contact_id?: string;
  embedding?: number[];
}

// Object detection result
export interface DetectedObject {
  class_name?: string;
  class?: string;  // API returns 'class'
  confidence: number;
  bounding_box?: BoundingBox;
}

// Single image processing result
export interface ProcessingResult {
  asset_id?: string;
  embedding?: number[];
  faces?: FaceDetection[];
  objects?: DetectedObject[];
  text?: string;
  description?: string;
  processing_time_ms?: number;
}

// Background processing job
export interface ProcessingJob {
  id: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  processed: number;
  total: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// Face cluster
export interface FaceCluster {
  id: string;
  name?: string;
  knox_contact_id?: string;
  face_count: number;
  representative_face_id?: string;
  updated_at?: string;
}

// Sample face in a cluster
export interface SampleFace {
  id?: string;
  asset_id: string;
  face_index: number;
  thumbnail_url?: string;
  bounding_box?: BoundingBox;
  is_from_video?: boolean;
}

// Response for all faces in a cluster
export interface ClusterFacesResponse {
  cluster_id: string;
  faces: SampleFace[];
  total: number;
}

// Search result
export interface SearchResult {
  asset_id: string;
  similarity: number;
  thumbnail_url?: string;
  web_uri?: string;
  matched_objects?: string[];
  matched_faces?: string[];
  metadata?: Record<string, unknown>;
}

// API health status
export interface AIHealthStatus {
  status: string;
  version: string;
  device: string;
  models_loaded: string[];
  uptime_seconds?: number;
}

// Generic API response wrapper
export interface AIApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}
