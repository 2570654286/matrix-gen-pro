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
    try {
      const formData = new FormData();
      formData.append('fileToUpload', file);
      formData.append('reqtype', 'fileupload'); // 这是 catbox 的 API 参数

      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData
      });

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
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络错误'
      };
    }
  }
};
