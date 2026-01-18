import { invoke, convertFileSrc } from '@tauri-apps/api/core';

/**
 * 文件服务 - 处理本地文件保存和URL转换
 */
export class FileService {
  /**
   * 保存base64数据为文件并返回可用于UI播放的URL
   * @param base64Data base64编码的文件数据
   * @param fileName 文件名（包含扩展名）
   * @param mediaType 媒体类型 ('video' | 'image')
   * @returns Promise<string> 可用于UI播放的URL
   */
  static async saveOutputFile(base64Data: string, fileName: string, mediaType: 'video' | 'image'): Promise<string> {
    try {
      console.log(`[FileService] 开始保存 ${mediaType} 文件: ${fileName}`);

      // 调用Rust后端保存文件
      const absolutePath = await invoke<string>('write_output_file', {
        options: {
          file_name: fileName,
          data: base64Data,
          media_type: mediaType
        }
      });

      console.log(`[FileService] 文件保存成功，绝对路径: ${absolutePath}`);

      // 转换绝对路径为可用于UI的Asset URL
      const assetUrl = convertFileSrc(absolutePath);
      console.log(`[FileService] Asset URL: ${assetUrl}`);

      return assetUrl;
    } catch (error) {
      console.error(`[FileService] 保存文件失败:`, error);
      throw error;
    }
  }

  /**
   * 保存视频文件并返回URL
   * @param base64Data base64编码的视频数据
   * @param fileName 文件名（包含.mp4扩展名）
   * @returns Promise<string> 视频URL
   */
  static async saveVideoFile(base64Data: string, fileName: string): Promise<string> {
    return this.saveOutputFile(base64Data, fileName, 'video');
  }

  /**
   * 保存图像文件并返回URL
   * @param base64Data base64编码的图像数据
   * @param fileName 文件名（包含.jpg/.png等扩展名）
   * @returns Promise<string> 图像URL
   */
  static async saveImageFile(base64Data: string, fileName: string): Promise<string> {
    return this.saveOutputFile(base64Data, fileName, 'image');
  }

  /**
   * 从绝对路径转换为Asset URL（如果路径已经是Asset URL则直接返回）
   * @param path 绝对路径或已转换的Asset URL
   * @returns string Asset URL
   */
  static convertToAssetUrl(path: string): string {
    // 如果已经是asset://协议的URL，直接返回
    if (path.startsWith('asset://')) {
      return path;
    }

    // 如果是http/https URL，直接返回（远程URL）
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    // 如果是data: URL，直接返回
    if (path.startsWith('data:')) {
      return path;
    }

    try {
      // 转换为Asset URL
      return convertFileSrc(path);
    } catch (error) {
      console.error(`[FileService] 路径转换失败: ${path}`, error);
      return path; // 返回原始路径作为fallback
    }
  }
}