import { MediaType, VideoDuration } from '../types';

// Plugin Manifest
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
}

// Request Configuration
export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Task Response
export interface TaskResponse {
  taskId: string;
  status: string;
}

// Status Response
export interface StatusResponse {
  url?: string;
  status: string;
}

// Generation Parameters
export interface GenerationParams {
  prompt: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  aspectRatio: string;
  mediaType: MediaType;
  videoDuration: VideoDuration;
}

// AI Plugin Interface
export interface AIPlugin {
  manifest: PluginManifest;

  // Create request for generation endpoint
  createRequest(params: GenerationParams): RequestConfig;

  // Parse task response to extract taskId and status
  parseTaskResponse(response: any): TaskResponse;

  // Create request for checking progress
  createStatusRequest(taskId: string, apiKey: string): RequestConfig;

  // Parse status response to extract final video URL and status
  parseVideoUrl(response: any): StatusResponse;
}