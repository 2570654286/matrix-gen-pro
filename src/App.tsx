import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS, Job, JobStatus, MediaType, VideoDuration, APP_VERSION } from './types';
import { PluginRegistry } from './services/pluginSystem';
import { shell } from './services/apiAdapter';
import { JobCard } from './components/JobCard';
import { SettingsIcon, PlayIcon, PauseIcon, TrashIcon, ImageIcon, VideoIcon, PlusIcon, XIcon, DownloadIcon, CheckIcon, AlertIcon, FolderIcon, ChatIcon, SearchIcon, CopyIcon, TerminalIcon, UserIcon } from './components/Icons';
import { LogsPanel } from './components/LogsPanel';
import { Sora2RolePanel } from './components/Sora2RolePanel';
import VersionBadge from './VersionBadge';
import { invoke } from '@tauri-apps/api/core';
// 👇 1. 引入必要的 Tauri 插件
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// ... 你的其他 import 保持不变 ...


interface PromptItem {
  id: string;
  text: string;
}

// --- Internal Component: Custom Video Player ---
const VideoPlayer = ({ src, poster }: { src: string; poster?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent closing modal
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      setProgress((current / total) * 100);
      // Ensure duration is set if valid
      if (!isNaN(total) && total > 0) {
        setDuration(total);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
        setDuration(videoRef.current.duration);
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newProgress = parseFloat(e.target.value);
    if (videoRef.current) {
      const newTime = (newProgress / 100) * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setProgress(newProgress);
    }
  };

  // Helper to format seconds to MM:SS or just SS if short
  const formatTime = (seconds: number) => {
      if (isNaN(seconds)) return "0s";
      return Math.floor(seconds) + "s";
  };

  return (
    <div className="relative group w-full h-full flex items-center justify-center bg-black/80" onClick={(e) => e.stopPropagation()}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="max-h-full max-w-full object-contain cursor-pointer"
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        loop
      />
      
      {/* Play/Pause Overlay (Center) */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm p-4 rounded-full border border-white/20">
             <PlayIcon className="w-8 h-8 text-white fill-white" />
          </div>
        </div>
      )}

      {/* Controls Bar (Bottom) */}
      <div 
        className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md rounded-lg px-4 py-2 flex items-center gap-3 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={togglePlay} className="text-white hover:text-primary transition-colors">
          {isPlaying ? <PauseIcon className="w-5 h-5 fill-current" /> : <PlayIcon className="w-5 h-5 fill-current" />}
        </button>
        
        {/* Scrubber */}
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={progress || 0} 
          onChange={handleSeek}
          className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary"
        />
        
        <span className="text-[10px] font-mono text-gray-300 min-w-[60px] text-right">
            {videoRef.current ? formatTime(videoRef.current.currentTime) : '0s'} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

// --- Internal Component: Settings Modal ---
const SettingsModal = ({ 
  isOpen, 
  onClose, 
  settings, 
  setSettings 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  settings: AppSettings; 
  setSettings: (s: AppSettings) => void 
}) => {
  const [activeTab, setActiveTab] = useState<'global' | 'image' | 'video' | 'llm'>('global');
  const providers = PluginRegistry.getAll();
  const currentProvider = PluginRegistry.get(settings.providerId);
  
  // Filter providers by capability
  const imageProviders = providers.filter(p => p.getSupportedModels(MediaType.IMAGE).length > 0);
  const videoProviders = providers.filter(p => p.getSupportedModels(MediaType.VIDEO).length > 0);

  // Check if using custom config for each type
  const imageUsesCustom = !!(settings.imageProviderId || settings.imageApiKey);
  const videoUsesCustom = !!(settings.videoProviderId || settings.videoApiKey);
  const llmUsesCustom = !!(settings.llmProviderId || settings.llmApiKey);

  // Auto-switch tab based on current media type when modal opens
  useEffect(() => {
    if (isOpen) {
      if (settings.mediaType === MediaType.IMAGE) {
        setActiveTab('image');
      } else if (settings.mediaType === MediaType.VIDEO) {
        setActiveTab('video');
      }
    }
  }, [isOpen, settings.mediaType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-[90%] max-w-4xl h-[95%] bg-[#121212] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
        
        {/* 底部阻挡层 - 防止点击设置界面下方的元素 */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-[#121212] -z-10"></div>
        
        {/* Header */}
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] shrink-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              API 配置
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <XIcon className="w-5 h-5 text-gray-400" />
            </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-[#0f0f0f] px-6 shrink-0">
          <button
            onClick={() => setActiveTab('global')}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === 'global'
                ? 'text-primary border-primary'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            全局配置
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'image'
                ? 'text-primary border-primary'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            图像生成
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'video'
                ? 'text-primary border-primary'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <VideoIcon className="w-4 h-4" />
            视频生成
          </button>
          <button
            onClick={() => setActiveTab('llm')}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'llm'
                ? 'text-primary border-primary'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <ChatIcon className="w-4 h-4" />
            大语言模型
          </button>
        </div>

        {/* Content Area - Single Scroll */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* Content here... */}
          {/* Global Tab */}
          {activeTab === 'global' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h3 className="text-base font-bold text-white mb-1">全局 API 配置</h3>
                <p className="text-xs text-gray-500">这些配置将作为默认设置</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">API 供应商</label>
                  <select
                      value={settings.providerId}
                      onChange={(e) => setSettings({...settings, providerId: e.target.value})}
                      className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary transition-all"
                  >
                      {providers.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1.5">{currentProvider.description}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">API 密钥</label>
                  <input 
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
                    placeholder="输入您的 API 密钥 (sk-...)"
                    className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">接口地址</label>
                  <input 
                    type="text"
                    value={settings.baseUrl}
                    onChange={(e) => setSettings({...settings, baseUrl: e.target.value})}
                    placeholder="https://api.openai.com/v1"
                    className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                  />
                  <p className="text-[10px] text-gray-500 mt-1.5">通常格式: https://api.example.com/v1</p>
                </div>

                {/* 全局模型选择 */}
                <div className="space-y-4">
                  {/* 图像模型 */}
                  <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-blue-400" />
                      图像生成模型
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PluginRegistry.get(settings.providerId)
                        .getSupportedModels(MediaType.IMAGE)
                        .map((model) => (
                          <button
                            key={model}
                            onClick={() => setSettings({...settings, imageModel: model})}
                            className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left ${
                              settings.imageModel === model
                                ? 'bg-primary/20 border-primary text-white'
                                : 'bg-black/30 border-border text-gray-400 hover:border-gray-500 hover:text-white'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                    </div>
                    <input 
                      type="text"
                      value={settings.imageModel}
                      onChange={(e) => setSettings({...settings, imageModel: e.target.value})}
                      placeholder="或手动输入模型名称"
                      className="w-full mt-3 bg-black/30 border border-border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>

                  {/* 视频模型 */}
                  <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <VideoIcon className="w-4 h-4 text-purple-400" />
                      视频生成模型
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PluginRegistry.get(settings.providerId)
                        .getSupportedModels(MediaType.VIDEO)
                        .map((model) => (
                          <button
                            key={model}
                            onClick={() => setSettings({...settings, videoModel: model})}
                            className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left ${
                              settings.videoModel === model
                                ? 'bg-primary/20 border-primary text-white'
                                : 'bg-black/30 border-border text-gray-400 hover:border-gray-500 hover:text-white'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                    </div>
                    <input 
                      type="text"
                      value={settings.videoModel}
                      onChange={(e) => setSettings({...settings, videoModel: e.target.value})}
                      placeholder="或手动输入模型名称"
                      className="w-full mt-3 bg-black/30 border border-border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>

                  {/* LLM 模型 */}
                  <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <ChatIcon className="w-4 h-4 text-green-400" />
                      大语言模型
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PluginRegistry.get(settings.providerId)
                        .getSupportedModels(MediaType.TEXT)
                        .map((model) => (
                          <button
                            key={model}
                            onClick={() => setSettings({...settings, llmModel: model})}
                            className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left ${
                              settings.llmModel === model
                                ? 'bg-primary/20 border-primary text-white'
                                : 'bg-black/30 border-border text-gray-400 hover:border-gray-500 hover:text-white'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                    </div>
                    <input 
                      type="text"
                      value={settings.llmModel}
                      onChange={(e) => setSettings({...settings, llmModel: e.target.value})}
                      placeholder="或手动输入模型名称"
                      className="w-full mt-3 bg-black/30 border border-border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Image Tab */}
          {activeTab === 'image' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">图像生成配置</h3>
                  <p className="text-xs text-gray-500">配置文生图 (Text-to-Image) 参数</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={imageUsesCustom}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Enable custom config
                        setSettings({
                          ...settings,
                          imageProviderId: settings.imageProviderId || settings.providerId,
                          imageApiKey: settings.imageApiKey || settings.apiKey
                        });
                      } else {
                        // Disable custom config, use global
                        setSettings({
                          ...settings,
                          imageProviderId: undefined,
                          imageApiKey: undefined
                        });
                      }
                    }}
                    className="w-4 h-4 rounded border-border bg-[#1a1a1a] text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="group-hover:text-white transition-colors">使用独立配置</span>
                </label>
              </div>

              <div className="space-y-4">
                {imageUsesCustom ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-2">API 供应商</label>
                      <select
                          value={settings.imageProviderId || settings.providerId}
                          onChange={(e) => setSettings({...settings, imageProviderId: e.target.value})}
                          className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary transition-all"
                      >
                          {imageProviders.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-2">API 密钥</label>
                      <input 
                        type="password"
                        value={settings.imageApiKey ?? settings.apiKey}
                        onChange={(e) => setSettings({...settings, imageApiKey: e.target.value})}
                        placeholder="留空则使用全局配置"
                        className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </>
                ) : (
                  <div className="bg-[#1a1a1a]/30 border border-white/5 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">当前使用全局配置</p>
                    <p className="text-[10px] text-gray-600 mt-1">Provider: {settings.providerId}</p>
                  </div>
                )}

                <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-300 mb-3">选择模型</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PluginRegistry.get(settings.imageProviderId || settings.providerId)
                      .getSupportedModels(MediaType.IMAGE)
                      .map((model) => (
                        <button
                          key={model}
                          onClick={() => setSettings({...settings, imageModel: model})}
                          className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left ${
                            settings.imageModel === model
                              ? 'bg-primary/20 border-primary text-white'
                              : 'bg-black/30 border-border text-gray-400 hover:border-gray-500 hover:text-white'
                          }`}
                        >
                          {model}
                        </button>
                      ))}
                  </div>
                  <input 
                    type="text"
                    value={settings.imageModel}
                    onChange={(e) => setSettings({...settings, imageModel: e.target.value})}
                    placeholder="或手动输入模型名称"
                    className="w-full mt-3 bg-black/30 border border-border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Video Tab */}
          {activeTab === 'video' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">视频生成配置</h3>
                  <p className="text-xs text-gray-500">配置文生视频 (Text-to-Video) 参数</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={videoUsesCustom}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Enable custom config
                        setSettings({
                          ...settings,
                          videoProviderId: settings.videoProviderId || settings.providerId,
                          videoApiKey: settings.videoApiKey || settings.apiKey
                        });
                      } else {
                        // Disable custom config, use global
                        setSettings({
                          ...settings,
                          videoProviderId: undefined,
                          videoApiKey: undefined
                        });
                      }
                    }}
                    className="w-4 h-4 rounded border-border bg-[#1a1a1a] text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="group-hover:text-white transition-colors">使用独立配置</span>
                </label>
              </div>

              <div className="space-y-4">
                {videoUsesCustom ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-2">API 供应商</label>
                      <select
                          value={settings.videoProviderId || settings.providerId}
                          onChange={(e) => setSettings({...settings, videoProviderId: e.target.value})}
                          className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary transition-all"
                      >
                          {videoProviders.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-2">API 密钥</label>
                      <input 
                        type="password"
                        value={settings.videoApiKey ?? settings.apiKey}
                        onChange={(e) => setSettings({...settings, videoApiKey: e.target.value})}
                        placeholder="留空则使用全局配置"
                        className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </>
                ) : (
                  <div className="bg-[#1a1a1a]/30 border border-white/5 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">当前使用全局配置</p>
                    <p className="text-[10px] text-gray-600 mt-1">Provider: {settings.providerId}</p>
                  </div>
                )}

                <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-300 mb-3">选择模型</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PluginRegistry.get(settings.videoProviderId || settings.providerId)
                      .getSupportedModels(MediaType.VIDEO)
                      .map((model) => (
                        <button
                          key={model}
                          onClick={() => setSettings({...settings, videoModel: model})}
                          className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left ${
                            settings.videoModel === model
                              ? 'bg-primary/20 border-primary text-white'
                              : 'bg-black/30 border-border text-gray-400 hover:border-gray-500 hover:text-white'
                          }`}
                        >
                          {model}
                        </button>
                      ))}
                  </div>
                  <input 
                    type="text"
                    value={settings.videoModel}
                    onChange={(e) => setSettings({...settings, videoModel: e.target.value})}
                    placeholder="或手动输入模型名称"
                    className="w-full mt-3 bg-black/30 border border-border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* LLM Tab */}
          {activeTab === 'llm' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">大语言模型配置</h3>
                  <p className="text-xs text-gray-500">配置 LLM API 用于提示词优化和智能生成</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={llmUsesCustom}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Enable custom config
                        setSettings({
                          ...settings,
                          llmProviderId: settings.llmProviderId || settings.providerId,
                          llmApiKey: settings.llmApiKey || settings.apiKey
                        });
                      } else {
                        // Disable custom config, use global
                        setSettings({
                          ...settings,
                          llmProviderId: undefined,
                          llmApiKey: undefined
                        });
                      }
                    }}
                    className="w-4 h-4 rounded border-border bg-[#1a1a1a] text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="group-hover:text-white transition-colors">使用独立配置</span>
                </label>
              </div>

              <div className="space-y-4">
                {llmUsesCustom ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-2">API 供应商</label>
                      <select
                          value={settings.llmProviderId || settings.providerId}
                          onChange={(e) => setSettings({...settings, llmProviderId: e.target.value})}
                          className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary transition-all"
                      >
                          {providers.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                      <p className="text-[10px] text-gray-500 mt-1.5">
                        {PluginRegistry.get(settings.llmProviderId || settings.providerId).description}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-2">API 密钥</label>
                      <input 
                        type="password"
                        value={settings.llmApiKey ?? settings.apiKey}
                        onChange={(e) => setSettings({...settings, llmApiKey: e.target.value})}
                        placeholder="留空则使用全局配置"
                        className="w-full bg-[#1a1a1a] border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </>
                ) : (
                  <div className="bg-[#1a1a1a]/30 border border-white/5 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">当前使用全局配置</p>
                    <p className="text-[10px] text-gray-600 mt-1">Provider: {settings.providerId}</p>
                  </div>
                )}

                <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-300 mb-3">选择模型</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PluginRegistry.get(settings.llmProviderId || settings.providerId)
                      .getSupportedModels(MediaType.TEXT)
                      .map((model) => (
                        <button
                          key={model}
                          onClick={() => setSettings({...settings, llmModel: model})}
                          className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left ${
                            settings.llmModel === model
                              ? 'bg-primary/20 border-primary text-white'
                              : 'bg-black/30 border-border text-gray-400 hover:border-gray-500 hover:text-white'
                          }`}
                        >
                          {model}
                        </button>
                      ))}
                  </div>
                  <input 
                    type="text"
                    value={settings.llmModel}
                    onChange={(e) => setSettings({...settings, llmModel: e.target.value})}
                    placeholder="或手动输入模型名称"
                    className="w-full mt-3 bg-black/30 border border-border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between px-6 shrink-0">
          <div className="text-xs text-gray-500">
            {activeTab === 'global' && '全局配置将应用于所有媒体类型'}
            {activeTab === 'image' && (imageUsesCustom ? '使用独立配置' : '继承全局配置')}
            {activeTab === 'video' && (videoUsesCustom ? '使用独立配置' : '继承全局配置')}
            {activeTab === 'llm' && (llmUsesCustom ? '使用独立配置' : '继承全局配置')}
          </div>
          <div className="flex items-center gap-4">
            <VersionBadge />
            <button 
              onClick={onClose} 
              className="px-6 py-2 bg-primary hover:bg-primaryHover text-white font-semibold rounded-lg transition-colors text-sm"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---
function App() {
  // --- 1. State with Persistence Initialization ---
  const [settings, setSettings] = useState<AppSettings>(() => {

  

    try {
        const saved = localStorage.getItem('MATRIX_SETTINGS');
        return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
  });

  // Prompts stored separately by media type (only IMAGE and VIDEO)
  type MediaPrompts = Record<MediaType.IMAGE | MediaType.VIDEO, PromptItem[]>;
  const [prompts, setPrompts] = useState<MediaPrompts>(() => {
      try {
          const saved = localStorage.getItem('MATRIX_PROMPTS');
          if (saved) {
              const parsed = JSON.parse(saved);
              // Handle migration from old format
              if (Array.isArray(parsed)) {
                  return {
                      [MediaType.IMAGE]: parsed,
                      [MediaType.VIDEO]: [{ id: '1', text: '' }]
                  } as MediaPrompts;
              }
              return {
                  [MediaType.IMAGE]: parsed[MediaType.IMAGE] || [{ id: '1', text: '' }],
                  [MediaType.VIDEO]: parsed[MediaType.VIDEO] || [{ id: '1', text: '' }]
              } as MediaPrompts;
          }
          return {
              [MediaType.IMAGE]: [{ id: '1', text: '' }],
              [MediaType.VIDEO]: [{ id: '1', text: '' }]
          } as MediaPrompts;
      } catch {
          return {
              [MediaType.IMAGE]: [{ id: '1', text: '' }],
              [MediaType.VIDEO]: [{ id: '1', text: '' }]
          } as MediaPrompts;
      }
  });

  const [jobs, setJobs] = useState<Job[]>(() => {
      try {
          const saved = localStorage.getItem('MATRIX_JOBS');
          if (saved) {
              const parsed = JSON.parse(saved);
              // 清理过时的 PROCESSING 任务（超过15分钟的）
              const now = Date.now();
              const staleThreshold = 15 * 60 * 1000; // 15分钟
              const cleaned = parsed.map((j: Job) => {
                  if (j.status === JobStatus.PROCESSING) {
                      const age = now - j.createdAt;
                      if (age > staleThreshold) {
                          // 超时的任务标记为失败
                          return { ...j, status: JobStatus.FAILED, error: '生成超时 (15分钟)', progress: 0 };
                      }
                  }
                  return j;
              });
              return cleaned;
          }
          return [];
      } catch {
          return [];
      }
  });

  // Active prompt ID stored separately by media type (only IMAGE and VIDEO)
  type MediaActivePromptId = Record<MediaType.IMAGE | MediaType.VIDEO, string>;
  const [activePromptId, setActivePromptId] = useState<MediaActivePromptId>(() => {
      try {
          const saved = localStorage.getItem('MATRIX_ACTIVE_PROMPT_ID');
          if (saved) {
              const parsed = JSON.parse(saved);
              if (typeof parsed === 'string') {
                  // Migration from old format
                  return {
                      [MediaType.IMAGE]: parsed,
                      [MediaType.VIDEO]: '1'
                  } as MediaActivePromptId;
              }
              return {
                  [MediaType.IMAGE]: parsed[MediaType.IMAGE] || '1',
                  [MediaType.VIDEO]: parsed[MediaType.VIDEO] || '1'
              } as MediaActivePromptId;
          }
          return {
              [MediaType.IMAGE]: '1',
              [MediaType.VIDEO]: '1'
          } as MediaActivePromptId;
      } catch {
          return {
              [MediaType.IMAGE]: '1',
              [MediaType.VIDEO]: '1'
          } as MediaActivePromptId;
      }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showSora2Role, setShowSora2Role] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [focusedJob, setFocusedJob] = useState<Job | null>(null);

  // Update System State
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);

  // Simulation State for System Status
  const [latency, setLatency] = useState(45);
  const [cloudLoad, setCloudLoad] = useState(24);

  // Resizing State
  const [promptPanelHeight, setPromptPanelHeight] = useState(300); // Default pixel height
  const isResizingRef = useRef(false);
  const resizeRafRef = useRef<number>(0);

  // Refs for smooth interactions
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const promptPanelRef = useRef<HTMLDivElement>(null);

  // --- 2. Persistence Effects ---
  useEffect(() => {
    localStorage.setItem('MATRIX_SETTINGS', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('MATRIX_PROMPTS', JSON.stringify(prompts));
  }, [prompts]);

  useEffect(() => {
    localStorage.setItem('MATRIX_ACTIVE_PROMPT_ID', JSON.stringify(activePromptId));
  }, [activePromptId]);

  useEffect(() => {
    // Only save the last 500 jobs
    const jobsToSave = jobs.length > 500 ? jobs.slice(0, 500) : jobs;
    localStorage.setItem('MATRIX_JOBS', JSON.stringify(jobsToSave));
  }, [jobs]);

  // --- 3. Remote Update Check (使用 Tauri Updater 插件) ---
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        console.log('[App] 检查更新中...');
        const updateResult = await invoke<{ shouldUpdate: boolean; manifest?: { version: string; body: string; date: string } }>('check_for_updates');
        
        if (updateResult?.shouldUpdate && updateResult.manifest?.version) {
          console.log(`[App] 发现新版本: ${updateResult.manifest.version}`);
          setUpdateAvailable(updateResult.manifest.version);
        }
      } catch (error) {
        console.log('[App] 更新检查失败（这是正常的，如果尚未配置完整）:', error);
      }
    };
    
    checkForUpdates();
    
    // 每30分钟检查一次
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // --- 处理更新 ---
  const handleUpdate = async () => {
    try {
      console.log('[App] 开始下载并安装更新...');
      await invoke('install_update');
      // 安装完成后自动重启
      await invoke('relaunch_app');
    } catch (error) {
      console.error('[App] 更新安装失败:', error);
      alert('更新安装失败，请手动下载新版本');
    }
  };

  // --- Auto-Focus Logic ---
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [activePromptId, settings.mediaType]);

  // --- 定时清理超时任务 ---
  useEffect(() => {
    const checkStaleJobs = () => {
      setJobs(prev => {
        const now = Date.now();
        const staleThreshold = 15 * 60 * 1000; // 15分钟
        const needsUpdate = prev.some(j => 
          j.status === JobStatus.PROCESSING && (now - j.createdAt) > staleThreshold
        );
        
        if (!needsUpdate) return prev;
        
        return prev.map((j: Job) => {
          if (j.status === JobStatus.PROCESSING && (now - j.createdAt) > staleThreshold) {
            console.log(`[App] 任务 ${j.id} 超时，标记为失败`);
            return { ...j, status: JobStatus.FAILED, error: '生成超时 (15分钟)', progress: 0 };
          }
          return j;
        });
      });
    };
    
    // 每分钟检查一次
    const interval = setInterval(checkStaleJobs, 60000);
    return () => clearInterval(interval);
  }, []);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLogs) setShowLogs(false);
        else if (showSettings) setShowSettings(false);
        else setFocusedJob(null);
      }
      // Ctrl+L or Cmd+L to open logs
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        setShowLogs(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, showLogs]);

  // --- Resize Handler (Optimized for Windows/Cross-platform) ---
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // CRITICAL: Stop text selection
    isResizingRef.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.classList.add('select-none'); // Helper class or direct style
    document.body.style.setProperty('user-select', 'none');
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !mainContainerRef.current) return;
      
      const containerRect = mainContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top;
      const newHeight = Math.max(150, Math.min(relativeY, containerRect.height - 150));
      
      // Use requestAnimationFrame for smooth visual updates (Solving the "not sticky" issue)
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      
      resizeRafRef.current = requestAnimationFrame(() => {
        setPromptPanelHeight(newHeight);
      });
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.removeProperty('user-select');
        document.body.classList.remove('select-none');
        if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    };
  }, []);

  // --- System Status Simulation Effect ---
  useEffect(() => {
    const interval = setInterval(() => {
        setLatency(prev => {
            const noise = Math.floor(Math.random() * 20) - 10;
            return Math.max(35, Math.min(120, prev + noise));
        });
        setCloudLoad(prev => {
             const noise = Math.floor(Math.random() * 6) - 3;
             return Math.max(10, Math.min(95, prev + noise));
        });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const initUpdater = async () => {
      try {
        const update = await check() as any;
        if (update?.shouldUpdate) {
          console.log(`发现新版本: ${update.manifest?.version}`);
          await update.downloadAndInstall();
          await relaunch();
        } else {
          console.log('当前已是最新版本');
        }
      } catch (error) {
        console.error('更新检查失败:', error);
      }
    };
    initUpdater();
  }, []);

  // --- Queue Processing Logic ---
  const processingRef = useRef(false);

  const processNextJob = useCallback(async () => {
    if (processingRef.current) return;

    const pendingJobs = jobs.filter(j => j.status === JobStatus.PENDING);
    if (pendingJobs.length === 0) {
      setIsProcessing(false);
      return;
    }

    const processingCount = jobs.filter(j => j.status === JobStatus.PROCESSING).length;
    if (processingCount >= settings.concurrency) return;

    const jobToProcess = pendingJobs[0];

    // Mark as processing immediately
    setJobs(prev => prev.map(j => j.id === jobToProcess.id ? { ...j, status: JobStatus.PROCESSING, progress: 0 } : j));
    
    processJob(jobToProcess);

  }, [jobs, settings.concurrency]);

  const processJob = async (job: Job) => {
    try {
      // --- PLUGIN SYSTEM INTEGRATION ---
      const isVideo = settings.mediaType === MediaType.VIDEO;
      
      const activeProviderId = isVideo 
        ? (settings.videoProviderId || settings.providerId) 
        : (settings.imageProviderId || settings.providerId);
        
      const activeApiKey = isVideo 
        ? (settings.videoApiKey || settings.apiKey) 
        : (settings.imageApiKey || settings.apiKey);
        
      const activeModel = isVideo ? settings.videoModel : settings.imageModel;

      const plugin = PluginRegistry.get(activeProviderId);

      const resultUrl = await plugin.generate(
          {
            prompt: job.prompt,
            apiKey: activeApiKey,
            baseUrl: settings.baseUrl,
            model: activeModel,
            aspectRatio: settings.aspectRatio,
            mediaType: settings.mediaType,
            videoDuration: settings.videoDuration
          }, 
          // Progress Callback
          (percent) => {
             setJobs(prev => prev.map(j => 
                j.id === job.id ? { ...j, progress: percent } : j
             ));
          }
      );
      // --------------------------------

      const ext = settings.mediaType === MediaType.VIDEO ? 'mp4' : 'png';
      const prefix = settings.mediaType === MediaType.VIDEO ? 'Video' : 'Image';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const shortId = job.id.split('-')[1] || job.id.slice(0,6);
      const fileName = `${prefix}_${dateStr}_${shortId}.${ext}`;

      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { ...j, status: JobStatus.COMPLETED, resultUrl, fileName, progress: 100 } 
          : j
      ));
    } catch (err) {
      console.error("Job Failed:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown API Error';
      
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { ...j, status: JobStatus.FAILED, error: errorMessage, progress: 0 } 
          : j
      ));
    }
  };

  useEffect(() => {
    const activeJobs = jobs.filter(j => j.status === JobStatus.PENDING || j.status === JobStatus.PROCESSING);
    if (activeJobs.length > 0) {
      setIsProcessing(true);
      const interval = setInterval(processNextJob, 500);
      return () => clearInterval(interval);
    } else {
      setIsProcessing(false);
    }
  }, [jobs, processNextJob]);


  // Helper to safely get current media type (only IMAGE or VIDEO)
  const getCurrentMediaType = (): MediaType.IMAGE | MediaType.VIDEO => {
    return settings.mediaType === MediaType.IMAGE ? MediaType.IMAGE : MediaType.VIDEO;
  };

  // --- Event Handlers ---
  const handleAddPrompt = () => {
    const mediaType = getCurrentMediaType();
    const currentPrompts = prompts[mediaType];
    const newId = Date.now().toString();
    setPrompts({
      ...prompts,
      [mediaType]: [...currentPrompts, { id: newId, text: '' }]
    });
    setActivePromptId({
      ...activePromptId,
      [mediaType]: newId
    });
  };

  const handleDeletePrompt = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const mediaType = getCurrentMediaType();
    const currentPrompts = prompts[mediaType];
    if (currentPrompts.length === 1) {
      setPrompts({
        ...prompts,
        [mediaType]: [{ id: Date.now().toString(), text: '' }]
      });
      setActivePromptId({
        ...activePromptId,
        [mediaType]: Date.now().toString()
      });
      return;
    }
    const newPrompts = currentPrompts.filter((p: PromptItem) => p.id !== id);
    setPrompts({
      ...prompts,
      [mediaType]: newPrompts
    });
    if (activePromptId[mediaType] === id) {
      setActivePromptId({
        ...activePromptId,
        [mediaType]: newPrompts[0].id
      });
    }
  };

  const handleUpdatePrompt = (text: string) => {
    const mediaType = getCurrentMediaType();
    const currentPrompts = prompts[mediaType];
    const currentActiveId = activePromptId[mediaType];
    setPrompts({
      ...prompts,
      [mediaType]: currentPrompts.map((p: PromptItem) => p.id === currentActiveId ? { ...p, text } : p)
    });
  };

  const handleSingleGenerate = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    if (!text.trim()) return;

    // Generate just 1 job for this specific prompt
    const newJob: Job = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        prompt: text.trim(),
        status: JobStatus.PENDING,
        createdAt: Date.now(),
        progress: 0,
        mediaType: settings.mediaType
    };
    setJobs(prev => [newJob, ...prev]);
  };

  const handleStartBatch = () => {
    const mediaType = getCurrentMediaType();
    const currentPrompts = prompts[mediaType];
    const validPrompts = currentPrompts.filter((p: PromptItem) => p.text.trim() !== '');
    if (validPrompts.length === 0) return;

    const newJobs: Job[] = [];

    validPrompts.forEach((p: PromptItem) => {
      for (let i = 0; i < settings.batchSize; i++) {
        newJobs.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          prompt: p.text.trim(),
          status: JobStatus.PENDING,
          createdAt: Date.now(),
          progress: 0,
          mediaType: settings.mediaType
        });
      }
    });

    setJobs(prev => [...newJobs, ...prev]);
  };

  const handleClearFinished = () => {
    // Only clear finished jobs for current media type
    setJobs(prev => prev.filter(j => 
      !(j.mediaType === settings.mediaType && (j.status === JobStatus.COMPLETED || j.status === JobStatus.FAILED))
    ));
  };

  const handleRename = (id: string, newName: string) => {
    setJobs(prev => prev.map(j => {
        if (j.id === id) {
            return { ...j, fileName: newName };
        }
        return j;
    }));
    if (focusedJob && focusedJob.id === id) {
        setFocusedJob(prev => prev ? { ...prev, fileName: newName } : null);
    }
  };

  const handleOpenFolder = async () => {
      if (!focusedJob) return;
      const folder = settings.mediaType === MediaType.VIDEO ? 'Video' : 'Image';
      const path = `./${folder}/${focusedJob.fileName || 'file'}`;
      await shell.open(path);
  }

  // --- Helpers ---
  const getPromptSummary = (text: string) => {
    const cleanText = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return '';
    const isEnglish = /^[A-Za-z0-9\s.,!?'"]+$/.test(cleanText);

    if (isEnglish) {
        const words = cleanText.split(' ');
        if (words.length <= 4) return cleanText;
        return words.slice(0, 4).join(' ') + '...';
    } else {
        if (cleanText.length <= 10) return cleanText;
        return cleanText.substring(0, 10) + '...';
    }
  };

  // --- Statistics ---
  // Only show jobs for current media type
  const currentJobs = jobs.filter(j => j.mediaType === settings.mediaType);
  const stats = {
    pending: currentJobs.filter(j => j.status === JobStatus.PENDING).length,
    processing: currentJobs.filter(j => j.status === JobStatus.PROCESSING).length,
    completed: currentJobs.filter(j => j.status === JobStatus.COMPLETED).length,
  };

  // Get current media type's prompts
  const currentMediaType = getCurrentMediaType();
  const currentPrompts = prompts[currentMediaType];
  const currentActivePromptId = activePromptId[currentMediaType];
  const activePrompt = currentPrompts.find((p: PromptItem) => p.id === currentActivePromptId) || currentPrompts[0] || { id: 'default', text: '' };
  const validPromptCount = currentPrompts.filter((p: PromptItem) => p.text.trim().length > 0).length;

  return (
    <div className="flex h-screen w-full bg-background text-gray-200 font-sans selection:bg-primary/30">
      
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        settings={settings}
        setSettings={setSettings}
      />

      <LogsPanel 
        isOpen={showLogs} 
        onClose={() => setShowLogs(false)} 
      />

      <Sora2RolePanel 
        isOpen={showSora2Role} 
        onClose={() => setShowSora2Role(false)}
        apiKey={settings.apiKey}
        providerId={settings.videoProviderId || settings.providerId}
        mediaType={settings.mediaType}
      />

      {/* === Left Sidebar: Control Center === */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-[#080808] flex flex-col z-20">
        
        {/* App Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-border bg-black/20 select-none">
          <div className="flex items-center">
             <div className="h-3 w-3 rounded-full bg-primary shadow-[0_0_10px_rgba(109,40,217,0.5)] mr-3"></div>
             <h1 className="font-bold text-lg tracking-wide text-white">MATRIX<span className="text-gray-500 font-normal">GEN</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSora2Role(true)}
              className="text-gray-500 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-md"
              title="Sora2 角色参考图配置"
            >
              <UserIcon className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowLogs(true)}
              className="text-gray-500 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-md"
              title="查看日志 (Ctrl+L)"
            >
              <TerminalIcon className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="text-gray-500 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-md"
              title="设置 API 连接"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Section: Generation Params */}
          <section className="space-y-6">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">核心配置</h2>
            
            {/* Media Type Toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#121212] rounded-lg border border-border">
              <button 
                onClick={() => setSettings({...settings, mediaType: MediaType.IMAGE})}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${settings.mediaType === MediaType.IMAGE ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
              >
                <ImageIcon className="w-3 h-3" /> 图像
              </button>
              <button 
                onClick={() => setSettings({...settings, mediaType: MediaType.VIDEO})}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${settings.mediaType === MediaType.VIDEO ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
              >
                <VideoIcon className="w-3 h-3" /> 视频
              </button>
            </div>
            
            {/* Aspect Ratio (Visual Buttons) */}
            <div className="space-y-1">
                <label className="block text-xs text-gray-400 mb-1.5 ml-1">画面比例 (Aspect Ratio)</label>
                <div className="grid grid-cols-3 gap-2">
                    <button 
                        onClick={() => setSettings({...settings, aspectRatio: '1024x1024'})}
                        className={`py-2 rounded border text-xs font-mono transition-all flex flex-col items-center gap-1 ${settings.aspectRatio === '1024x1024' ? 'bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(109,40,217,0.2)]' : 'bg-[#121212] border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'}`}
                    >
                        <div className="w-3 h-3 border border-current rounded-sm"></div>
                        1:1
                    </button>
                    <button 
                        onClick={() => setSettings({...settings, aspectRatio: '1920x1080'})}
                        className={`py-2 rounded border text-xs font-mono transition-all flex flex-col items-center gap-1 ${settings.aspectRatio === '1920x1080' ? 'bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(109,40,217,0.2)]' : 'bg-[#121212] border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'}`}
                    >
                        <div className="w-4 h-2.5 border border-current rounded-sm"></div>
                        16:9
                    </button>
                    <button 
                        onClick={() => setSettings({...settings, aspectRatio: '1080x1920'})}
                        className={`py-2 rounded border text-xs font-mono transition-all flex flex-col items-center gap-1 ${settings.aspectRatio === '1080x1920' ? 'bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(109,40,217,0.2)]' : 'bg-[#121212] border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'}`}
                    >
                        <div className="w-2.5 h-4 border border-current rounded-sm"></div>
                        9:16
                    </button>
                </div>
            </div>

            {/* Video Duration Selector (Only Visible in Video Mode) */}
            {settings.mediaType === MediaType.VIDEO && (
                <div className="space-y-1 animate-slide-up">
                    <label className="block text-xs text-gray-400 mb-1.5 ml-1">视频时长 (Duration)</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => setSettings({...settings, videoDuration: '10s'})}
                            className={`py-2 text-xs rounded border transition-all font-mono ${settings.videoDuration === '10s' ? 'bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(109,40,217,0.2)]' : 'bg-[#121212] border-border text-gray-500 hover:border-gray-500'}`}
                        >
                            10s
                        </button>
                         <button 
                            onClick={() => setSettings({...settings, videoDuration: '15s'})}
                            className={`py-2 text-xs rounded border transition-all font-mono ${settings.videoDuration === '15s' ? 'bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(109,40,217,0.2)]' : 'bg-[#121212] border-border text-gray-500 hover:border-gray-500'}`}
                        >
                            15s
                        </button>
                    </div>
                </div>
            )}

            {/* Separator */}
            <div className="h-px bg-white/5 my-2"></div>

            {/* Batch Size (Quantity) */}
            <div className="space-y-2">
               <div className="flex justify-between items-center ml-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-white">裂变数量 (Quantity)</label>
                    <span className="text-[10px] text-gray-500">单条提示词生成总数</span>
                  </div>
                  <span className="text-xs font-bold text-white font-mono bg-[#222] px-2 py-0.5 rounded border border-white/10">{settings.batchSize}</span>
               </div>
               <div className="relative pt-1">
                 <input 
                    type="range" min="1" max="10" step="1"
                    value={settings.batchSize}
                    onChange={(e) => setSettings({...settings, batchSize: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-primary transition-colors z-10 relative"
                  />
                  <div className="flex justify-between px-1 mt-1">
                     {[1, 3, 5, 8, 10].map(n => (
                        <div key={n} className="flex flex-col items-center gap-1">
                           <div className="w-px h-1.5 bg-gray-600"></div>
                           <span className="text-[9px] text-gray-600 font-mono">{n}</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* Concurrency (Speed) */}
            <div className="space-y-2">
               <div className="flex justify-between items-center ml-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-primary">并发加速 (Threads)</label>
                    <span className="text-[10px] text-gray-500">同时进行的生成任务</span>
                  </div>
                  <span className="text-xs font-bold text-primary font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/20">{settings.concurrency}</span>
               </div>
                <div className="relative pt-1">
                 <input 
                    type="range" min="1" max="20" step="1"
                    value={settings.concurrency}
                    onChange={(e) => setSettings({...settings, concurrency: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary z-10 relative"
                  />
                   <div className="flex justify-between px-1 mt-1">
                     {[1, 5, 10, 15, 20].map(n => (
                        <div key={n} className="flex flex-col items-center gap-1">
                           <div className={`w-px h-1.5 ${n <= settings.concurrency ? 'bg-primary/50' : 'bg-gray-700'}`}></div>
                           {(n === 1 || n === 5 || n === 10 || n === 15 || n === 20) && <span className="text-[9px] text-gray-600 font-mono">{n}</span>}
                        </div>
                     ))}
                  </div>
               </div>
            </div>
            
            {/* Logic Explanation Text */}
            <div className="bg-[#111] p-2 rounded border border-white/5 text-[10px] text-gray-500 leading-tight">
                Total Files: <span className="text-white">{validPromptCount * settings.batchSize}</span>
            </div>

          </section>
        </div>

        {/* Updated Section: Server & Connection Status */}
        <div className="px-6 pb-4">
             {/* Update Banner */}
             {updateAvailable && (
                <div onClick={handleUpdate} className="mb-3 p-3 bg-gradient-to-r from-primary to-purple-800 rounded-lg border border-primary/50 cursor-pointer shadow-[0_0_15px_rgba(109,40,217,0.3)] animate-pulse-slow">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white font-bold text-xs">
                            <DownloadIcon className="w-4 h-4" />
                            <span>发现新版本</span>
                        </div>
                        <span className="text-[9px] bg-black/20 px-1.5 py-0.5 rounded text-white/80 font-mono">v{updateAvailable}</span>
                    </div>
                    <p className="text-[9px] text-white/70 mt-1">点击此处立即刷新更新</p>
                </div>
             )}

             <div className="rounded-xl bg-[#0a0a0a] border border-border p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Cloud Link</span>
                    <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${latency < 100 ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`}></div>
                        <span className={`text-[10px] font-mono ${latency < 100 ? 'text-green-500' : 'text-yellow-500'}`}>CONNECTED</span>
                    </div>
                </div>
                
                {/* Latency & Load Metrics */}
                <div className="space-y-3">
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-500">
                            <span>API Latency</span>
                            <span className="font-mono text-gray-300">{latency} ms</span>
                        </div>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${latency < 80 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(100, latency)}%` }}></div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-500">
                            <span>Cloud Node Load</span>
                            <span className="font-mono text-gray-300">{cloudLoad}%</span>
                        </div>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                             <div className={`h-full transition-all duration-1000 ${cloudLoad > 80 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${cloudLoad}%` }}></div>
                        </div>
                    </div>
                     
                     <div className="flex justify-between text-[10px] pt-1">
                        <span className="text-gray-600">Server Health</span>
                        <div className="flex flex-col items-end">
                            <span className="text-gray-400">99.9% Uptime</span>
                            <span className="text-[9px] text-gray-700 font-mono">v{APP_VERSION}</span>
                        </div>
                     </div>
                </div>
            </div>
        </div>

        {/* Footer: Start Button */}
        <div className="p-6 pt-0 border-t-0 bg-[#080808]">
          <button
            onClick={handleStartBatch}
            disabled={validPromptCount === 0}
            className="w-full group relative flex items-center justify-center gap-2 bg-white text-black font-bold py-3.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 active:scale-95 transition-all overflow-hidden shadow-lg shadow-white/5"
          >
            {isProcessing && <div className="absolute bottom-0 left-0 h-1 bg-green-500 transition-all duration-300 w-full animate-pulse" />}
            <PlayIcon className="w-4 h-4 fill-current" />
            <span>启动批量生成</span>
          </button>
        </div>
      </aside>

      {/* === Main Content: Workspace === */}
      <main ref={mainContainerRef} className="flex-1 flex flex-col min-w-0 bg-[#050505] relative h-full">
        {/* Top: Prompts and Textarea */}
        <div 
            ref={promptPanelRef}
            className="flex bg-[#050505] border-b border-border relative shrink-0"
            style={{ height: promptPanelHeight }}
        >
            <div className="w-64 border-r border-border bg-[#080808] flex flex-col">
                <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-[#0a0a0a] shrink-0">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">提示词列表</span>
                    <button onClick={handleAddPrompt} className="text-gray-500 hover:text-primary transition-colors">
                        <PlusIcon className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {currentPrompts.map((p: PromptItem, idx: number) => (
                        <div 
                            key={p.id}
                            onClick={() => setActivePromptId({ ...activePromptId, [currentMediaType]: p.id })}
                            className={`group flex items-center justify-between px-4 py-3 cursor-pointer text-xs border-b border-white/5 transition-all ${currentActivePromptId === p.id ? 'bg-primary/10 border-l-2 border-l-primary text-white' : 'text-gray-500 hover:bg-white/5 border-l-2 border-l-transparent'}`}
                        >
                            <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                <span className={`text-[9px] font-mono ${currentActivePromptId === p.id ? 'text-primary/70' : 'text-gray-700'}`}>{idx + 1}</span>
                                <span className="truncate font-mono" title={p.text}>
                                    {getPromptSummary(p.text) || <span className="text-gray-600 italic">空提示词</span>}
                                </span>
                            </div>
                            
                            {/* Actions Group - Always Visible */}
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={(e) => handleSingleGenerate(e, p.text)}
                                    className="p-1.5 rounded-md border border-white/5 bg-white/5 text-gray-400 hover:bg-primary hover:text-white hover:border-primary transition-all"
                                    title="单独生成 1 张"
                                >
                                    <PlayIcon className="w-3 h-3 fill-current" />
                                </button>
                                <button 
                                    onClick={(e) => handleDeletePrompt(e, p.id)}
                                    className="p-1.5 rounded-md text-gray-600 hover:text-red-500 hover:bg-white/10 transition-all"
                                >
                                    <XIcon className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col relative bg-[#050505]">
                <div className="h-10 border-b border-border flex items-center px-4 bg-[#0a0a0a] justify-between shrink-0">
                    <span className="text-[10px] text-gray-600 font-mono">ID: {activePrompt.id}</span>
                    <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] text-gray-400 font-mono border border-white/5">Ctrl + Enter</span>
                        <span className="text-[10px] text-gray-600">启动</span>
                    </div>
                </div>
                <textarea
                    ref={textareaRef}
                    value={activePrompt.text}
                    onChange={(e) => handleUpdatePrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            handleStartBatch();
                        }
                    }}
                    placeholder="请输入提示词... (例如：A cinematic shot of a cyberpunk city, neon lights, rain)"
                    className="flex-1 w-full bg-[#050505] p-4 text-sm font-mono text-gray-200 placeholder-gray-800 resize-none focus:outline-none focus:bg-[#080808] transition-colors leading-relaxed custom-scrollbar"
                    spellCheck={false}
                />
            </div>
            
            {/* Improved Resizer Handle */}
            <div 
                className={`absolute bottom-0 left-0 right-0 h-3 -mb-1.5 bg-transparent hover:bg-primary/50 cursor-ns-resize z-50 transition-all group/resizer flex items-center justify-center ${(showSettings || showLogs || showSora2Role) ? 'opacity-0 pointer-events-none' : ''}`}
                onMouseDown={handleResizeMouseDown}
            >
                {/* Visual line */}
                <div className="w-full h-[2px] bg-transparent group-hover/resizer:bg-primary/50 transition-colors"></div>
                {/* Visual Grab Handle (Dots) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/resizer:opacity-100 transition-opacity bg-black/80 px-2 py-0.5 rounded-full border border-white/10">
                    <div className="w-1 h-1 rounded-full bg-white/50"></div>
                    <div className="w-1 h-1 rounded-full bg-white/50"></div>
                    <div className="w-1 h-1 rounded-full bg-white/50"></div>
                </div>
            </div>
        </div>

        {/* Bottom: Job List */}
        <div className="flex-1 flex flex-col min-h-0 bg-black/20 relative">
          <div className="h-12 border-b border-border flex items-center justify-between px-6 bg-[#0a0a0a]/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-6 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-600"></span>
                <span className="text-gray-400">队列: {stats.pending}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${stats.processing > 0 ? 'bg-primary animate-pulse' : 'bg-gray-800'}`}></span>
                <span className={stats.processing > 0 ? 'text-primary' : 'text-gray-600'}>运行中: {stats.processing}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-green-500">完成: {stats.completed}</span>
              </div>
            </div>

            <button 
              onClick={handleClearFinished}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded hover:bg-white/5"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              清空已完成
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden bg-[#050505]">
              <div className={`absolute inset-0 overflow-y-auto p-6 custom-scrollbar transition-opacity duration-300 ${focusedJob ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {currentJobs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-800 opacity-50 select-none">
                    <div className="w-24 h-24 border-2 border-dashed border-gray-800 rounded-2xl mb-4 flex items-center justify-center">
                    <div className="grid grid-cols-2 gap-1 opacity-20">
                        <div className="w-3 h-3 bg-white rounded-sm"></div>
                        <div className="w-3 h-3 bg-white rounded-sm"></div>
                        <div className="w-3 h-3 bg-white rounded-sm"></div>
                        <div className="w-3 h-3 bg-white rounded-sm"></div>
                    </div>
                    </div>
                    <p className="font-mono text-sm">暂无任务 / 空闲中</p>
                </div>
                ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-10">
                    {currentJobs.map((job) => (
                    <JobCard 
                        key={job.id} 
                        job={job} 
                        mediaType={settings.mediaType} 
                        onClick={() => setFocusedJob(job)}
                        onRename={handleRename}
                    />
                    ))}
                </div>
                )}
            </div>

            {focusedJob && (
                <div 
                    className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300"
                    onClick={() => setFocusedJob(null)}
                >
                    <div 
                        className="w-[80%] h-[80%] bg-[#0a0a0a] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex animate-slide-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                         <div className="flex-1 flex flex-col items-center justify-center relative p-0 bg-black/50 overflow-hidden cursor-zoom-out">
                             <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent z-20 flex justify-between items-start pointer-events-none">
                                <div className="pointer-events-auto">
                                    <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">File Name (Click to Rename)</label>
                                    <input 
                                        type="text"
                                        value={focusedJob.fileName || `file_${focusedJob.id}`}
                                        onChange={(e) => handleRename(focusedJob.id, e.target.value)}
                                        className="bg-transparent text-xl font-mono text-white font-bold border-b border-transparent hover:border-white/20 focus:border-primary focus:outline-none transition-all w-[400px]"
                                    />
                                    <p className="text-[10px] text-green-500/80 mt-1 flex items-center gap-1">
                                        <CheckIcon className="w-3 h-3" />
                                        Auto-saved to local disk
                                    </p>
                                </div>
                             </div>

                             {focusedJob.status === JobStatus.COMPLETED && focusedJob.resultUrl ? (
                                settings.mediaType === MediaType.VIDEO ? (
                                    <VideoPlayer src={focusedJob.resultUrl} />
                                ) : (
                                    <img 
                                        src={focusedJob.resultUrl} 
                                        alt="Result" 
                                        className="h-full w-full object-contain" 
                                    />
                                )
                            ) : focusedJob.status === JobStatus.FAILED ? (
                                <div className="flex flex-col items-center justify-center text-red-500 p-8 text-center max-w-lg">
                                    <AlertIcon className="w-16 h-16 mb-4 opacity-50" />
                                    <h3 className="text-xl font-bold mb-2">Generation Failed</h3>
                                    <p className="font-mono text-xs bg-red-500/10 border border-red-500/20 p-4 rounded text-red-300 break-all select-text">
                                        {focusedJob.error || 'Unknown API Error'}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                     {/* Big Spinner for modal view */}
                                     <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-primary animate-spin"></div>
                                     <div className="flex flex-col items-center">
                                         <span className="text-lg font-bold text-white">Generating...</span>
                                         <span className="text-sm font-mono text-primary">{focusedJob.progress || 0}%</span>
                                     </div>
                                </div>
                            )}
                        </div>

                        <div className="w-80 bg-[#0f0f0f] border-l border-white/10 flex flex-col z-10">
                            <div className="h-14 flex items-center justify-between px-6 border-b border-white/5">
                                <span className="text-sm font-bold text-gray-200">任务详情</span>
                                <button onClick={() => setFocusedJob(null)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors">
                                    <XIcon className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                                 <div className="space-y-2">
                                    <label className="text-[10px] uppercase text-gray-600 font-bold tracking-widest">状态</label>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${focusedJob.status === JobStatus.COMPLETED ? 'bg-green-500' : focusedJob.status === JobStatus.FAILED ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                                        <span className={`text-sm font-medium ${focusedJob.status === JobStatus.COMPLETED ? 'text-white' : focusedJob.status === JobStatus.FAILED ? 'text-red-500' : 'text-yellow-500'}`}>
                                            {focusedJob.status === JobStatus.COMPLETED ? '生成完成' : focusedJob.status === JobStatus.FAILED ? '失败' : `处理中 ${focusedJob.progress || 0}%`}
                                        </span>
                                    </div>
                                    {focusedJob.status === JobStatus.PROCESSING && (
                                        <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                                            <div 
                                                className="h-full bg-primary transition-all duration-300" 
                                                style={{ width: `${focusedJob.progress || 0}%` }}
                                            />
                                        </div>
                                    )}
                                 </div>

                                 <div className="space-y-2">
                                    <label className="text-[10px] uppercase text-gray-600 font-bold tracking-widest">任务 ID</label>
                                    <div className="font-mono text-xs text-gray-400 select-all">{focusedJob.id}</div>
                                 </div>
                                 
                                 <div className="space-y-2">
                                    <label className="text-[10px] uppercase text-gray-600 font-bold tracking-widest">存储路径 (本地)</label>
                                    <div className="font-mono text-xs text-gray-500 select-all truncate mb-2">
                                        ./{settings.mediaType === MediaType.VIDEO ? 'Video' : 'Image'}/{focusedJob.fileName || '...'}
                                    </div>
                                    {focusedJob.status === JobStatus.COMPLETED && (
                                        <button 
                                            onClick={handleOpenFolder}
                                            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 text-gray-300 hover:text-white py-2 rounded transition-all text-xs font-medium"
                                        >
                                            <FolderIcon className="w-3.5 h-3.5" />
                                            打开所在文件夹
                                        </button>
                                    )}
                                 </div>

                                 <div className="space-y-2">
                                    <label className="text-[10px] uppercase text-gray-600 font-bold tracking-widest">完整提示词</label>
                                    <div className="text-sm text-gray-300 leading-relaxed font-mono bg-[#161616] p-4 rounded-lg border border-white/5 select-text h-40 overflow-y-auto custom-scrollbar">
                                        {focusedJob.prompt}
                                    </div>
                                 </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}

export default App;