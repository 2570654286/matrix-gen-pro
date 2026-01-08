import { MediaType, VideoDuration, ApiPlugin, GenerationPayload } from '../types';
import { http } from './apiAdapter';
import { GrsaiPlugin } from './GrsaiPlugin';
import { GeeknowPlugin } from './GeeknowPlugin';

// --- 1. Default Plugin (Mock / Universal) ---
const UniversalMockPlugin: ApiPlugin = {
  id: 'universal-mock',
  name: 'Universal / Mock Adapter',
  description: 'Generic adapter for development or standard OpenAI-compatible endpoints.',
  
  getSupportedModels: (mediaType: MediaType) => {
    if (mediaType === MediaType.IMAGE) {
      return ['dall-e-3', 'stable-diffusion-xl', 'midjourney-v6'];
    }
    if (mediaType === MediaType.TEXT) {
      return ['gpt-4o', 'gpt-3.5-turbo', 'claude-3-opus'];
    }
    return ['sora_2_0', 'sora_2_0_turbo', 'veo_3_1-fast', 'gen-2', 'gen-3-alpha', 'kling-1.0'];
  },

  generate: async (payload: GenerationPayload, onProgress?: (p: number) => void): Promise<string> => {
    console.log(`[Plugin: ${UniversalMockPlugin.name}] Generating ${payload.mediaType}...`);
    
    // Simulate network delay
    const steps = 10;
    const interval = 300;
    
    for (let i = 1; i <= steps; i++) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        const progress = Math.floor((i / steps) * 100);
        if (onProgress) onProgress(progress);
    }

    if (payload.mediaType === MediaType.VIDEO) {
      return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";
    } else {
      const seed = Math.floor(Math.random() * 1000);
      return `https://picsum.photos/seed/${seed}/1024/1024`;
    }
  }
};

// --- 3. Custom Plugin Template (粘贴您的代码并修改这里) ---
const MyCustomPlugin: ApiPlugin = {
  id: 'my-custom-plugin', // 确保这个ID是唯一的
  name: '我的自定义 API',   // 这里是在下拉菜单中显示的名字
  description: '这是您自定义的中间件插件。',
  
  getSupportedModels: (mediaType: MediaType) => {
    // 返回您插件支持的模型列表
    if (mediaType === MediaType.IMAGE) return ['custom-image-model'];
    return ['custom-video-model'];
  },

  generate: async (payload: GenerationPayload, onProgress?: (p: number) => void): Promise<string> => {
    // 在这里实现您的 API 调用逻辑
    // 使用 http.post 或 http.get
    console.log('Generating with Custom Plugin', payload);
    
    // 示例：
    /*
    const response = await http.post(payload.baseUrl + '/generate', { 
        prompt: payload.prompt,
        key: payload.apiKey
    });
    return response.url;
    */

    // 临时返回模拟数据
    if (onProgress) onProgress(50);
    await new Promise(r => setTimeout(r, 1000));
    if (onProgress) onProgress(100);
    
    return payload.mediaType === MediaType.VIDEO 
        ? "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4"
        : "https://picsum.photos/1024/1024";
  }
};

// --- 4. Plugin Registry (注册表) ---
// 您的插件必须添加到这里才能生效！
const plugins: Record<string, ApiPlugin> = {
  [UniversalMockPlugin.id]: UniversalMockPlugin,
  [GeeknowPlugin.id]: GeeknowPlugin,
  [GrsaiPlugin.id]: GrsaiPlugin,
  
  // === 在这里启用您的自定义插件 ===
  [MyCustomPlugin.id]: MyCustomPlugin, 
};

export const PluginRegistry = {
  getAll: () => Object.values(plugins),
  get: (id: string) => plugins[id] || UniversalMockPlugin,
};