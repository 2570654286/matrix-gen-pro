import { invoke } from '@tauri-apps/api/core';
import type { AIPlugin } from '../types/plugin';

// 验证插件对象是否符合 AIPlugin 接口
function validatePlugin(obj: any): obj is AIPlugin {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.manifest &&
    typeof obj.manifest.id === 'string' &&
    typeof obj.manifest.name === 'string' &&
    typeof obj.manifest.version === 'string' &&
    typeof obj.manifest.description === 'string' &&
    typeof obj.createRequest === 'function' &&
    typeof obj.parseTaskResponse === 'function' &&
    typeof obj.createStatusRequest === 'function' &&
    typeof obj.parseVideoUrl === 'function'
  );
}

// 加载外部插件
export async function loadExternalPlugins(): Promise<AIPlugin[]> {
  try {
    // 调用 Rust 命令获取插件文件内容
    const pluginScripts: string[] = await invoke('load_plugins_raw');

    const plugins: AIPlugin[] = [];

    for (const script of pluginScripts) {
      try {
        // 使用 new Function 安全地执行插件代码
        // 插件代码应该以 'const plugin = {...};' 或类似方式定义插件对象
        // 然后通过 'return plugin;' 返回
        const pluginFactory = new Function(script + '; return plugin;');
        const pluginInstance = pluginFactory();

        // 验证插件是否符合接口
        if (validatePlugin(pluginInstance)) {
          console.log(`[PluginLoader] Loaded plugin: ${pluginInstance.manifest.name} (${pluginInstance.manifest.id})`);
          plugins.push(pluginInstance);
        } else {
          console.warn('[PluginLoader] Plugin validation failed:', pluginInstance);
        }
      } catch (error) {
        console.error('[PluginLoader] Failed to load plugin:', error);
      }
    }

    return plugins;
  } catch (error) {
    console.error('[PluginLoader] Failed to load external plugins:', error);
    return [];
  }
}