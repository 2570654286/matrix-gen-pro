export interface AIPlugin {
  manifest: {
    id: string;
    name: string;
    version: string;
    description: string;
  };
  createRequest(params: any): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
  };
  parseTaskResponse(response: any): {
    taskId: string;
    status: string;
  };
  createStatusRequest(taskId: string, apiKey: string): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
  };
  parseVideoUrl(response: any): {
    videoUrl: string;
    status: string;
  };
}