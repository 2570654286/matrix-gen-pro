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
    const base64Data: string = await invoke('read_file_base64', { path: imagePath });
    
    // 根据文件扩展名确定 MIME 类型
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' 
      : ext === 'webp' ? 'image/webp' 
      : 'image/jpeg';
    
    return `data:${mimeType};base64,${base64Data}`;
  }

  // 将图片转换为 5 秒静态视频（带静音音频）
  async imageToVideo(imagePath: string): Promise<Uint8Array> {
    if (!this.loaded) {
      await this.load();
    }

    const fileName = imagePath.split(/[/\\]/).pop() || 'image.jpg';
    const inputName = `input_${fileName}`;
    const outputName = 'output.mp4';

    console.log('[FFmpegService] 开始转换图片为视频:', imagePath);

    try {
      // 通过 Tauri 读取文件
      const { invoke } = await import('@tauri-apps/api/core');
      const fileContent: string = await invoke('read_file_base64', { path: imagePath });
      
      // 将 base64 转换为 Uint8Array
      const binaryData = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
      
      await this.ffmpeg.writeFile(inputName, binaryData);

      // ffmpeg args: 图片转视频 + 静音音频
      const args = [
        '-loop', '1',
        '-t', '5',                              // 视频时长 5 秒
        '-i', inputName,                        // 输入图片
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',  // 虚拟静音音频
        '-vf', 'scale=-2:720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2',
        '-r', '1',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',                          // AAC 音频编码
        '-b:a', '128k',
        '-shortest',                            // 音频视频对齐
        outputName
      ];

      console.log('[FFmpegService] 执行 ffmpeg 命令:', args.join(' '));
      
      await this.ffmpeg.exec(args);

      const data = await this.ffmpeg.readFile(outputName);
      
      await this.ffmpeg.deleteFile(inputName);
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
