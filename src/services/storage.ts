import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('[Storage] Supabase 配置未找到，请检查环境变量 VITE_SUPABASE_URL 和 VITE_SUPABASE_KEY');
}

// 上传临时视频文件到 Supabase Storage
export const uploadTempVideo = async (file: File): Promise<string> => {
  if (!supabase) {
    throw new Error('Supabase 未配置，请检查环境变量 VITE_SUPABASE_URL 和 VITE_SUPABASE_KEY');
  }

  try {
    // 生成唯一文件名：时间戳_随机串
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `${timestamp}_${randomStr}_${file.name}`;

    console.log('[Storage] 开始上传视频到 Supabase:', fileName);

    // 上传到 JU-supabase bucket
    const { data, error } = await supabase.storage
      .from('JU-supabase')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('[Storage] 上传失败:', error);
      throw new Error(`上传失败: ${error.message}`);
    }

    // 获取公开访问 URL
    const { data: urlData } = supabase.storage
      .from('JU-supabase')
      .getPublicUrl(fileName);

    if (!urlData.publicUrl) {
      throw new Error('获取公开 URL 失败');
    }

    console.log('[Storage] 上传成功，公开 URL:', urlData.publicUrl);
    return urlData.publicUrl;

  } catch (error) {
    console.error('[Storage] 上传过程中发生错误:', error);
    throw error;
  }
};