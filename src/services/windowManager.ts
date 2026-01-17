import { invoke } from '@tauri-apps/api/core';
import { logger } from './logger';

export const toggleLogWindow = async () => {
  logger.info('[WindowManager] toggleLogWindow function called');

  try {
    logger.info('[WindowManager] Creating log monitor window via Rust command...');
    await invoke('create_log_monitor_window');
    logger.info('[WindowManager] Log monitor window creation command sent');
  } catch (error) {
    logger.error('[WindowManager] Failed to create log monitor window:', error);
  }
};