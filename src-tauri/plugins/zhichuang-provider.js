// MatrixGen Pro - 智创聚合 API 插件（完整版）
// 依据智创 Apifox OAS（MCP read_project_oas 拉取）：servers 仅有 n.lconai.com（主站）、v.lconai.com（视频站），无 s.lconai.com。
// 图生 /v1/images/generations、视频 /v1/videos、查进度 /v1/videos/{task_id}、角色 /sora/v1/characters 均无 path 级 servers，按 OAS 使用全局 servers[0]=n.lconai.com。
// 图生、视频、查进度、角色 统一使用 HOST_N，与文生视频 baseUrl 一致；智创平台标注 B1 支持 sora_character，若仍 503 需联系智创确认 B1 渠道配置。Remix 用 HOST_V。

const HOST_N = 'https://n.lconai.com';
const HOST_V = 'https://v.lconai.com';

function trim(u) { return (u || '').replace(/\/+$/, ''); }

const plugin = {
  manifest: {
    id: "zhichuang-provider",
    name: "智创聚合 Provider",
    version: "2.0.0",
    description: "智创聚合 API 完整实现：图生、视频、角色、Flux、MJ、Suno、Chat、Dashboard 等"
  },

  // ---------- 核心：图生、视频（createRequest / parseTaskResponse / createStatusRequest / parseVideoUrl）----------

  createRequest: function(params) {
    const host = trim(HOST_N);

    if (params.mediaType === 'image') {
      return {
        url: `${host}/v1/images/generations`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.apiKey || ''}`
        },
        body: {
          model: params.model || 'doubao-seedream-4-0-250828',
          prompt: params.prompt,
          n: 1,
          type: 'normal',
          size: params.size || '1024x1024'
        }
      };
    }

    let apiModel = params.model;
    if (params.model === 'sora_2_0' || params.model === 'sora_2_0_turbo') apiModel = 'sora-2';
    else if (params.model && params.model.includes('veo')) apiModel = 'veo_3_1-fast';

    let size = '1280x720';
    if (params.aspectRatio === '1080x1920') size = '720x1280';
    else if (params.aspectRatio === '1024x1024') size = '1024x1024';

    const seconds = (params.videoDuration === '15s') ? 15 : 10;

    return {
      url: `${host}/v1/videos`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${params.apiKey || ''}` },
      body: { model: apiModel, prompt: params.prompt, size, seconds },
      useMultipart: true
    };
  },

  parseTaskResponse: function(response) {
    if (response.data && Array.isArray(response.data) && response.data[0]?.url) {
      return { taskId: 'image-completed', status: 'completed' };
    }
    const taskId = response.id || response.data?.id || response.task_id || null;
    const status = (response.status || response.data?.status || 'processing').toLowerCase();
    return { taskId, status: taskId ? status : 'failed' };
  },

  createStatusRequest: function(taskId, apiKey) {
    const host = trim(HOST_N);
    return {
      url: `${host}/v1/videos/${taskId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey || ''}`,
        'Content-Type': 'application/json'
      }
    };
  },

  parseVideoUrl: function(response) {
    const status = (response.status || response.data?.status || '').toLowerCase();
    if (status === 'completed') {
      const url = response.video_url || response.data?.video_url || response.data?.url
        || (response.data?.results && response.data.results[0]?.url);
      if (url) return { url, status: 'completed', progress: 100 };
    }
    if (status === 'failed' || status === 'cancelled') {
      return { url: null, status: 'failed', progress: response.progress ?? response.data?.progress ?? 0 };
    }
    return {
      url: null,
      status: status || 'processing',
      progress: response.progress ?? response.data?.progress ?? 0
    };
  },

  // ---------- 角色：依 lconai.apifox.cn 创建角色文档，requestBody 仅 timestamps、from_task，servers 为 n.lconai.com。无 url 字段。----------

  createCharacter: function(apiKey, videoUrl, timestamps, fromTask) {
    const host = trim(HOST_N);
    const ts = timestamps || '0,3';
    const body = { timestamps: ts };
    if (fromTask) body.from_task = fromTask;

    return {
      url: `${host}/sora/v1/characters`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body
    };
  },

  getCharacterList: function(apiKey) {
    const host = trim(HOST_N);
    return {
      url: `${host}/sora/v1/characters`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
  },

  deleteCharacter: function(apiKey, characterId) {
    const host = trim(HOST_N);
    return {
      url: `${host}/sora/v1/characters/${characterId}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
  },

  // ---------- 图生：图片编辑（multipart）----------
  imagesEdits: function(apiKey, opts) {
    const host = trim(HOST_N);
    return {
      url: `${host}/v1/images/edits`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: {
        model: opts.model || 'doubao-seedream-4-0-250828',
        image: opts.image,
        prompt: opts.prompt,
        n: opts.n != null ? opts.n : 1,
        type: opts.type || 'normal',
        size: opts.size || '1024x1024'
      },
      useMultipart: true
    };
  },

  // ---------- 视频：Remix 编辑----------
  videosRemix: function(apiKey, videoId, prompt, opts) {
    const host = trim(HOST_V);
    return {
      url: `${host}/v1/videos/${videoId}/remix`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: {
        prompt: prompt || '',
        seconds: opts?.seconds,
        size: opts?.size
      }
    };
  },

  // ---------- Flux：生成图像、查结果----------
  fluxImage: function(apiKey, prompt, width, height) {
    const host = trim(HOST_N);
    return {
      url: `${host}/flux/v1/image`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: {
        prompt: prompt || '',
        width: width != null ? width : 512,
        height: height != null ? height : 512
      }
    };
  },

  fluxGetResult: function(apiKey, requestId) {
    const host = trim(HOST_N);
    return {
      url: `${host}/flux/v1/get_result?request_id=${encodeURIComponent(requestId || '')}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    };
  },

  fluxChat: function(apiKey, body) {
    const host = trim(HOST_N);
    return {
      url: `${host}/flux/v1/chat`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: body || {}
    };
  },

  // ---------- MJ：Imagine 提交、任务查询----------
  mjImagine: function(apiKey, opts) {
    const host = trim(HOST_N);
    return {
      url: `${host}/mj/submit/imagine`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: {
        botType: opts?.botType || 'MID_JOURNEY',
        prompt: opts?.prompt || '',
        base64Array: opts?.base64Array || [],
        notifyHook: opts?.notifyHook || '',
        state: opts?.state || ''
      }
    };
  },

  mjTaskFetch: function(apiKey, taskId) {
    const host = trim(HOST_N);
    return {
      url: `${host}/mj/task/${encodeURIComponent(taskId || '')}/fetch`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    };
  },

  // ---------- Suno：生成歌曲、批量查询----------
  sunoSubmitMusic: function(apiKey, opts) {
    const host = trim(HOST_N);
    const b = {
      prompt: opts?.prompt ?? '',
      mv: opts?.mv || 'chirp-v3-0',
      title: opts?.title ?? '',
      tags: opts?.tags ?? '',
      make_instrumental: opts?.make_instrumental ?? false,
      task_id: opts?.task_id ?? '',
      continue_at: opts?.continue_at ?? 0,
      continue_clip_id: opts?.continue_clip_id ?? '',
      gpt_description_prompt: opts?.gpt_description_prompt ?? '',
      notify_hook: opts?.notify_hook ?? ''
    };
    return {
      url: `${host}/suno/submit/music`,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: b
    };
  },

  sunoFetch: function(apiKey, ids) {
    const host = trim(HOST_N);
    return {
      url: `${host}/suno/fetch`,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: Array.isArray(ids) ? { ids } : { ids: [ids] }
    };
  },

  // ---------- Chat：Completions（主站 n）----------
  chatCompletions: function(apiKey, opts) {
    const host = trim(HOST_N);
    return {
      url: `${host}/v1/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: opts?.body || { model: 'sora-2', messages: [], stream: false }
    };
  },

  // ---------- Dashboard：订阅、用量----------
  getBillingSubscription: function(apiKey) {
    const host = trim(HOST_N);
    return {
      url: `${host}/v1/dashboard/billing/subscription`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
  },

  getBillingUsage: function(apiKey) {
    const host = trim(HOST_N);
    return {
      url: `${host}/v1/dashboard/billing/usage`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
  }
};

plugin;
