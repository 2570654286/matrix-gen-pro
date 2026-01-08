import { http } from './apiAdapter';

// 角色创建请求
export interface CreateCharacterRequest {
  url: string;
  timestamps: string;
  from_task?: string;
}

// 角色创建响应
export interface CharacterResponse {
  code: number;
  msg: string;
  data?: {
    id: string;
    username: string;
    permalink: string;
    profile_picture_url: string;
    profile_desc?: string;
  };
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

// Sora Character API 服务
// 固定使用 GeekNow 中转商 API
export const SoraCharacterService = {
  // 固定的 API 地址
  getBaseUrl: () => 'https://api.geeknow.top',

  // 创建角色 - 基于视频URL和时间戳
  createCharacter: async (
    apiKey: string,
    videoUrl: string,
    timestamps: string = "0,3",
    fromTask?: string
  ): Promise<CharacterResponse> => {
    const cleanHost = SoraCharacterService.getBaseUrl();
    const endpoint = '/sora/v1/characters';
    
    const requestBody: CreateCharacterRequest = {
      url: videoUrl,
      timestamps: timestamps
    };
    
    if (fromTask) {
      requestBody.from_task = fromTask;
    }
    
    const response = await http.post<CharacterResponse>(
      `${cleanHost}${endpoint}`,
      requestBody,
      { 'Authorization': `Bearer ${apiKey}` }
    );
    
    return response;
  },

  // 获取角色列表
  getCharacterList: async (
    apiKey: string
  ): Promise<CharacterListResponse> => {
    const cleanHost = SoraCharacterService.getBaseUrl();
    const endpoint = '/sora/v1/characters';
    
    const response = await http.get<CharacterListResponse>(
      `${cleanHost}${endpoint}`,
      { 'Authorization': `Bearer ${apiKey}` }
    );
    
    return response;
  },

  // 删除角色
  deleteCharacter: async (
    apiKey: string,
    characterId: string
  ): Promise<CharacterResponse> => {
    const cleanHost = SoraCharacterService.getBaseUrl();
    const endpoint = `/sora/v1/characters/${characterId}`;
    
    const response = await http.request<CharacterResponse>({
      method: 'DELETE',
      url: `${cleanHost}${endpoint}`,
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    return response;
  }
};
