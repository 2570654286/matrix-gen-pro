// Catbox 文件上传服务
// 文档: https://catbox.moe/tools.php

export interface CatboxUploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export const CatboxService = {
  // 上传文件到 Catbox
  upload: async (file: File): Promise<CatboxUploadResponse> => {
    const formData = new FormData();
    formData.append('fileToUpload', file);
    formData.append('reqtype', 'fileupload'); // 这是 catbox 的 API 参数

    // 创建带有超时的 AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分钟超时

    try {
      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();

      // Catbox 成功返回的是 URL，失败返回错误信息
      if (response.ok && responseText.startsWith('https://')) {
        return {
          success: true,
          url: responseText
        };
      } else {
        return {
          success: false,
          error: responseText || '上传失败'
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络错误'
      };
    }
  }
};
