import { invoke } from '@tauri-apps/api/core';
import type { AIPlugin } from '../types/plugin';

/**
 * Loads external JavaScript plugins from the plugins directory.
 * Each plugin is a JavaScript file that exports an AIPlugin object.
 *
 * Plugins are loaded by evaluating the script content using new Function(),
 * which is safe in this desktop app context since plugins are user-provided.
 */
export async function loadExternalPlugins(): Promise<AIPlugin[]> {
  try {
    console.log('[PluginLoader] Loading external plugins...');

    // Call the Rust command to get raw plugin contents
    const pluginScripts: string[] = await invoke('load_plugins_raw');
    console.log(`[PluginLoader] Found ${pluginScripts.length} plugin files`);

    const loadedPlugins: AIPlugin[] = [];

    for (const script of pluginScripts) {
      try {
        // Use new Function to create a plugin instance safely
        // The script should define a variable called 'plugin' and return it
        const plugin = new Function(`${script}; return plugin;`)();

        // Validate that the loaded object matches the AIPlugin interface
        if (isValidAIPlugin(plugin)) {
          console.log(`[PluginLoader] Loaded plugin: ${plugin.manifest.name} (${plugin.manifest.id})`);
          loadedPlugins.push(plugin);
        } else {
          console.warn('[PluginLoader] Invalid plugin structure, skipping:', plugin);
        }
      } catch (error) {
        console.error('[PluginLoader] Failed to load plugin script:', error);
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
 * Validates that an object conforms to the AIPlugin interface.
 */
function isValidAIPlugin(obj: any): obj is AIPlugin {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.manifest &&
    typeof obj.manifest === 'object' &&
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