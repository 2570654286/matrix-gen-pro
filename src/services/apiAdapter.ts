import { invoke } from '@tauri-apps/api/core'; // Tauri 2.0 核心库

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  token?: string;
}

export interface Response<T = any> {
  status: number;
  data: T;
}

export const http = {
  request: async <T = any>(options: RequestOptions): Promise<T> => {
    try {
      // 调用 Rust 后端命令 'proxy_http_request'
      const response = await invoke<Response<T>>('proxy_http_request', {
        options: {
          method: options.method,
          url: options.url,
          headers: options.headers || {},
          body: options.body ? options.body : null, // Rust 接收 Option<Value>
          token: options.token
        }
      });

      if (response.status >= 200 && response.status < 1000) {
        return response.data;
      } else {
        throw new Error(`API Error ${response.status}: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      console.error('[Tauri API Error]', error);
      throw error;
    }
  },

  get: <T = any>(url: string, headers?: Record<string, string>) => 
    http.request<T>({ method: 'GET', url, headers }),

  post: <T = any>(url: string, body: any, headers?: Record<string, string>, token?: string) => 
    http.request<T>({ method: 'POST', url, body, headers, token }),
};

export const shell = {
  open: async (path: string) => {
    try {
      // 调用 Tauri Shell 插件的底层命令打开文件或文件夹
      // 注意：这需要你的 Rust 后端启用了 plugin-shell
      await invoke('plugin:shell|open', { path });
    } catch (error) {
      console.error('[Shell] Failed to open path:', error);
    }
  }
};