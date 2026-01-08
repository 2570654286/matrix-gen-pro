import { AppSettings } from '../types';
import { PluginRegistry } from './pluginSystem';
import { http } from './apiAdapter';

export interface LlmPayload {
  prompt: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 调用大语言模型 API
 * @param prompt 输入提示词
 * @param settings 应用设置
 * @returns LLM 生成的优化后提示词
 */
export async function callLlm(
  prompt: string,
  settings: AppSettings
): Promise<string> {
  const activeProviderId = settings.llmProviderId || settings.providerId;
  const activeApiKey = settings.llmApiKey || settings.apiKey;
  const activeModel = settings.llmModel;
  const activeBaseUrl = settings.baseUrl;

  return callOpenAiCompatibleLlm({
    prompt,
    apiKey: activeApiKey,
    baseUrl: activeBaseUrl,
    model: activeModel
  });
}

/**
 * OpenAI 兼容的 LLM 调用
 */
async function callOpenAiCompatibleLlm(payload: LlmPayload): Promise<string> {
  const { prompt, apiKey, baseUrl, model } = payload;

  if (!apiKey) {
    throw new Error('API 密钥未配置');
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  const response = await http.post<{
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    error?: { message?: string };
  }>(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [
        {
          role: 'user',
          content: `请优化以下提示词，使其更适合 AI 图像/视频生成。只返回优化后的提示词，不要其他解释：\n\n${prompt}`
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    },
    headers,
    undefined
  );

  if (response.error) {
    throw new Error(response.error.message || 'LLM API 调用失败');
  }

  const content = response.choices?.[0]?.message?.content || response.choices?.[0]?.text || '';
  
  // 清理返回的内容，移除可能的引号和额外空格
  return content.trim().replace(/^["']|["']$/g, '');
}

/**
 * 批量处理提示词优化
 */
export async function optimizePrompts(
  prompts: string[],
  settings: AppSettings,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  const results: string[] = [];
  
  for (let i = 0; i < prompts.length; i++) {
    try {
      const optimized = await callLlm(prompts[i], settings);
      results.push(optimized);
    } catch (error) {
      console.error(`优化提示词失败: ${prompts[i]}`, error);
      // 如果失败，返回原始提示词
      results.push(prompts[i]);
    }
    
    if (onProgress) {
      onProgress(i + 1, prompts.length);
    }
  }
  
  return results;
}
