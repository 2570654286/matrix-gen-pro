// MatrixGen Pro Official Default Provider Plugin
// Extracted from the built-in GeekNow API provider logic

const plugin = {
  manifest: {
    id: "official-provider",
    name: "MatrixGen Official (Default)",
    version: "1.0.0",
    description: "Built-in API provider for Sora and Veo video generation via GeekNow Cloud"
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
    const seconds = params.videoDuration === '15s' ? '15' : '10';

    return {
      url: `${baseUrl}/videos`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.apiKey || ''}`
      },
      body: {
        model: params.model,
        prompt: params.prompt,
        size: size,
        seconds: seconds
      }
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

    // For video generation, extract task ID
    if (response.id) {
      return {
        taskId: response.id,
        status: 'processing'
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
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || ''}`
      }
    };
  },

  parseVideoUrl: function(response) {
    const status = response.status?.toLowerCase();

    // Check completion status
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      if (response.video_url) {
        return {
          videoUrl: response.video_url,
          status: 'completed'
        };
      }
    }

    // Check failure status
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      return {
        videoUrl: null,
        status: 'failed'
      };
    }

    // Still processing
    return {
      videoUrl: null,
      status: status || 'processing'
    };
  }
};

plugin;