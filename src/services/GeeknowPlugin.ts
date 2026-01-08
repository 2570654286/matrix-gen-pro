import { ApiPlugin, GenerationPayload, MediaType } from '../types';
import { http } from './apiAdapter';

export const GeeknowPlugin: ApiPlugin = {
  id: 'sora-veo-cloud',
  name: 'Sora/Veo Cloud API',
  description: 'Specialized adapter using System Proxy (Rust) to avoid CORS.',
  
  getSupportedModels: (mediaType: MediaType) => {
    if (mediaType === MediaType.IMAGE) {
      return ['dall-e-3', 'mj-v6'];
    }
    // 视频模型
    return ['sora_2_0', 'sora_2_0_turbo', 'sora-2', 'veo_3_1-fast', 'veo_3_1-pro'];
  },

  generate: async (payload: GenerationPayload, onProgress?: (p: number) => void): Promise<string> => {
    const cleanBaseUrl = 'https://api.geeknow.top/v1';

    // --- Image Handler ---
    if (payload.mediaType === MediaType.IMAGE) {
        if (onProgress) onProgress(10);
        let url = `${cleanBaseUrl}/images/generations`;
        if (!cleanBaseUrl.endsWith('/v1') && !url.includes('/v1/')) {
            url = `${cleanBaseUrl}/v1/images/generations`;
        } else if (cleanBaseUrl.endsWith('/v1')) {
            url = `${cleanBaseUrl}/images/generations`;
        }

        const data = await http.post<{ data: { url: string }[] }>(
            url,
            {
                model: payload.model,
                prompt: payload.prompt,
                n: 1,
                size: "1024x1024",
                response_format: "url"
            },
            undefined, 
            payload.apiKey 
        );
        
        if (onProgress) onProgress(100);
        return data.data?.[0]?.url || '';
    }

    // --- Video Handler ---
    console.log('[GeeknowPlugin] Starting Video Generation Flow...');
    if (onProgress) onProgress(5);

    let size = '1280x720'; 
    if (payload.aspectRatio === '1080x1920') {
        size = '720x1280'; 
    } else if (payload.aspectRatio === '1024x1024') {
        size = '1024x1024';
    }
    const seconds = payload.videoDuration === '15s' ? '15' : '10';

    const requestBody = {
        model: payload.model,
        prompt: payload.prompt,
        size: size,
        seconds: seconds
    };

    let submitUrl = `${cleanBaseUrl}/videos`;
    if (!cleanBaseUrl.endsWith('/v1')) {
        submitUrl = `${cleanBaseUrl}/v1/videos`;
    }

    const submitData = await http.post<{ id: string }>(
        submitUrl,
        requestBody,
        undefined,
        payload.apiKey
    );

    const taskId = submitData.id;
    if (!taskId) throw new Error('API did not return a valid Task ID');

    // Polling Logic
    const POLLING_INTERVAL = 3000;
    const MAX_ATTEMPTS = 600; // 增加到 30 分钟 (600 * 3秒)
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        attempts++;

        try {
            let statusUrl = `${cleanBaseUrl}/videos/${taskId}`;
            if (!cleanBaseUrl.endsWith('/v1')) {
                statusUrl = `${cleanBaseUrl}/v1/videos/${taskId}`;
            }

            const statusData = await http.request<{ 
                status: string; 
                progress?: number; 
                video_url?: string; 
                error?: any; 
                message?: string;
            }>({
                method: 'GET',
                url: statusUrl,
                token: payload.apiKey
            });
            
            const status = statusData.status; 
            if (statusData.progress !== undefined && onProgress) {
                let p = Math.max(10, Math.min(99, Number(statusData.progress)));
                onProgress(p);
            }

            if (status === 'completed' || status === 'succeeded') {
                if (onProgress) onProgress(100);
                if (statusData.video_url) return statusData.video_url;
                throw new Error('Task completed but missing video_url');
            }

            if (status === 'failed') {
                const msg = statusData.error?.message || statusData.message || 'Unknown error';
                throw new Error(`Cloud API Error: ${msg}`);
            }

        } catch (pollErr) {
             console.warn('Polling check failed:', pollErr);
        }
    }
    throw new Error('Video generation timed out.');
  }
};