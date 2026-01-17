import { uploadTempVideo } from './storage';

// 从环境变量读取存储提供商配置
const PROVIDER = import.meta.env.VITE_STORAGE_PROVIDER || 'supabase';

export interface StorageServiceInterface {
  uploadFile(file: File, folder: 'characters' | 'videos' | 'release-files'): Promise<string>;
}

class SupabaseStorageService implements StorageServiceInterface {
  async uploadFile(file: File, folder: 'characters' | 'videos' | 'release-files'): Promise<string> {
    console.log(`[StorageService] 使用 Supabase 上传到 ${folder} 文件夹`);

    if (folder === 'characters' || folder === 'videos') {
      // 对于角色和视频，使用现有的 uploadTempVideo 函数
      // 注意：现有的实现是上传到 'JU-supabase' bucket
      return await uploadTempVideo(file);
    } else {
      throw new Error(`Supabase 不支持 ${folder} 文件夹的上传`);
    }
  }
}

class AliyunOSSStorageService implements StorageServiceInterface {
  async uploadFile(file: File, folder: 'characters' | 'videos' | 'release-files'): Promise<string> {
    console.log(`[StorageService] 使用 Aliyun OSS 上传到 ${folder} 文件夹`);

    const region = import.meta.env.VITE_ALIYUN_OSS_REGION || 'oss-cn-hangzhou';
    const bucket = import.meta.env.VITE_ALIYUN_OSS_BUCKET;
    const accessKeyId = import.meta.env.VITE_ALIYUN_OSS_ACCESS_KEY_ID;
    const accessKeySecret = import.meta.env.VITE_ALIYUN_OSS_ACCESS_KEY_SECRET;

    if (!bucket || !accessKeyId || !accessKeySecret) {
      throw new Error('Aliyun OSS 配置缺失，请检查环境变量');
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileExtension = file.name.split('.').pop() || 'bin';
    const fileName = `${folder}/${timestamp}_${randomStr}.${fileExtension}`;

    try {
      // 使用动态导入以避免在不需要时加载阿里云 OSS SDK
      const OSS = (await import('ali-oss' as any)).default;

      const client = new OSS({
        region,
        accessKeyId,
        accessKeySecret,
        bucket
      });

      console.log(`[AliyunOSS] 上传文件: ${fileName}`);

      const result = await client.put(fileName, file);

      if (!result.res?.requestUrls?.[0]) {
        throw new Error('获取上传 URL 失败');
      }

      const publicUrl = result.res.requestUrls[0];
      console.log(`[AliyunOSS] 上传成功: ${publicUrl}`);

      return publicUrl;
    } catch (error) {
      console.error('[AliyunOSS] 上传失败:', error);
      throw new Error(`Aliyun OSS 上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
}

// 工厂函数创建存储服务实例
function createStorageService(): StorageServiceInterface {
  switch (PROVIDER) {
    case 'aliyun':
      return new AliyunOSSStorageService();
    case 'supabase':
    default:
      return new SupabaseStorageService();
  }
}

// 导出单例实例
export const StorageService = createStorageService();