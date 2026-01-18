import { invoke } from '@tauri-apps/api/core';

/**
 * Sound notification service for MatrixGen Pro
 * Provides system sound notifications for various events
 */
export class SoundService {
  private static instance: SoundService;
  private audioContext: AudioContext | null = null;
  private isEnabled: boolean = true;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastPlayTime: number = 0;

  private constructor() {}

  static getInstance(): SoundService {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }

  /**
   * Enable or disable sound notifications
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  /**
   * Debounced play function to prevent spam in multi-job completions
   * Prevents playing sounds within 3 seconds of the last play
   */
  private debouncedPlay(playFn: () => Promise<void>): void {
    const now = Date.now();
    const timeSinceLastPlay = now - this.lastPlayTime;

    // If still within 3-second cooldown period, ignore this request
    if (timeSinceLastPlay < 3000) {
      console.log(`[SoundService] Sound request ignored (cooldown: ${3000 - timeSinceLastPlay}ms remaining)`);
      return;
    }

    // Update last play time and play immediately
    this.lastPlayTime = now;
    playFn().catch(error => {
      console.warn('[SoundService] Failed to play sound:', error);
    });
  }

  /**
   * Check if sound notifications are enabled
   */
  isSoundEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Play a completion sound when a job finishes
   */
  async playJobComplete(): Promise<void> {
    if (!this.isEnabled) return;

    this.debouncedPlay(async () => {
      try {
        // Use Windows system sound for success/completion
        await invoke('execute_powershell_command', {
          command: 'powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\notify.wav\').PlaySync();"'
        });
      } catch (error) {
        console.warn('[SoundService] Failed to play job complete sound:', error);
        // Fallback to Web Audio API if PowerShell fails
        this.fallbackBeep();
      }
    });
  }

  /**
   * Play a success sound
   */
  async playSuccess(): Promise<void> {
    if (!this.isEnabled) return;

    this.debouncedPlay(async () => {
      try {
        await invoke('execute_powershell_command', {
          command: 'powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\notify.wav\').PlaySync();"'
        });
      } catch (error) {
        console.warn('[SoundService] Failed to play success sound:', error);
        this.fallbackBeep();
      }
    });
  }

  /**
   * Play an error sound
   */
  async playError(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await invoke('execute_powershell_command', {
        command: 'powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Windows Error.wav\').PlaySync();"'
      });
    } catch (error) {
      console.warn('[SoundService] Failed to play error sound:', error);
      this.fallbackErrorBeep();
    }
  }

  /**
   * Play a warning sound
   */
  async playWarning(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await invoke('execute_powershell_command', {
        command: 'powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Windows Exclamation.wav\').PlaySync();"'
      });
    } catch (error) {
      console.warn('[SoundService] Failed to play warning sound:', error);
      this.fallbackBeep();
    }
  }

  /**
   * Initialize Web Audio API for fallback sounds
   */
  private async initAudioContext(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Fallback beep sound using Web Audio API
   */
  private async fallbackBeep(): Promise<void> {
    try {
      await this.initAudioContext();
      if (!this.audioContext) return;

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('[SoundService] Fallback beep failed:', error);
    }
  }

  /**
   * Fallback error beep sound using Web Audio API
   */
  private async fallbackErrorBeep(): Promise<void> {
    try {
      await this.initAudioContext();
      if (!this.audioContext) return;

      // Play a lower tone for errors
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
      oscillator.type = 'sawtooth';

      gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('[SoundService] Fallback error beep failed:', error);
    }
  }
}

// Export singleton instance
export const soundService = SoundService.getInstance();