// MatrixGen Pro Official Default Provider Plugin
// Extracted from the built-in GeekNow API provider logic

const plugin = {
  manifest: {
    id: "geeknow-provider",
    name: "GeekNow Provider",
    version: "1.0.0",
    description: "Official GeekNow API provider for Sora and Veo video generation and character management"
  },

  createRequest: function(params) {
    // GeekNow uses a fixed base URL
    const baseUrl = 'https://api.geeknow.top/v1';

    // Handle image generation
    if (params.mediaType === 'image') {
      return {
        url: `${baseUrl}/images/generations`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.apiKey || ''}`
        },
        body: {
          model: params.model,
          prompt: params.prompt,
          n: 1,
          size: "1024x1024",
          response_format: "url"
        }
      };
    }

    // Handle video generation
    let size = '1280x720';
    if (params.aspectRatio === '1080x1920') {
      size = '720x1280';
    } else if (params.aspectRatio === '1024x1024') {
      size = '1024x1024';
    }

    // Map model names to API expected format
    let apiModel = params.model;
    if (params.model === 'sora_2_0') {
      apiModel = 'sora-2';
    } else if (params.model === 'sora_2_0_turbo') {
      apiModel = 'sora-2';
    } else if (params.model === 'veo_3_1-fast') {
      apiModel = 'veo_3_1-fast';
    }

    // Map duration to API expected values
    let seconds;
    if (params.model.includes('veo')) {
      seconds = 8; // VEO only supports 8 seconds
    } else {
      seconds = params.videoDuration === '15s' ? 15 : 10;
    }

    return {
      url: `${baseUrl.replace('/v1', '')}/v1/videos`, // Use /v1/videos as per documentation
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.apiKey || ''}`
      },
      body: {
        model: apiModel,
        prompt: params.prompt,
        size: size,
        seconds: seconds
      },
      // Force multipart/form-data format
      useMultipart: true
    };
  },

  parseTaskResponse: function(response) {
    // For image generation, the response is direct
    if (response.data && Array.isArray(response.data) && response.data[0]?.url) {
      return {
        taskId: 'image-completed',
        status: 'completed'
      };
    }

    // For video generation, extract task ID from API response
    // According to documentation, response has 'id' field directly
    if (response.id) {
      return {
        taskId: response.id,
        status: response.status || 'processing'
      };
    }

    return {
      taskId: null,
      status: 'failed'
    };
  },

  createStatusRequest: function(taskId, apiKey) {
    // Only needed for video generation polling
    return {
      url: `https://api.geeknow.top/v1/videos/${taskId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey || ''}`
      }
    };
  },

  parseVideoUrl: function(response) {
    // Check for specific error codes (e.g., task_not_exist)
    // Only check for known error codes to avoid false positives
    if (response.code === 'task_not_exist' || response.code === 'task_not_found') {
      return {
        url: null,
        status: 'failed',
        progress: 0
      };
    }

    const status = response.status?.toLowerCase();

    // Check completion status
    if (status === 'completed') {
      if (response.video_url) {
        return {
          url: response.video_url,
          status: 'completed',
          progress: 100
        };
      }
    }

    // Check failure status
    if (status === 'failed') {
      return {
        url: null,
        status: 'failed',
        progress: 0
      };
    }

    // Still processing or other status
    return {
      url: null,
      status: status || 'processing',
      progress: response.progress || 0
    };
  },

  // Character Management Methods
  createCharacter: function(apiKey, videoUrl, timestamps = "0,3", fromTask) {
    const baseUrl = 'https://api.geeknow.top';
    const apiUrl = `${baseUrl}/sora/v1/characters`;

    return {
      url: apiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: {
        url: videoUrl,
        timestamps: timestamps,
        ...(fromTask && { from_task: fromTask })
      }
    };
  },

  getCharacterList: function(apiKey) {
    const baseUrl = 'https://api.geeknow.top';
    const apiUrl = `${baseUrl}/sora/v1/characters`;

    return {
      url: apiUrl,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
  },

  deleteCharacter: function(apiKey, characterId) {
    const baseUrl = 'https://api.geeknow.top';
    const apiUrl = `${baseUrl}/sora/v1/characters/${characterId}`;

    return {
      url: apiUrl,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
  }
};

plugin;