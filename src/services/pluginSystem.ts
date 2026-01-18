import { MediaType, VideoDuration, ApiPlugin, GenerationPayload } from '../types';
import { http } from './apiAdapter';

import { loadExternalPlugins } from './pluginLoader';
import type { AIPlugin } from '../types/plugin';

// --- 1. Default Plugin (Mock / Universal) ---
const UniversalMockPlugin: ApiPlugin = {
  id: 'universal-mock',
  name: 'Universal Mock Provider',
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
  name: 'Custom API Provider',   // 这里是在下拉菜单中显示的名字
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

// --- Convert AIPlugin to ApiPlugin ---
function aiPluginToApiPlugin(aiPlugin: AIPlugin): ApiPlugin {
  return {
    id: aiPlugin.manifest.id,
    name: aiPlugin.manifest.name,
    description: aiPlugin.manifest.description,

    getSupportedModels: (mediaType: MediaType) => {
      // AIPlugin is primarily for video generation
      if (mediaType === MediaType.VIDEO) {
        return ['sora_2_0', 'sora_2_0_turbo', 'veo_3_1-fast', 'gen-2', 'gen-3-alpha', 'kling-1.0'];
      }
      return [];
    },

    generate: async (payload: GenerationPayload, onProgress?: (p: number) => void): Promise<string> => {
      console.log(`[Plugin: ${aiPlugin.manifest.name}] Starting async generation...`);

      // Step 1: Create initial request
      const requestConfig = aiPlugin.createRequest(payload) as any;

      // Step 2: Prepare request options
      const requestOptions: any = {
        method: requestConfig.method as any,
        url: requestConfig.url,
        headers: requestConfig.headers,
      };

      // Handle multipart/form-data if specified
      if (requestConfig.useMultipart) {
        requestOptions.body = requestConfig.body;
        requestOptions.headers = {
          ...requestOptions.headers,
          'X-Use-Multipart': 'true'
        };
      } else {
        requestOptions.body = requestConfig.body;
      }

      // Step 3: Send initial request
      const response = await http.request<any>(requestOptions);

      // Step 3: Parse task response
      const taskInfo = aiPlugin.parseTaskResponse(response);
      let taskId = taskInfo.taskId;
      let status = taskInfo.status;

      onProgress?.(10);

      // Step 4: Poll for completion
      const maxRetries = 60; // 5 minutes with 5s intervals
      const pollInterval = 5000;
      let attempts = 0;

      while (status !== 'completed' && status !== 'success' && attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;

        const statusRequest = aiPlugin.createStatusRequest(taskId, payload.apiKey || '');
        const statusResponse = await http.request<any>({
          method: statusRequest.method as any,
          url: statusRequest.url,
          headers: statusRequest.headers,
          body: statusRequest.body,
        });

        const statusInfo = aiPlugin.parseVideoUrl(statusResponse);
        status = statusInfo.status;

        // Use API progress if available, otherwise fallback to calculated progress
        const apiProgress = statusInfo.progress;
        const calculatedProgress = Math.min(90, 10 + (attempts / maxRetries) * 80);
        const progress = (typeof apiProgress === 'number') ? apiProgress : Math.round(calculatedProgress);
        onProgress?.(progress);

        if (status === 'completed' || status === 'success') {
          return statusInfo.url || '';
        } else if (status === 'failed' || status === 'error') {
          throw new Error('Video generation failed');
        }
      }

      if (attempts >= maxRetries) {
        throw new Error('Video generation timeout');
      }

      // This should not be reached, but just in case
      throw new Error('Unexpected polling end');
    }
  };
}

// --- Load External Plugins ---
let externalPluginsLoaded = false;
let loadedPlugins: Record<string, ApiPlugin> = {};

async function loadExternalPluginsIntoRegistry() {
  if (externalPluginsLoaded) return;

  try {
    const externalAIPlugins = await loadExternalPlugins();
    const convertedPlugins: Record<string, ApiPlugin> = {};

    for (const aiPlugin of externalAIPlugins) {
      const apiPlugin = aiPluginToApiPlugin(aiPlugin);
      convertedPlugins[apiPlugin.id] = apiPlugin;
    }

    loadedPlugins = convertedPlugins;
    externalPluginsLoaded = true;

    console.log(`[PluginSystem] Loaded ${Object.keys(loadedPlugins).length} external plugins`);
  } catch (error) {
    console.error('[PluginSystem] Failed to load external plugins:', error);
  }
}

// --- 4. Plugin Registry (注册表) ---
// 您的插件必须添加到这里才能生效！
// Note: All API provider plugins have been moved to external plugins in the plugins folder
const plugins: Record<string, ApiPlugin> = {
  [UniversalMockPlugin.id]: UniversalMockPlugin,

  // === 在这里启用您的自定义插件 ===
  [MyCustomPlugin.id]: MyCustomPlugin,
};

let externalPlugins: ApiPlugin[] = [];

export const PluginRegistry = {
  getAll: () => [...Object.values(plugins), ...externalPlugins],
  get: (id: string) => {
    return externalPlugins.find(p => p.id === id) || plugins[id] || UniversalMockPlugin;
  },
  setExternalPlugins: (extPlugins: ApiPlugin[]) => {
    externalPlugins = extPlugins;
  },
};

// --- External Plugin Management ---
export async function loadAndConvertExternalPlugins(): Promise<ApiPlugin[]> {
  try {
    const externalAIPlugins = await loadExternalPlugins();
    const convertedPlugins: ApiPlugin[] = [];

    for (const aiPlugin of externalAIPlugins) {
      const apiPlugin = aiPluginToApiPlugin(aiPlugin);
      convertedPlugins.push(apiPlugin);
    }

    console.log(`[PluginSystem] Loaded ${convertedPlugins.length} external plugins`);
    return convertedPlugins;
  } catch (error) {
    console.error('[PluginSystem] Failed to load external plugins:', error);
    return [];
  }
}

// --- Clear and Reload Plugins ---
export async function clearAndReloadPlugins(): Promise<ApiPlugin[]> {
  try {
    console.log('[PluginSystem] Clearing and reloading external plugins...');

    // Clear the loaded plugins cache (if any)
    externalPluginsLoaded = false;
    loadedPlugins = {};

    // Set external plugins to empty array temporarily
    PluginRegistry.setExternalPlugins([]);

    // Reload external plugins
    const reloadedPlugins = await loadAndConvertExternalPlugins();

    // Update the registry with reloaded plugins
    PluginRegistry.setExternalPlugins(reloadedPlugins);

    console.log(`[PluginSystem] Successfully reloaded ${reloadedPlugins.length} external plugins`);
    return reloadedPlugins;
  } catch (error) {
    console.error('[PluginSystem] Failed to clear and reload plugins:', error);
    return [];
  }
}