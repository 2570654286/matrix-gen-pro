export interface AIPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
}

export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

export interface TaskResponse {
  taskId: string;
  status: string;
}

export interface VideoResult {
  videoUrl: string;
  status: string;
}

export interface AIPlugin {
  manifest: AIPluginManifest;

  createRequest(params: {
    prompt: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    aspectRatio?: string;
    mediaType: string;
    videoDuration?: string;
  }): RequestConfig;

  parseTaskResponse(response: any): TaskResponse;

  createStatusRequest(taskId: string, apiKey?: string): RequestConfig;

  parseVideoUrl(response: any): VideoResult;
}