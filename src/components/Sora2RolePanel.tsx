import React, { useState, useEffect } from 'react';
import { XIcon, TrashIcon, RefreshIcon, VideoIcon, UploadIcon, CheckIcon } from './Icons';
import { SoraCharacterService, CharacterResponse } from '../services/soraCharacter';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface Character {
  id: string;
  username: string;
  permalink: string;
  profile_picture_url: string;
  profile_desc?: string;
  status?: string;
  created_at?: string;
  local_name?: string;
}

interface Sora2RolePanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
}

// 文件上传响应接口
interface UploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export const Sora2RolePanel: React.FC<Sora2RolePanelProps> = ({ 
  isOpen, 
  onClose, 
  apiKey 
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [roleName, setRoleName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [timestamps, setTimestamps] = useState('0,3');
  const [selectedVideoPath, setSelectedVideoPath] = useState<string>('');
  const [selectedVideoName, setSelectedVideoName] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadCharacters = async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const response = await SoraCharacterService.getCharacterList(apiKey);
      if (response.code === 0 && response.data) {
        const savedNames = JSON.parse(localStorage.getItem('sora_character_names') || '{}');
        const charactersWithLocalNames = response.data.map(char => ({
          ...char,
          local_name: savedNames[char.id] || `@${char.username}`
        }));
        setCharacters(charactersWithLocalNames);
      } else {
        showMessage('error', response.msg || '获取角色列表失败');
      }
    } catch (error) {
      showMessage('error', '网络错误，请检查 API 配置');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && activeTab === 'list') {
      loadCharacters();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 使用 Tauri dialog 选择文件
  const handleFileButtonClick = async () => {
    try {
      const selected = await open({
        title: '选择视频文件',
        filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'avi'] }]
      });
      
      if (selected && typeof selected === 'string' && selected.trim()) {
        setSelectedVideoPath(selected);
        // 从路径提取文件名
        const fileName = selected.split(/[/\\]/).pop() || 'video.mp4';
        setSelectedVideoName(fileName);
        setVideoUrl('');
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      showMessage('error', '无法打开文件选择器');
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoUrl(e.target.value);
    setSelectedVideoPath('');
    setSelectedVideoName('');
  };

  const saveLocalCharacterName = (characterId: string, name: string) => {
    const savedNames = JSON.parse(localStorage.getItem('sora_character_names') || '{}');
    savedNames[characterId] = name;
    localStorage.setItem('sora_character_names', JSON.stringify(savedNames));
  };

  const uploadVideoToCatbox = async (filePath: string): Promise<string> => {
    setUploadProgress('正在上传到 Catbox...');
    
    try {
      const result = await invoke<UploadResponse>('upload_file', {
        filePath,
        uploadUrl: 'https://catbox.moe/user/api.php',
        fieldName: 'fileToUpload'
      });
      
      if (result.success && result.url) {
        setUploadProgress('');
        return result.url;
      } else {
        setUploadProgress('');
        throw new Error(result.error || '上传到 Catbox 失败');
      }
    } catch (error) {
      setUploadProgress('');
      throw error;
    }
  };

  const handleCreateCharacter = async () => {
    if (!apiKey) {
      showMessage('error', '请先在设置中配置 API 密钥');
      return;
    }

    const tsMatch = timestamps.match(/^(\d+),(\d+)$/);
    if (!tsMatch) {
      showMessage('error', '时间戳格式错误，示例: 0,3');
      return;
    }

    const startTs = parseInt(tsMatch[1]);
    const endTs = parseInt(tsMatch[2]);
    const diff = endTs - startTs;

    if (diff < 1 || diff > 3) {
      showMessage('error', '时间戳差值必须介于 1-3 秒之间');
      return;
    }

    setUploading(true);
    try {
      let finalVideoUrl = videoUrl;

      // 如果有本地视频文件，先上传到 Catbox
      if (selectedVideoPath) {
        finalVideoUrl = await uploadVideoToCatbox(selectedVideoPath);
      }

      if (!finalVideoUrl) {
        showMessage('error', '请选择视频文件或输入视频地址');
        setUploading(false);
        return;
      }

      const response = await SoraCharacterService.createCharacter(
        apiKey,
        finalVideoUrl.trim(),
        timestamps
      );

      if (response.code === 0 && response.data) {
        const characterId = response.data.id;
        const apiUsername = response.data.username;
        const displayName = roleName.trim() || `@${apiUsername}`;
        
        saveLocalCharacterName(characterId, displayName);
        
        showMessage('success', `角色创建成功！API调用名: @${apiUsername}`);
        
        setRoleName('');
        setVideoUrl('');
        setSelectedVideoPath('');
        setSelectedVideoName('');
        setTimestamps('0,3');
      } else {
        showMessage('error', response.msg || '创建失败');
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '网络错误，请检查 API 配置');
    }
    setUploading(false);
    setUploadProgress('');
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!apiKey) {
      showMessage('error', '请先在设置中配置 API 密钥');
      return;
    }

    if (!confirm('确定要删除这个角色吗？')) return;

    try {
      const response = await SoraCharacterService.deleteCharacter(apiKey, id);
      if (response.code === 0) {
        showMessage('success', '删除成功');
        const savedNames = JSON.parse(localStorage.getItem('sora_character_names') || '{}');
        delete savedNames[id];
        localStorage.setItem('sora_character_names', JSON.stringify(savedNames));
        loadCharacters();
      } else {
        showMessage('error', response.msg || '删除失败');
      }
    } catch (error) {
      showMessage('error', '网络错误');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-[90%] max-w-2xl h-[85%] bg-[#121212] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <VideoIcon className="w-4 h-4 text-white" />
            </div>
            Sora Character 角色管理
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

        {message && (
          <div className={`mx-6 mt-4 px-4 py-2 rounded-lg text-sm ${
            message.type === 'success' 
              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {message.text}
          </div>
        )}

        {uploadProgress && (
          <div className="mx-6 mt-4 px-4 py-2 rounded-lg text-sm bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {uploadProgress}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'create' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">角色名称 (本地标识)</label>
                <input
                  type="text"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="给你的角色起个名字 (可选)"
                  className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">用于本地快速识别，API会返回实际的调用名</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">视频地址</label>
                <input
                  type="text"
                  value={videoUrl}
                  onChange={handleUrlChange}
                  placeholder="https://example.com/video.mp4"
                  className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">输入可访问的视频URL地址</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">时间范围 (秒)</label>
                  <input
                    type="text"
                    value={timestamps}
                    onChange={(e) => setTimestamps(e.target.value)}
                    placeholder="0,3"
                    className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">时长说明</label>
                  <p className="text-xs text-gray-500 py-2">差值 1-3 秒</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">或上传本地视频</label>
                <div
                  onClick={handleFileButtonClick}
                  className={`
                    relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                    ${selectedVideoPath 
                      ? 'border-green-500/50 bg-green-500/5' 
                      : 'border-border hover:border-gray-500 bg-[#1a1a1a]/50'
                    }
                  `}
                >
                  {selectedVideoPath ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/30">
                        <CheckIcon className="w-8 h-8 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm text-green-400">{selectedVideoName}</p>
                        <p className="text-xs text-gray-500 mt-1">点击更换视频</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                        <UploadIcon className="w-6 h-6 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-300">
                          <span className="text-primary font-medium">点击选择视频</span> 或拖放文件到这里
                        </p>
                        <p className="text-xs text-gray-500 mt-1">视频会上传到 Catbox 图床 (需要重新编译)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#1a1a1a]/30 border border-white/5 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-400 mb-2">💡 提示</h4>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>• API 基于视频创建角色，请确保视频中包含角色正面</li>
                  <li>• 时间范围建议设置在角色动作最明显的区间</li>
                  <li>• 成功创建后，使用 @{`{username}`} 在提示词中调用角色</li>
                  <li>• 本地视频通过 Tauri 后端上传（需要重新编译应用）</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-400">
                  已创建的角色 ({characters.length})
                </h3>
                <button
                  onClick={loadCharacters}
                  disabled={loading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-all"
                >
                  <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                </div>
              ) : characters.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
                    <VideoIcon className="w-8 h-8 text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-500">暂无角色</p>
                  <p className="text-xs text-gray-600 mt-1">切换到"创建角色"标签创建第一个角色</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {characters.map((char) => (
                    <div 
                      key={char.id}
                      className="bg-[#1a1a1a]/50 border border-white/5 rounded-lg p-4 hover:border-white/10 transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {char.profile_picture_url && (
                            <img 
                              src={char.profile_picture_url} 
                              alt={char.username}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          )}
                          <div>
                            <h4 className="text-sm font-medium text-white">{char.local_name || `@${char.username}`}</h4>
                            <p className="text-[10px] text-gray-500">
                              API名: @{char.username}
                            </p>
                            <p className="text-[10px] text-gray-600 mt-0.5">
                              {char.created_at && new Date(char.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteCharacter(char.id)}
                          className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {char.profile_desc && (
                        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{char.profile_desc}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          char.status === 'active' 
                            ? 'bg-green-500/10 text-green-400' 
                            : 'bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {char.status === 'active' ? '已激活' : char.status}
                        </span>
                        {char.permalink && (
                          <a 
                            href={char.permalink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:text-primaryHover"
                          >
                            查看主页 →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-16 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-end px-6 shrink-0 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            关闭
          </button>
          {activeTab === 'create' && (
            <button
              onClick={handleCreateCharacter}
              disabled={uploading || (!videoUrl && !selectedVideoPath)}
              className="px-6 py-2 bg-primary hover:bg-primaryHover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm flex items-center gap-2"
            >
              {uploading && (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              )}
              {uploading ? '处理中...' : '创建角色'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sora2RolePanel;
