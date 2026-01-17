import { invoke } from '@tauri-apps/api/core';
import { AIPlugin, PluginManifest } from '../types/plugin';

/**
 * Load external plugins from the plugins directory
 * @returns Array of validated AIPlugin objects
 */
export async function loadExternalPlugins(): Promise<AIPlugin[]> {
  try {
    console.log('[PluginLoader] Loading external plugins...');

    // Call Rust command to get raw plugin file contents
    const pluginContents: string[] = await invoke('load_plugins_raw');

    console.log(`[PluginLoader] Found ${pluginContents.length} plugin files`);

    const loadedPlugins: AIPlugin[] = [];

    for (const script of pluginContents) {
      try {
        // Safely evaluate the JavaScript code
        // Using new Function to create an isolated scope
        const pluginFactory = new Function(script + '; return plugin;');
        const loadedPlugin = pluginFactory();

        // Validate the plugin structure
        if (isValidAIPlugin(loadedPlugin)) {
          console.log(`[PluginLoader] Successfully loaded plugin: ${loadedPlugin.manifest.id}`);
          loadedPlugins.push(loadedPlugin);
        } else {
          console.warn('[PluginLoader] Invalid plugin structure, skipping:', loadedPlugin);
        }
      } catch (error) {
        console.error('[PluginLoader] Failed to load plugin:', error);
      }
    }

    console.log(`[PluginLoader] Successfully loaded ${loadedPlugins.length} plugins`);
    return loadedPlugins;
  } catch (error) {
    console.error('[PluginLoader] Failed to load external plugins:', error);
    return [];
  }
}

/**
 * Validate that an object conforms to the AIPlugin interface
 */
function isValidAIPlugin(obj: any): obj is AIPlugin {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // Check manifest
  if (!obj.manifest || typeof obj.manifest !== 'object') {
    return false;
  }

  const manifest = obj.manifest as PluginManifest;
  if (!manifest.id || typeof manifest.id !== 'string') {
    return false;
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    return false;
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    return false;
  }
  if (!manifest.description || typeof manifest.description !== 'string') {
    return false;
  }

  // Check required methods
  if (typeof obj.createRequest !== 'function') {
    return false;
  }
  if (typeof obj.parseTaskResponse !== 'function') {
    return false;
  }
  if (typeof obj.createStatusRequest !== 'function') {
    return false;
  }
  if (typeof obj.parseVideoUrl !== 'function') {
    return false;
  }

  return true;
}