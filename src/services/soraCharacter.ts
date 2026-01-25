import { http } from './apiAdapter';
import { PluginRegistry } from './pluginSystem';
import { MediaType } from '../types';

// 角色创建请求
export interface CreateCharacterRequest {
  url: string;
  timestamps: string;
  from_task?: string;
}

// 角色创建响应 (兼容两种格式)
export interface CharacterResponse {
  display_name?: string;
  id: string;
  username: string;
  permalink: string;
  profile_picture_url: string;
  profile_desc?: string;
  code?: number;
  msg?: string;
  data?: any;
}

// 角色列表响应
export interface CharacterListResponse {
  code: number;
  msg: string;
  data?: Array<{
    id: string;
    username: string;
    permalink: string;
    profile_picture_url: string;
    profile_desc?: string;
    status?: string;
    created_at?: string;
  }>;
}

// 各中转商的 API 配置 (回退配置，用于不支持角色管理的旧提供商)
const PROVIDER_CONFIGS: Record<string, { baseUrl: string; characterEndpoint: string; listEndpoint: string; deleteEndpoint: string; useSoraPrefix?: boolean }> = {
  // GeekNow 中转商 (通过插件支持)
  'geeknow-provider': {
    baseUrl: 'https://api.geeknow.top',
    characterEndpoint: '/sora/v1/characters',
    listEndpoint: '/sora/v1/characters',
    deleteEndpoint: '/sora/v1/characters',
    useSoraPrefix: true
  },
  // Grsai 中转商
  'grsai-provider': {
    baseUrl: 'https://grsai.dakka.com.cn',
    characterEndpoint: '/v1/character/create',
    listEndpoint: '/v1/character/list',
    deleteEndpoint: '/v1/character/delete',
    useSoraPrefix: false
  }
};

// 定义支持角色管理的插件类型
interface CharacterManagementPlugin {
  createCharacter: (apiKey: string, videoUrl: string, timestamps?: string, fromTask?: string) => any;
  getCharacterList: (apiKey: string) => any;
  deleteCharacter: (apiKey: string, characterId: string) => any;
}

// 检查插件是否支持角色管理
const pluginSupportsCharacterManagement = (plugin: any): plugin is CharacterManagementPlugin => {
  return plugin && typeof plugin.createCharacter === 'function' &&
         typeof plugin.getCharacterList === 'function' &&
         typeof plugin.deleteCharacter === 'function';
};

// 获取提供商支持的角色管理方式
const getCharacterProvider = (providerId: string) => {
  const plugin = PluginRegistry.get(providerId);

  // 如果插件支持角色管理，使用插件
  if (pluginSupportsCharacterManagement(plugin)) {
    return { type: 'plugin' as const, provider: plugin };
  }

  // 否则使用硬编码配置
  const config = PROVIDER_CONFIGS[providerId];
  if (config) {
    return { type: 'config' as const, provider: config };
  }

  // 当前选中的视频提供商不支持角色管理，不再回退到 geeknow（避免用智创等密钥调 GeekNow 导致 401）
  const p = PluginRegistry.get(providerId);
  const providerName = (p && typeof (p as any).name === 'string') ? (p as any).name : providerId;
  throw new Error(`当前选中的视频提供商（${providerName}）不支持角色管理。请切换到支持角色功能的提供商（如 GeekNow）后再试。`);
};

// Sora Character API 服务
export const SoraCharacterService = {
  // 创建角色 - 支持插件和硬编码配置
  createCharacter: async (
    apiKey: string,
    videoUrl: string,
    timestamps: string = "0,3",
    fromTask?: string,
    providerId?: string
  ): Promise<any> => {
    const providerData = getCharacterProvider(providerId || 'geeknow-provider');

    if (providerData.type === 'plugin') {
      // 使用插件的方法
      const plugin = providerData.provider as CharacterManagementPlugin;
      const requestConfig = plugin.createCharacter(apiKey, videoUrl, timestamps, fromTask);

      console.log(`[SoraCharacterService] 使用插件创建角色: ${requestConfig.url}`);
      console.log(`[SoraCharacterService] 请求参数:`, JSON.stringify(requestConfig.body, null, 2));

      try {
        const response = await http.request<any>(requestConfig);
        console.log(`[SoraCharacterService] 插件响应:`, JSON.stringify(response, null, 2));

        // 兼容不同格式的响应
        if (response && response.code === 0 && response.data) {
          return response;
        } else if (response && response.id) {
          return { code: 0, data: response };
        } else {
          return response;
        }
      } catch (error) {
        console.error(`[SoraCharacterService] 插件请求失败:`, error);
        throw error;
      }
    } else {
      // 使用硬编码配置
      const config = providerData.provider;
      const cleanHost = config.baseUrl.replace(/\/+$/, '');

      const apiUrl = `${cleanHost}${config.characterEndpoint}`;

      const requestBody = {
        url: videoUrl,
        timestamps: timestamps,
        ...(fromTask && { from_task: fromTask })
      };

      console.log(`[SoraCharacterService] 创建角色: ${apiUrl}`);
      console.log(`[SoraCharacterService] 请求参数:`, JSON.stringify(requestBody, null, 2));

      try {
        const response = await http.post<any>(
          apiUrl,
          requestBody,
          { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
        );

        console.log(`[SoraCharacterService] 原始响应:`, JSON.stringify(response, null, 2));

        // 兼容直接返回和包装格式
        if (response && response.code === 0 && response.data) {
          return response;
        } else if (response && response.id) {
          // 直接返回角色数据
          return { code: 0, data: response };
        } else {
          return response;
        }
      } catch (error) {
        console.error(`[SoraCharacterService] 请求失败:`, error);
        throw error;
      }
    }
  },

  // 获取角色列表 - 支持插件和硬编码配置
  getCharacterList: async (
    apiKey: string,
    providerId?: string
  ): Promise<any> => {
    const providerData = getCharacterProvider(providerId || 'geeknow-provider');

    if (providerData.type === 'plugin') {
      // 使用插件的方法
      const plugin = providerData.provider as CharacterManagementPlugin;
      const requestConfig = plugin.getCharacterList(apiKey);

      console.log(`[SoraCharacterService] 使用插件获取角色列表: ${requestConfig.url}`);

      try {
        const response = await http.request<any>(requestConfig);
        console.log(`[SoraCharacterService] 插件角色列表响应:`, JSON.stringify(response, null, 2));
        return response;
      } catch (error) {
        console.error(`[SoraCharacterService] 插件获取列表失败:`, error);
        throw error;
      }
    } else {
      // 使用硬编码配置
      const config = providerData.provider;
      const cleanHost = config.baseUrl.replace(/\/+$/, '');
      const apiUrl = `${cleanHost}${config.listEndpoint}`;

      console.log(`[SoraCharacterService] 获取角色列表: ${apiUrl}`);

      try {
        const response = await http.get<any>(
          apiUrl,
          { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        );

        console.log(`[SoraCharacterService] 角色列表原始响应:`, JSON.stringify(response, null, 2));

        // 如果响应为空或无效，返回空数组
        if (!response) {
          return { code: 0, data: [] };
        }

        // 如果响应是数组
        if (Array.isArray(response)) {
          return { code: 0, data: response };
        }

        // 如果有 data 字段
        if (response && response.data) {
          if (Array.isArray(response.data)) {
            return { code: 0, data: response.data };
          } else if (typeof response.data === 'object') {
            return { code: 0, data: [response.data] };
          }
        }

        // 其他情况返回空
        return { code: 0, data: [] };
      } catch (error: any) {
        // 如果是解析错误（空响应），也返回空数组
        if (error.message && error.message.includes('decoding response body')) {
          console.warn(`[SoraCharacterService] 列表 API 返回空数据，返回空列表`);
          return { code: 0, data: [] };
        }
        console.error(`[SoraCharacterService] 获取列表失败:`, error);
        throw error;
      }
    }
  },

  // 删除角色 - 支持插件和硬编码配置
  deleteCharacter: async (
    apiKey: string,
    characterId: string,
    providerId?: string
  ): Promise<any> => {
    const providerData = getCharacterProvider(providerId || 'geeknow-provider');

    if (providerData.type === 'plugin') {
      // 使用插件的方法
      const plugin = providerData.provider as CharacterManagementPlugin;
      const requestConfig = plugin.deleteCharacter(apiKey, characterId);

      console.log(`[SoraCharacterService] 使用插件删除角色: ${requestConfig.url}`);

      try {
        const response = await http.request<any>(requestConfig);
        return response;
      } catch (error) {
        console.error(`[SoraCharacterService] 插件删除失败:`, error);
        throw error;
      }
    } else {
      // 使用硬编码配置
      const config = providerData.provider;
      const cleanHost = config.baseUrl.replace(/\/+$/, '');

      let apiUrl: string;
      if (config.useSoraPrefix) {
        apiUrl = `${cleanHost}${config.deleteEndpoint}/${characterId}`;
      } else {
        apiUrl = `${cleanHost}${config.deleteEndpoint}`;
      }

      console.log(`[SoraCharacterService] 删除角色: ${apiUrl}`);

      try {
        const response = await http.request<any>({
          method: 'DELETE',
          url: apiUrl,
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });

        return response;
      } catch (error) {
        console.error(`[SoraCharacterService] 删除失败:`, error);
        throw error;
      }
    }
  }
};
