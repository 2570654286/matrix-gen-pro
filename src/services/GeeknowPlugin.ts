import { ApiPlugin, GenerationPayload, MediaType } from '../types';
import { http } from './apiAdapter';

export const GeeknowPlugin: ApiPlugin = {
  id: 'sora-veo-cloud',
  name: 'GeekNow (Sora/Veo Cloud)',
  description: '基于 System Proxy (Rust) 的 Sora 和 Veo 视频生成中转服务',
  
  getSupportedModels: (mediaType: MediaType) => {
    if (mediaType === MediaType.IMAGE) {
      return ['dall-e-3', 'mj-v6'];
    }
    // 视频模型
    return ['sora_2_0', 'sora_2_0_turbo', 'sora-2', 'veo_3_1-fast', 'veo_3_1-pro'];
  },

  generate: async (payload: GenerationPayload, onProgress?: (p: number) => void): Promise<string> => {
    // 确定使用哪个 API key 和 baseUrl
    const activeApiKey = payload.apiKey;
    
    // GeekNow 固定使用 https://api.geeknow.top/v1
    const cleanBaseUrl = 'https://api.geeknow.top/v1';

    // --- Image Handler ---
    if (payload.mediaType === MediaType.IMAGE) {
        if (onProgress) onProgress(10);
        let url = `${cleanBaseUrl}/images/generations`;
        
        const data = await http.post<{ data: { url: string }[] }>(
            url,
            {
                model: payload.model,
                prompt: payload.prompt,
                n: 1,
                size: "1024x1024",
                response_format: "url"
            },
            { 'Content-Type': 'application/json' },
            activeApiKey
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

    // 提交视频生成任务
    const submitUrl = `${cleanBaseUrl}/videos`;
    
    console.log('[GeeknowPlugin] Submitting video generation request:', submitUrl);
    
    const submitData = await http.post<{ id: string }>(
        submitUrl,
        requestBody,
        { 'Content-Type': 'application/json' },
        activeApiKey
    );

    const taskId = submitData.id;
    if (!taskId) throw new Error('API did not return a valid Task ID');
    
    console.log('[GeeknowPlugin] Task ID received:', taskId);

    // Polling Logic - 15分钟超时
    const POLLING_INTERVAL = 5000; // 5秒轮询一次
    const MAX_ATTEMPTS = 180; // 15 分钟 (180 * 5秒 = 900秒)
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        attempts++;

        try {
            const statusUrl = `${cleanBaseUrl}/videos/${taskId}`;
            
            const statusData = await http.request<{ 
                status: string; 
                progress?: number; 
                video_url?: string; 
                error?: any; 
                message?: string;
            }>({
                method: 'GET',
                url: statusUrl,
                headers: { 'Content-Type': 'application/json' },
                token: activeApiKey
            });
            
            console.log(`[GeeknowPlugin] Status check ${attempts}:`, statusData);
            
            const status = statusData.status?.toLowerCase(); 
            
            // 更新进度
            if (statusData.progress !== undefined && onProgress) {
                let p = Math.max(10, Math.min(99, Number(statusData.progress)));
                onProgress(p);
            }

            // 检查完成状态（兼容多种状态值）
            if (status === 'completed' || status === 'succeeded' || status === 'success') {
                console.log('[GeeknowPlugin] Video generation completed');
                if (onProgress) onProgress(100);
                if (statusData.video_url) return statusData.video_url;
                throw new Error('Task completed but missing video_url');
            }

            // 检查失败状态
            if (status === 'failed' || status === 'error' || status === 'cancelled') {
                const msg = statusData.error?.message || statusData.message || 'Unknown error';
                throw new Error(`Cloud API Error: ${msg}`);
            }

            // 处理排队中状态
            if (status === 'pending' || status === 'queued' || status === 'processing') {
                console.log(`[GeeknowPlugin] Task still ${status}, waiting...`);
            }

        } catch (pollErr) {
             console.warn('Polling check failed:', pollErr);
             // 如果是超时继续尝试
             if (attempts >= MAX_ATTEMPTS) {
                 throw new Error('Video generation timed out after 15 minutes');
             }
        }
    }
    throw new Error('Video generation timed out after 15 minutes of polling');
  }
};