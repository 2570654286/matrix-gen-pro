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
    const startTime = Date.now();
    console.log(`[API] ─────────────────────────────────────────────────────────────`);
    console.log(`[API] Request: ${options.method} ${options.url}`);
    console.log(`[API] Headers:`, JSON.stringify(options.headers, null, 2));
    if (options.body) {
      console.log(`[API] Body:`, JSON.stringify(options.body, null, 2));
    }
    
    try {
      // 调用 Rust 后端命令 'proxy_http_request'
      const response = await invoke<Response<T>>('proxy_http_request', {
        options: {
          method: options.method,
          url: options.url,
          headers: options.headers || {},
          body: options.body ? options.body : null,
          token: options.token
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[API] Response (${response.status}) - ${duration}ms`);
      console.log(`[API] Response Data:`, JSON.stringify(response.data, null, 2));
      console.log(`[API] ─────────────────────────────────────────────────────────────\n`);

      if (response.status >= 200 && response.status < 1000) {
        return response.data;
      } else {
        const errorMsg = `API Error ${response.status}: ${JSON.stringify(response.data)}`;
        console.error(`[API] Error: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[API] Request Failed (${duration}ms):`, error);
      console.error(`[API] URL: ${options.url}`);
      console.error(`[API] Method: ${options.method}`);
      console.error(`[API] ─────────────────────────────────────────────────────────────\n`);
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
      await invoke('plugin:shell|open', { path });
    } catch (error) {
      console.error('[Shell] Failed to open path:', error);
    }
  }
};