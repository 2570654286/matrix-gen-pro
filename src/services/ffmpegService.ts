import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

class FFmpegService {
  private ffmpeg: FFmpeg;
  private loaded = false;
  private loading = false;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  // 加载 ffmpeg 核心
  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) {
      while (this.loading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.loading = true;
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      this.loaded = true;
      console.log('[FFmpegService] ffmpeg 加载成功');
    } catch (error) {
      console.error('[FFmpegService] ffmpeg 加载失败:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  // 读取图片文件为 data URL（用于预览）
  async readImageAsDataUrl(imagePath: string): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    const base64Data: string = await invoke('read_file_base64', { options: { path: imagePath } });
    
    // 根据文件扩展名确定 MIME 类型
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' 
      : ext === 'webp' ? 'image/webp' 
      : 'image/jpeg';
    
    return `data:${mimeType};base64,${base64Data}`;
  }

  /**
   * 将图片转换为 3 秒静态视频。
   * @param imagePath 图片路径
   * @param audioPath 可选。若提供，则将该音频裁剪至 3 秒后混入视频；不足 3 秒则静音补齐；不提供则使用静音。
   */
  async imageToVideo(imagePath: string, audioPath?: string | null): Promise<Uint8Array> {
    if (!this.loaded) {
      await this.load();
    }

    const { invoke } = await import('@tauri-apps/api/core');
    const fileName = imagePath.split(/[/\\]/).pop() || 'image.jpg';
    const inputName = `input_${fileName}`;
    const outputName = 'output.mp4';

    const useCustomAudio = !!audioPath;

    console.log('[FFmpegService] 开始转换图片为视频（无损，3秒）:', imagePath, useCustomAudio ? `+ 声音: ${audioPath}` : '(静音)');

    try {
      const fileContent: string = await invoke('read_file_base64', { options: { path: imagePath } });
      const binaryData = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
      await this.ffmpeg.writeFile(inputName, binaryData);

      let audioInputName: string | null = null;
      if (useCustomAudio && audioPath) {
        const audioBytes: string = await invoke('read_file_base64', { options: { path: audioPath } });
        const ext = (audioPath.split(/[/\\]/).pop() || 'mp3').split('.').pop()?.toLowerCase() || 'mp3';
        audioInputName = `input_audio.${ext}`;
        await this.ffmpeg.writeFile(audioInputName, Uint8Array.from(atob(audioBytes), c => c.charCodeAt(0)));
      }

      // 视频：原图 + pad 补偶；-loop 1 -t 3
      const videoInput = ['-loop', '1', '-t', '3', '-i', inputName];

      // 音频：用户文件裁剪至 3 秒（atrim=0:3）、不足则静音补齐（apad=whole_dur=3）；否则静音
      const audioInput: string[] = useCustomAudio && audioInputName
        ? ['-i', audioInputName]
        : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];

      const hasFilter = useCustomAudio && audioInputName;
      // 有自定义音频时： [1:a]atrim=0:3,apad=whole_dur=3[aout] ，并 -map 0:v -map [aout]
      const filterComplex = hasFilter
        ? ['-filter_complex', '[1:a]atrim=0:3,apad=whole_dur=3[aout]', '-map', '0:v', '-map', '[aout]']
        : [];
      const mapOrShortest = hasFilter ? [] : ['-shortest'];

      const args = [
        ...videoInput,
        ...audioInput,
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2',
        '-r', '1',
        '-c:v', 'libx264',
        '-qp', '0',
        '-pix_fmt', 'yuv444p',
        '-preset', 'medium',
        '-c:a', 'aac',
        '-b:a', '128k',
        ...filterComplex,
        ...mapOrShortest,
        outputName
      ];

      console.log('[FFmpegService] 执行 ffmpeg 命令:', args.join(' '));
      await this.ffmpeg.exec(args);

      const data = await this.ffmpeg.readFile(outputName);
      await this.ffmpeg.deleteFile(inputName);
      if (audioInputName) await this.ffmpeg.deleteFile(audioInputName);
      await this.ffmpeg.deleteFile(outputName);

      const uint8Data = data as Uint8Array;
      console.log('[FFmpegService] 视频生成成功，大小:', uint8Data.length);
      return uint8Data;
    } catch (error: any) {
      console.error('[FFmpegService] 视频转换失败:', error.message || error);
      throw new Error(`视频转换失败: ${error.message || '未知错误'}`);
    }
  }

  // 将视频数据上传到 OSS
  async uploadVideoToOSS(videoData: Uint8Array): Promise<string> {
    console.log('[FFmpegService.uploadVideoToOSS] 开始上传视频到 OSS');
    const { invoke } = await import('@tauri-apps/api/core');
    
    const tempPath = `temp_video_${Date.now()}.mp4`;
    console.log('[FFmpegService.uploadVideoToOSS] 临时文件路径:', tempPath);
    
    // 分段 base64 编码避免栈溢出
    const chunkSize = 30 * 1024; // 30KB
    let base64Data = '';
    
    console.log('[FFmpegService.uploadVideoToOSS] 开始 base64 编码，数据长度:', videoData.length);
    for (let i = 0; i < videoData.length; i += chunkSize) {
      const chunk = videoData.slice(i, i + chunkSize);
      base64Data += btoa(String.fromCharCode(...chunk));
    }
    console.log('[FFmpegService.uploadVideoToOSS] base64 编码完成，长度:', base64Data.length);
    
    // 写入临时文件
    console.log('[FFmpegService.uploadVideoToOSS] 调用 write_temp_file_binary 命令');
    const filePath: string = await invoke('write_temp_file_binary', { 
      fileName: tempPath, 
      data: base64Data 
    });
    console.log('[FFmpegService.uploadVideoToOSS] 文件写入成功，路径:', filePath);
    
    // 上传到 OSS
    console.log('[FFmpegService.uploadVideoToOSS] 调用 upload_video_to_oss 命令');
    const result: { success: boolean; url?: string; error?: string } = 
      await invoke('upload_video_to_oss', { path: filePath });
    
    if (result.success && result.url) {
      return result.url;
    }
    
    throw new Error(result.error || '上传失败');
  }
}

export const ffmpegService = new FFmpegService();
export default ffmpegService;
