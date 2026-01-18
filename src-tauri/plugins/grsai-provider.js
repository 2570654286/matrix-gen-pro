// MatrixGen Pro Grsai Provider Plugin
// Converted from built-in GrsaiPlugin.ts

const plugin = {
  manifest: {
    id: "grsai-provider",
    name: "Grsai Provider",
    version: "1.0.0",
    description: "支持 Sora-2, Veo3 和 Nano-Banana 模型的聚合接口"
  },

  createRequest: function(params) {
    const baseUrl = 'https://grsai.dakka.com.cn';

    // 1. 确定 API 端点
    let endpoint = '';
    if (params.mediaType === 'video') {
      if (params.model.includes('sora')) {
        endpoint = '/v1/video/sora-video';
      } else if (params.model.includes('veo')) {
        endpoint = '/v1/video/veo';
      } else {
        throw new Error(`未知的视频模型: ${params.model}`);
      }
    } else {
      endpoint = '/v1/draw/nano-banana';
    }

    // Base URL 清洗
    let cleanHost = baseUrl.replace(/\/+$/, '');
    if (cleanHost.endsWith('/v1')) {
      cleanHost = cleanHost.slice(0, -3);
    }
    const apiUrl = `${cleanHost}${endpoint}`;

    // 2. 构建请求体
    const requestBody = {
      model: params.model,
      prompt: params.prompt,
      webHook: '-1', // 强制返回 ID 用于轮询
      shutProgress: false,
    };

    // 辅助函数：将宽高比字符串转换为 API 需要的比例格式
    const mapAspectRatio = (ratio) => {
      switch (ratio) {
        case '16:9':
        case '1920x1080':
          return '16:9';
        case '9:16':
        case '1080x1920':
          return '9:16';
        case '1:1':
        case '1024x1024':
          return '1:1';
        case '4:3':
          return '4:3';
        case '3:4':
          return '3:4';
        default:
          return '16:9'; // 默认值
      }
    };

    // 辅助函数：将 '10s' 字符串转换为数字
    const parseDuration = (durationStr) => {
      const match = durationStr.match(/(\d+)/);
      return match ? parseInt(match[0], 10) : 10;
    };

    const apiRatio = mapAspectRatio(params.aspectRatio);

    if (params.mediaType === 'video') {
      requestBody.aspectRatio = apiRatio;
      requestBody.duration = parseDuration(params.videoDuration);
    } else {
      requestBody.aspectRatio = apiRatio === '16:9' ? '16:9' : apiRatio;
    }

    return {
      url: apiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.apiKey || ''}`
      },
      body: requestBody
    };
  },

  parseTaskResponse: function(response) {
    if (response.code !== 0) {
      throw new Error(`任务提交失败: ${response.msg || '未知错误'}`);
    }

    const taskId = response.data?.id;
    if (!taskId) {
      return {
        taskId: null,
        status: 'failed'
      };
    }

    return {
      taskId: taskId,
      status: 'processing'
    };
  },

  createStatusRequest: function(taskId, apiKey) {
    const baseUrl = 'https://grsai.dakka.com.cn';
    let cleanHost = baseUrl.replace(/\/+$/, '');
    if (cleanHost.endsWith('/v1')) {
      cleanHost = cleanHost.slice(0, -3);
    }
    const resultUrl = `${cleanHost}/v1/draw/result`;

    return {
      url: resultUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || ''}`
      },
      body: { id: taskId }
    };
  },

  parseVideoUrl: function(response) {
    // -22 代表任务不存在或正在初始化，继续等待
    if (response.code === -22) {
      return {
        url: null,
        status: 'processing'
      };
    }

    if (response.code !== 0) {
      return {
        url: null,
        status: 'failed'
      };
    }

    const taskData = response.data;
    const status = taskData?.status;

    if (status === 'succeeded') {
      // 成功！提取 URL
      let finalUrl = '';

      if (taskData.url && typeof taskData.url === 'string') {
        // Veo 风格
        finalUrl = taskData.url;
      } else if (Array.isArray(taskData.results) && taskData.results.length > 0) {
        // Sora / Nano 风格
        finalUrl = taskData.results[0].url;
      }

      if (finalUrl) {
        return {
          url: finalUrl,
          status: 'completed'
        };
      } else {
        return {
          url: null,
          status: 'failed'
        };
      }

    } else if (status === 'failed') {
      return {
        url: null,
        status: 'failed'
      };
    }

    // Still processing
    return {
      url: null,
      status: status || 'processing'
    };
  },

  // Character Management Methods (Grsai doesn't support character management yet)
  createCharacter: function(apiKey, videoUrl, timestamps = "0,3", fromTask) {
    throw new Error('Character management not supported by Grsai provider');
  },

  getCharacterList: function(apiKey) {
    throw new Error('Character management not supported by Grsai provider');
  },

  deleteCharacter: function(apiKey, characterId) {
    throw new Error('Character management not supported by Grsai provider');
  }
};

plugin;