import { ApiPlugin, GenerationPayload, MediaType } from '../types';
import { http } from './apiAdapter';

// 辅助函数：将宽高比字符串转换为 API 需要的比例格式
const mapAspectRatio = (ratio: string): string => {
  switch (ratio) {
    case '16:9':
    case '1920x1080':
      return '16:9';
    case '9:16':
    case '1080x1920':
      return '9:16';
    case '1:1':
    case '1024x1024':
      return '1:1';
    case '4:3':
      return '4:3';
    case '3:4':
      return '3:4';
    default:
      return '16:9'; // 默认值
  }
};

// 辅助函数：将 '10s' 字符串转换为数字
const parseDuration = (durationStr: string): number => {
  const match = durationStr.match(/(\d+)/);
  return match ? parseInt(match[0], 10) : 10;
};

// 辅助函数：延迟等待
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ⭐️ 核心优化：Base URL 清洗函数
const normalizeBaseUrl = (url: string): string => {
  // 1. 去除末尾的所有斜杠 (https://host.com/ -> https://host.com)
  let cleanUrl = url.replace(/\/+$/, '');
  
  // 2. 如果末尾是 /v1，也去掉 (防止拼成 /v1/v1/)
  if (cleanUrl.endsWith('/v1')) {
    cleanUrl = cleanUrl.slice(0, -3);
  }
  
  return cleanUrl;
};

export const GrsaiPlugin: ApiPlugin = {
  id: 'grsai-provider',
  name: 'Grsai (Sora/Veo/Nano)',
  description: '支持 Sora-2, Veo3 和 Nano-Banana 模型的聚合接口',

  getSupportedModels: (mediaType: MediaType) => {
    if (mediaType === 'video') {
      return [
        'sora_2_0',
        'sora_2_0_turbo',
        'sora-2',
        'veo3.1-fast',
        'veo3.1-pro',
        'veo3-fast',
        'veo3-pro',
      ];
    }
    return [
      'nano-banana-fast',
      'nano-banana',
      'nano-banana-pro',
      'nano-banana-pro-vt',
      'nano-banana-pro-cl',
      'nano-banana-pro-vip',
      'nano-banana-pro-4k-vip',
    ];
  },

  generate: async (payload: GenerationPayload, onProgress?: (percent: number) => void): Promise<string> => {
    const { apiKey, model, prompt, mediaType, aspectRatio, videoDuration } = payload;
    const baseUrl = 'https://grsai.dakka.com.cn';

    // 1. 确定 API 端点 (Endpoint 已经包含了 /v1)
    let endpoint = '';
    if (mediaType === 'video') {
      if (model.includes('sora')) {
        endpoint = '/v1/video/sora-video';
      } else if (model.includes('veo')) {
        endpoint = '/v1/video/veo';
      } else {
        throw new Error(`未知的视频模型: ${model}`);
      }
    } else {
      endpoint = '/v1/draw/nano-banana';
    }

    // ⭐️ 使用清洗后的 BaseURL 进行拼接
    // 效果：无论用户填 "host.com" 还是 "host.com/v1/"，最终都会正确变成 "host.com/v1/..."
    const cleanHost = normalizeBaseUrl(baseUrl);
    const apiUrl = `${cleanHost}${endpoint}`;

    // 2. 构建请求体
    const requestBody: any = {
      model: model,
      prompt: prompt,
      webHook: '-1', // 强制返回 ID 用于轮询
      shutProgress: false, 
    };

    const apiRatio = mapAspectRatio(aspectRatio);
    
    if (mediaType === 'video') {
      requestBody.aspectRatio = apiRatio;
      requestBody.duration = parseDuration(videoDuration);
    } else {
      requestBody.aspectRatio = apiRatio === '16:9' ? '16:9' : apiRatio;
    }

    // 3. 发送初始任务请求
    console.log(`[GrsaiPlugin] Submitting task via ${apiUrl}...`);
    
    // 使用 http 适配器 (自动处理 CORS 和 Authorization)
    // 注意：http.post 第4个参数是 token，会自动添加到 Authorization: Bearer ...
    const submitData = await http.post<any>(
      apiUrl,
      requestBody,
      undefined, // headers
      apiKey     // token
    );
    
    if (submitData.code !== 0) {
      throw new Error(`任务提交失败: ${submitData.msg || '未知错误'}`);
    }

    const taskId = submitData.data?.id;
    if (!taskId) {
      throw new Error('API 未返回任务 ID，无法进行轮询');
    }

    console.log(`[GrsaiPlugin] Task submitted. ID: ${taskId}. Starting polling...`);

    // 4. 轮询查结果
    // 使用清洗后的 Host 拼接查询接口
    const resultUrl = `${cleanHost}/v1/draw/result`;
    const maxAttempts = 600; // 增加到 30 分钟 (600 * 3秒)
    const intervalMs = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await sleep(intervalMs);

      try {
        const pollData = await http.post<any>(
          resultUrl,
          { id: taskId },
          undefined,
          apiKey
        );

        // -22 代表任务不存在或正在初始化，继续等待
        if (pollData.code === -22) continue;

        if (pollData.code !== 0) {
            throw new Error(`轮询错误: ${pollData.msg}`);
        }

        const taskData = pollData.data;
        const status = taskData?.status;

        console.log(`[GrsaiPlugin] Polling status: ${status}, Progress: ${taskData?.progress}%`);

        // ⭐️ 更新 UI 进度条
        if (onProgress && taskData?.progress) {
          onProgress(Number(taskData.progress));
        }

        if (status === 'succeeded') {
          // 成功！提取 URL (兼容不同模型的返回结构)
          let finalUrl = '';

          if (taskData.url && typeof taskData.url === 'string') {
             // Veo 风格
             finalUrl = taskData.url;
          } else if (Array.isArray(taskData.results) && taskData.results.length > 0) {
             // Sora / Nano 风格
             finalUrl = taskData.results[0].url;
          }

          if (finalUrl) {
            return finalUrl;
          } else {
            throw new Error('任务成功但未找到有效的 URL');
          }

        } else if (status === 'failed') {
          throw new Error(`生成失败: ${taskData.failure_reason || taskData.error || '未知原因'}`);
        }

      } catch (err) {
        console.warn(`[GrsaiPlugin] Polling attempt ${i + 1} warning:`, err);
        // 如果是明确的生成失败错误，不再重试，直接抛出
        if (err instanceof Error && err.message.includes('生成失败')) {
            throw err;
        }
      }
    }

    throw new Error('生成超时，请稍后在历史记录中查看');
  },
};