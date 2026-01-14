import { http } from './apiAdapter';
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

// 各中转商的 API 配置
const PROVIDER_CONFIGS: Record<string, { baseUrl: string; characterEndpoint: string; listEndpoint: string; deleteEndpoint: string; useSoraPrefix?: boolean }> = {
  // GeekNow 中转商
  'sora-veo-cloud': {
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

// 获取当前中转商的配置
const getProviderConfig = (providerId: string) => {
  // 默认使用 GeekNow
  return PROVIDER_CONFIGS[providerId] || PROVIDER_CONFIGS['sora-veo-cloud'];
};

// Sora Character API 服务
export const SoraCharacterService = {
  // 创建角色 - 根据提供商动态选择 API 地址
  createCharacter: async (
    apiKey: string,
    videoUrl: string,
    timestamps: string = "0,3",
    fromTask?: string,
    providerId?: string
  ): Promise<any> => {
    const config = getProviderConfig(providerId || 'sora-veo-cloud');
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
  },

  // 获取角色列表 - 根据提供商动态选择 API 地址
  getCharacterList: async (
    apiKey: string,
    providerId?: string
  ): Promise<any> => {
    const config = getProviderConfig(providerId || 'sora-veo-cloud');
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
  },

  // 删除角色 - 根据提供商动态选择 API 地址
  deleteCharacter: async (
    apiKey: string,
    characterId: string,
    providerId?: string
  ): Promise<any> => {
    const config = getProviderConfig(providerId || 'sora-veo-cloud');
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
};
