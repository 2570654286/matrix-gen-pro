// Pleasant success sound using Web Audio API
export class SoundManager {
  private static instance: SoundManager;
  private muted: boolean = false;
  private audioContext: AudioContext | null = null;

  private constructor() {
    this.muted = localStorage.getItem('soundMuted') === 'true';
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private async initAudioContext(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async playSuccess(): Promise<void> {
    if (this.muted) return;

    try {
      await this.initAudioContext();
      if (!this.audioContext) return;

      // Create a pleasant success chime sequence (ascending major chord)
      const notes = [
        { freq: 523.25, duration: 0.15 }, // C5
        { freq: 659.25, duration: 0.15 }, // E5
        { freq: 783.99, duration: 0.4 }   // G5
      ];

      let startTime = this.audioContext.currentTime;

      notes.forEach(note => {
        const oscillator = this.audioContext!.createOscillator();
        const gainNode = this.audioContext!.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext!.destination);

        oscillator.frequency.setValueAtTime(note.freq, startTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + note.duration);

        startTime += note.duration + 0.08; // Small gap between notes
      });

    } catch (error) {
      console.warn('Failed to play success sound:', error);
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
    localStorage.setItem('soundMuted', this.muted.toString());
  }

  isMuted(): boolean {
    return this.muted;
  }
}

export const soundManager = SoundManager.getInstance();