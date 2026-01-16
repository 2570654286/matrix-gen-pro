import React, { useState, useEffect } from 'react';
import { XIcon, VideoIcon, UploadIcon, CheckIcon, ImageIcon, PlusIcon } from './Icons';
import { SoraCharacterService } from '../services/soraCharacter';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import ffmpegService from '../services/ffmpegService';
import { uploadTempVideo } from '../services/storage';
import { MediaType } from '../types';

interface Character {
  id: string;
  username: string;
  permalink: string;
  profile_picture_url: string;
  profile_desc?: string;
  status?: string;
  created_at?: string;
  local_name?: string;
  video_thumbnail_url?: string;
  original_image_url?: string;
}

// 角色创建项类型
interface RoleCreationItem {
  id: string;
  prompt: string;
  imageUrl: string | null;
  imagePath: string | null;
  status: 'idle' | 'generating' | 'uploading' | 'creating' | 'completed' | 'error';
  progressMessage: string;
  roleName?: string;
}

interface Sora2RolePanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  providerId: string;
  mediaType: MediaType;
}

export const Sora2RolePanel: React.FC<Sora2RolePanelProps> = ({
  isOpen,
  onClose,
  apiKey,
  providerId,
  mediaType
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  // 角色创建项列表
  const [roleCreationItems, setRoleCreationItems] = useState<RoleCreationItem[]>([]);
  // 新增角色创建卡片的模态框
  const [showAddRoleCard, setShowAddRoleCard] = useState(false);

  // 视频转换排队系统
  const [isVideoConverting, setIsVideoConverting] = useState(false);
  const [videoConvertQueue, setVideoConvertQueue] = useState<RoleCreationItem[]>([]);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // 保存图片到应用数据目录并返回相对路径
  const saveImageToAppData = async (sourcePath: string, characterId: string): Promise<string> => {
    try {
      const result = await invoke<{ success: boolean; path?: string; error?: string }>('save_character_image', {
        options: {
          source_path: sourcePath,
          character_id: characterId
        }
      });

      if (result.success && result.path) {
        console.log('[Sora2RolePanel] 图片保存成功:', result.path);
        return result.path;
      }
      throw new Error(result.error || '保存图片失败');
    } catch (error) {
      console.error('[Sora2RolePanel] 保存图片失败:', error);
      throw error;
    }
  };

  // 根据相对路径获取图片 URL（支持 data URL 和相对路径）
  const getImageUrl = (imageUrl: string): string => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
      return imageUrl;
    }
    try {
      const normalizedPath = imageUrl.replace(/\\/g, '/');
      console.log('[Sora2RolePanel] 处理图片路径:', normalizedPath);
      return convertFileSrc(normalizedPath);
    } catch (error) {
      console.error('[Sora2RolePanel] 处理图片路径失败:', error, imageUrl);
      return '';
    }
  };

  // 从本地加载角色列表
  const loadCharacters = () => {
    const localCharacters = JSON.parse(localStorage.getItem('local_created_characters') || '[]');
    const savedNames = JSON.parse(localStorage.getItem('sora_character_names') || '{}');

    const charactersWithNames = localCharacters.map((char: any) => ({
      ...char,
      local_name: savedNames[char.id] || char.local_name || char.username
    }));

    setCharacters(charactersWithNames);
    console.log('[Sora2RolePanel] 从本地加载角色:', charactersWithNames.length);
  };

  useEffect(() => {
    if (isOpen) {
      loadCharacters();
      // 当进入创建页面时，如果没有角色卡片，自动创建一个空的
      if (activeTab === 'create' && roleCreationItems.length === 0) {
        addNewRoleItem();
      }
    }
  }, [isOpen, activeTab]);

  // 监听队列变化，自动开始下一个转换
  useEffect(() => {
    if (!isVideoConverting && videoConvertQueue.length > 0) {
      const nextItem = videoConvertQueue[0];
      const remainingQueue = videoConvertQueue.slice(1);
      setVideoConvertQueue(remainingQueue);
      startVideoConversion(nextItem);
    }
  }, [isVideoConverting, videoConvertQueue]);

  if (!isOpen) return null;

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 8000);
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showMessage('success', `已复制: ${text}`);
    } catch (error) {
      showMessage('error', '复制失败');
    }
  };

  // 添加新的角色创建项
  const addNewRoleItem = () => {
    const newItem: RoleCreationItem = {
      id: Date.now().toString(),
      prompt: '',
      imageUrl: null,
      imagePath: null,
      status: 'idle',
      progressMessage: '',
      roleName: ''
    };
    setRoleCreationItems(prev => [...prev, newItem]);
  };

  // 更新角色创建项
  const updateRoleItem = (id: string, updates: Partial<RoleCreationItem>) => {
    setRoleCreationItems(prev =>
      prev.map(item => item.id === id ? { ...item, ...updates } : item)
    );
  };

  // 删除角色创建项
  const removeRoleItem = (id: string) => {
    setRoleCreationItems(prev => {
      const filtered = prev.filter(item => item.id !== id);
      // 如果删除后没有卡片了，自动添加一张空卡片
      if (filtered.length === 0) {
        setTimeout(() => addNewRoleItem(), 0);
      }
      return filtered;
    });
  };

  // 处理图片上传
  const handleImageUpload = async (itemId: string) => {
    try {
      const selected = await open({
        title: '选择角色图片',
        multiple: false,
        filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      });

      if (selected && typeof selected === 'string') {
        const imageDataUrl = await ffmpegService.readImageAsDataUrl(selected);
        updateRoleItem(itemId, {
          imageUrl: imageDataUrl,
          imagePath: selected
        });
      }
    } catch (error) {
      console.error('选择角色图片失败:', error);
      showMessage('error', '无法打开文件选择器');
    }
  };

  // 处理生图（TODO：集成生图API）
  const handleGenerateImage = async (itemId: string, prompt: string) => {
    if (!prompt.trim()) {
      showMessage('error', '请输入角色提示词');
      return;
    }

    updateRoleItem(itemId, { status: 'generating', progressMessage: '生图中...' });

    try {
      // TODO: 调用生图API
      showMessage('info', '生图功能开发中...');

      // 暂时模拟生图过程
      setTimeout(() => {
        updateRoleItem(itemId, { status: 'idle', progressMessage: '' });
        showMessage('success', '生图完成！');
      }, 2000);
    } catch (error) {
      console.error('生图失败:', error);
      updateRoleItem(itemId, { status: 'error', progressMessage: '生图失败' });
      showMessage('error', '生图失败');
    }
  };

  // 处理视频转换和后续流程
  const processVideoConversionAndUpload = async (item: RoleCreationItem) => {
    try {
      // 步骤 1: 图片转视频
      updateRoleItem(item.id, { progressMessage: '正在转换视频...' });
      const videoData = await ffmpegService.imageToVideo(item.imagePath!);

      // 步骤 2: 上传到 Supabase Storage
      updateRoleItem(item.id, { progressMessage: '正在上传视频...' });

      // 步骤 3: 创建角色
      updateRoleItem(item.id, { progressMessage: '正在创建角色...' });

      // 将 Uint8Array 转换为 File 对象并上传
      const videoBlob = new Blob([videoData as any], { type: 'video/mp4' });
      const videoFile = new File([videoBlob], `temp_video_${Date.now()}.mp4`, { type: 'video/mp4' });

      const videoUrl = await uploadTempVideo(videoFile);

      // 创建角色
      const response = await SoraCharacterService.createCharacter(
        apiKey,
        videoUrl,
        '0,3',
        undefined,
        providerId
      );

      let characterData = response;
      if (response.code === 0 && response.data) {
        characterData = response.data;
      } else if (response.code === 0 && response.id) {
        characterData = response;
      } else {
        let errorMsg = '创建失败';
        if (response.message) {
          try {
            const nestedMsg = JSON.parse(response.message);
            errorMsg += nestedMsg.message ? `: ${nestedMsg.message}` : `: ${response.message}`;
          } catch {
            errorMsg += `: ${response.message}`;
          }
        } else if (response.msg) {
          errorMsg += `: ${response.msg}`;
        }
        throw new Error(errorMsg);
      }

      if (characterData && characterData.id && characterData.username) {
        const characterId = characterData.id;
        const apiUsername = characterData.username;
        const displayName = item.roleName?.trim() || `@${apiUsername}`;

        saveLocalCharacterName(characterId, displayName);

        // 保存创建时的预览图片到本地文件
        let imageRelativePath = '';
        try {
          const dataUrl = item.imageUrl;
          if (dataUrl && dataUrl.startsWith('data:')) {
            // 提取 MIME 类型和 base64 数据
            const [mimeInfo, base64Data] = dataUrl.split(',');
            const mimeType = mimeInfo.split(':')[1].split(';')[0];

            // 直接通过 Tauri 保存 base64 数据为文件
            const result = await invoke<{ success: boolean; path?: string; error?: string }>('save_character_image_from_base64', {
              base64_data: base64Data,
              character_id: characterId,
              mime_type: mimeType
            });

            if (result.success && result.path) {
              imageRelativePath = result.path;
            } else {
              console.warn('[Sora2RolePanel] 保存预览图片失败:', result.error);
              imageRelativePath = characterData.profile_picture_url || '';
            }
          } else {
            imageRelativePath = characterData.profile_picture_url || '';
          }
        } catch (err) {
          console.error('[Sora2RolePanel] 保存预览图片异常:', err);
          imageRelativePath = characterData.profile_picture_url || '';
        }

        const finalCharacter: Character = {
          id: characterId,
          username: apiUsername,
          permalink: characterData.permalink || '',
          profile_picture_url: characterData.profile_picture_url || '',
          profile_desc: characterData.profile_desc,
          status: 'active',
          local_name: displayName,
          video_thumbnail_url: videoUrl,
          original_image_url: imageRelativePath
        };

        // 更新总的角色列表
        setCharacters(prev => [...prev, finalCharacter]);
        // 保存到本地存储
        const localCharacters = JSON.parse(localStorage.getItem('local_created_characters') || '[]');
        localCharacters.push(finalCharacter);
        localStorage.setItem('local_created_characters', JSON.stringify(localCharacters));

        console.log('[Sora2RolePanel] 角色创建完成:', {
          id: characterId,
          original_image_url: imageRelativePath,
          profile_picture_url: characterData.profile_picture_url
        });

        updateRoleItem(item.id, { status: 'completed', progressMessage: '创建成功' });
        showMessage('success', '角色创建成功！');
      } else {
        throw new Error('API响应中缺少角色信息');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error(`[Sora2RolePanel] 创建失败:`, errorMessage);
      updateRoleItem(item.id, { status: 'error', progressMessage: errorMessage });
      showMessage('error', `创建失败: ${errorMessage}`);
    } finally {
      // 处理完一个后，重置转换状态
      setIsVideoConverting(false);
    }
  };



  // 开始视频转换
  const startVideoConversion = (item: RoleCreationItem) => {
    setIsVideoConverting(true);
    processVideoConversionAndUpload(item);
  };

  // 处理角色创建
  const handleCreateRole = async (item: RoleCreationItem) => {
    if (!item.imagePath) {
      showMessage('error', '请先上传角色图片');
      return;
    }

    if (!apiKey) {
      showMessage('error', '请先在设置中配置 API 密钥');
      return;
    }

    // 检查 Supabase 是否配置（生产环境中应该已预配置）
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_KEY) {
      showMessage('error', '存储服务配置错误，请联系技术支持或重新安装应用');
      return;
    }

    updateRoleItem(item.id, { status: 'uploading', progressMessage: '等待转换视频...' });

    // 检查是否正在转换视频
    if (isVideoConverting) {
      // 加入队列
      setVideoConvertQueue(prev => [...prev, item]);
      updateRoleItem(item.id, { progressMessage: '排队等待转换视频...' });
    } else {
      // 直接开始转换
      startVideoConversion(item);
    }
  };

  const saveLocalCharacterName = (characterId: string, name: string) => {
    const savedNames = JSON.parse(localStorage.getItem('sora_character_names') || '{}');
    savedNames[characterId] = name;
    localStorage.setItem('sora_character_names', JSON.stringify(savedNames));
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!apiKey) {
      showMessage('error', '请先在设置中配置 API 密钥');
      return;
    }

    if (!confirm('确定要删除这个角色吗？')) return;

    try {
      const response = await SoraCharacterService.deleteCharacter(apiKey, id, providerId);
      console.log('[Sora2RolePanel] 删除响应:', JSON.stringify(response, null, 2));

      const isApiSuccess = response?.code === 0 || response?.success === true || response?.id;

      if (isApiSuccess) {
        showMessage('success', '删除成功');
      } else {
        showMessage('info', '角色已从本地删除');
      }

      setCharacters(prev => prev.filter(c => c.id !== id));

      const savedNames = JSON.parse(localStorage.getItem('sora_character_names') || '{}');
      delete savedNames[id];
      localStorage.setItem('sora_character_names', JSON.stringify(savedNames));

      const localCharacters = JSON.parse(localStorage.getItem('local_created_characters') || '[]');
      const filteredLocal = localCharacters.filter((c: Character) => c.id !== id);
      localStorage.setItem('local_created_characters', JSON.stringify(filteredLocal));

      setSelectedCharacter(null);
    } catch (error) {
      console.error('[Sora2RolePanel] 删除失败:', error);
      setCharacters(prev => prev.filter(c => c.id !== id));

      const savedNames = JSON.parse(localStorage.getItem('sora_character_names') || '{}');
      delete savedNames[id];
      localStorage.setItem('sora_character_names', JSON.stringify(savedNames));

      const localCharacters = JSON.parse(localStorage.getItem('local_created_characters') || '[]');
      const filteredLocal = localCharacters.filter((c: Character) => c.id !== id);
      localStorage.setItem('local_created_characters', JSON.stringify(filteredLocal));

      setSelectedCharacter(null);
      showMessage('info', '角色已从本地删除（API 删除失败）');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-[95%] max-w-6xl h-[90%] bg-[#121212] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <VideoIcon className="w-4 h-4 text-white" />
            </div>
            角色创建
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <XIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex border-b border-white/5 bg-[#0f0f0f] px-6 shrink-0">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === 'create'
                ? 'text-primary border-primary'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            创建角色
          </button>
          <button
            onClick={() => { setActiveTab('list'); loadCharacters(); }}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'list'
                ? 'text-primary border-primary'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            角色列表
            {characters.length > 0 && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                {characters.length}
              </span>
            )}
          </button>
        </div>

        {/* Supabase 配置错误提示（仅在开发环境或配置错误时显示） */}
        {(!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_KEY) && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="text-xs">⚠</span>
              </div>
              <span className="font-medium">存储服务配置错误</span>
            </div>
            <p className="mt-1 text-xs opacity-90">
              无法连接到云存储服务。如需技术支持，请联系开发者或尝试重新安装应用。
            </p>
          </div>
        )}

        {message && (
          <div className={`mx-6 mt-4 px-4 py-2 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : message.type === 'error'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
          }`}>
            {message.text.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'create' && (
            <div className="min-h-full p-6">
              {/* 角色创建项列表 */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">角色创建</h3>
                  <button
                    onClick={addNewRoleItem}
                    className="px-4 py-2 bg-primary hover:bg-primaryHover text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    <PlusIcon className="w-4 h-4" />
                    添加角色
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {roleCreationItems.map((item) => (
                    <div key={item.id} className="bg-gradient-to-br from-[#1e1e1e] to-[#2a2a2a] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
                      {/* 头部 */}
                      <div className="flex items-center justify-between p-4 border-b border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <VideoIcon className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-white">角色 #{item.id.slice(-4)}</h4>
                            <p className="text-xs text-gray-400">
                              {item.status === 'idle' && '等待配置'}
                              {item.status === 'generating' && '生图中'}
                              {item.status === 'uploading' && '上传中'}
                              {item.status === 'creating' && '创建中'}
                              {item.status === 'completed' && '已完成'}
                              {item.status === 'error' && '错误'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeRoleItem(item.id)}
                          disabled={item.status === 'uploading' || item.status === 'creating'}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 内容 */}
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* 左边：提示词输入 */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                角色描述
                              </label>
                              <textarea
                                value={item.prompt}
                                onChange={(e) => updateRoleItem(item.id, { prompt: e.target.value })}
                                placeholder="描述您想要创建的角色特点、风格、外貌等..."
                                className="w-full h-24 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none transition-all"
                                disabled={item.status !== 'idle'}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                角色名称（可选）
                              </label>
                              <input
                                type="text"
                                value={item.roleName || ''}
                                onChange={(e) => updateRoleItem(item.id, { roleName: e.target.value })}
                                placeholder="自定义角色显示名称"
                                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                                disabled={item.status !== 'idle'}
                              />
                            </div>
                          </div>

                          {/* 右边：图片上传预览 */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                角色图片
                              </label>
                              <div
                                onClick={() => handleImageUpload(item.id)}
                                className="aspect-square border-2 border-dashed border-gray-600 hover:border-primary rounded-lg cursor-pointer transition-all duration-200 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#202020] group"
                              >
                                {item.imageUrl ? (
                                  <div className="relative w-full h-full">
                                    <img
                                      src={item.imageUrl}
                                      alt="角色图片"
                                      className="w-full h-full object-cover rounded-md"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 rounded-md flex items-center justify-center">
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <button className="px-3 py-1 bg-white/20 backdrop-blur-sm text-white rounded text-xs">
                                          更换图片
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center text-gray-500 group-hover:text-gray-400 transition-colors">
                                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                                      <ImageIcon className="w-6 h-6" />
                                    </div>
                                    <div className="text-xs font-medium mb-1">点击上传图片</div>
                                    <div className="text-[10px] opacity-75">支持 JPG、PNG、WebP</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={() => handleGenerateImage(item.id, item.prompt)}
                            disabled={!item.prompt.trim() || item.status !== 'idle'}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/25"
                          >
                            {item.status === 'generating' ? (
                              <>
                                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                生图中...
                              </>
                            ) : (
                              <>
                                <ImageIcon className="w-4 h-4" />
                                生图
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleCreateRole(item)}
                            disabled={!item.imagePath || item.status !== 'idle'}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-primary to-primaryHover hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 text-sm flex items-center justify-center gap-2"
                          >
                            {item.status === 'uploading' || item.status === 'creating' ? (
                              <>
                                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                {item.status === 'uploading' ? '上传中...' : '创建中...'}
                              </>
                            ) : item.status === 'completed' ? (
                              <>
                                <CheckIcon className="w-4 h-4" />
                                已完成
                              </>
                            ) : (
                              <>
                                <UploadIcon className="w-4 h-4" />
                                创建角色
                              </>
                            )}
                          </button>
                        </div>

                        {/* 进度消息 */}
                        {item.progressMessage && (
                          <div className="mt-3 text-center text-xs text-primary">
                            {item.progressMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="space-y-4 animate-in fade-in duration-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-400">
                  已创建的角色 ({characters.length})
                </h3>
              </div>

              {characters.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
                    <VideoIcon className="w-8 h-8 text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-500">暂无角色</p>
                  <p className="text-xs text-gray-600 mt-1">在"创建角色"选项卡中创建第一个角色</p>
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-3">
                  {characters.map((char) => (
                    <div
                      key={char.id}
                      onClick={() => setSelectedCharacter(char)}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/5 cursor-pointer transition-all duration-300 hover:scale-105 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
                    >
                      {char.original_image_url ? (
                        <img
                          src={getImageUrl(char.original_image_url)}
                          alt={char.username}
                          className="w-full h-full object-cover"
                        />
                      ) : char.video_thumbnail_url ? (
                        <video
                          src={char.video_thumbnail_url}
                          className="w-full h-full object-cover"
                          preload="metadata"
                          muted
                          onMouseOver={(e) => e.currentTarget.play()}
                          onMouseOut={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <VideoIcon className="w-12 h-12 text-gray-600" />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-sm font-medium text-white truncate">
                          {char.local_name || char.username}
                        </p>
                        {char.username !== '创建中...' && (
                          <p
                            className="text-[10px] text-gray-400 truncate cursor-pointer hover:text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(`@${char.username}`);
                            }}
                          >
                            @{char.username}
                          </p>
                        )}
                      </div>

                      <div className="absolute top-2 right-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          char.status === 'active'
                            ? 'bg-green-500/80 text-white'
                            : char.status === 'pending'
                            ? 'bg-yellow-500/80 text-white'
                            : 'bg-gray-500/80 text-white'
                        }`}>
                          {char.status === 'active' ? '✓' : char.status === 'pending' ? '⏳' : '?'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedCharacter && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setSelectedCharacter(null)}
            >
              <div
                className="relative max-w-4xl max-h-[80vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setSelectedCharacter(null)}
                  className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <XIcon className="w-6 h-6" />
                </button>

                {selectedCharacter.original_image_url ? (
                  <img
                    src={getImageUrl(selectedCharacter.original_image_url)}
                    alt={selectedCharacter.username}
                    className="max-w-full max-h-[70vh] rounded-lg object-contain"
                  />
                ) : selectedCharacter.video_thumbnail_url ? (
                  <video
                    src={selectedCharacter.video_thumbnail_url}
                    className="max-w-full max-h-[70vh] rounded-lg"
                    controls
                    autoPlay
                  />
                ) : (
                  <div className="w-96 h-96 bg-[#1a1a1a] rounded-lg flex items-center justify-center">
                    <VideoIcon className="w-16 h-16 text-gray-600" />
                  </div>
                )}

                <div className="mt-4 text-center">
                  <h3 className="text-lg font-medium text-white">
                    {selectedCharacter.local_name || selectedCharacter.username}
                  </h3>
                  <p
                    className="text-sm text-gray-400 cursor-pointer hover:text-primary hover:underline"
                    onClick={() => copyToClipboard(`@${selectedCharacter.username}`)}
                  >
                    @{selectedCharacter.username}
                  </p>
                </div>

                <button
                  onClick={() => {
                    handleDeleteCharacter(selectedCharacter.id);
                    setSelectedCharacter(null);
                  }}
                  className="absolute -bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  删除角色
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="h-16 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sora2RolePanel;
