export const APP_VERSION = '1.0.0'; // Current software version

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  TEXT = 'text',
}

export type VideoDuration = '10s' | '15s';

export interface Job {
  id: string;
  prompt: string;
  status: JobStatus;
  resultUrl?: string;
  fileName?: string;
  error?: string;
  createdAt: number;
  duration?: number;
  progress?: number; // New field: 0-100
  mediaType: MediaType; // Track which media type this job belongs to
}

export interface AppSettings {
  // Connection / Plugin
  providerId: string; // The ID of the selected plugin (e.g., 'universal', 'runway-proxy', 'mj-proxy')
  apiKey: string;
  baseUrl: string;
  
  // Model Config (Separated by media type)
  llmModel: string;
  imageModel: string;
  videoModel: string;
  
  // Per-category Provider & Key
  llmProviderId?: string;
  llmApiKey?: string;
  imageProviderId?: string;
  imageApiKey?: string;
  videoProviderId?: string;
  videoApiKey?: string;
  
  // Generation Params
  aspectRatio: string;
  mediaType: MediaType;
  videoDuration: VideoDuration; // New: 10s or 15s
  
  // Queue Config
  batchSize: number;
  concurrency: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  providerId: 'sora-veo-cloud', // Default to the new plugin
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1', // This should be updated by user to their actual middleware URL
  llmModel: 'gpt-4o',
  imageModel: 'dall-e-3',
  videoModel: 'veo_3_1-fast', // Default to a model supported by the new plugin
  
  llmProviderId: 'universal-mock',
  llmApiKey: '',
  imageProviderId: 'sora-veo-cloud',
  imageApiKey: '',
  videoProviderId: 'sora-veo-cloud',
  videoApiKey: '',
  
  aspectRatio: '1920x1080', // Default to 16:9
  mediaType: MediaType.VIDEO, // Default to Video
  videoDuration: '15s', // Default to 15s
  batchSize: 2, // Default to 2
  concurrency: 20, // Default to 20
};

export interface GenerationPayload {
  prompt: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  aspectRatio: string;
  mediaType: MediaType;
  videoDuration: VideoDuration;
}

export interface ApiPlugin {
  id: string;
  name: string;
  description: string;
  getSupportedModels: (mediaType: MediaType) => string[];
  generate: (
    payload: GenerationPayload, 
    onProgress?: (percent: number) => void
  ) => Promise<string>;
}