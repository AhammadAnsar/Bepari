export type FeedbackSoundKind =
  | 'sale'
  | 'payment'
  | 'save'
  | 'delete'
  | 'export'
  | 'warning'
  | 'error'
  | 'toggle';

export interface SoundToneStep {
  frequency: number;
  startOffsetSec: number;
  durationSec: number;
  gain: number;
  type: OscillatorType;
}

export const SOUND_STORAGE_KEY = 'bepari_sound_enabled';

/**
 * Pure acoustic tone profiles mapped to business workflow events.
 * Designed to feel crisp, restrained, and pleasant like a crafted desktop ERP.
 */
export const SOUND_PROFILES: Record<FeedbackSoundKind, SoundToneStep[]> = {
  // Crisp warm register triad (C5 -> E5 -> G5)
  sale: [
    { frequency: 523.25, startOffsetSec: 0, durationSec: 0.09, gain: 0.075, type: 'triangle' },
    { frequency: 659.25, startOffsetSec: 0.065, durationSec: 0.1, gain: 0.08, type: 'triangle' },
    { frequency: 783.99, startOffsetSec: 0.13, durationSec: 0.22, gain: 0.09, type: 'sine' },
  ],
  // Bright dual chime for payment collected (D5 -> A5)
  payment: [
    { frequency: 587.33, startOffsetSec: 0, durationSec: 0.1, gain: 0.07, type: 'sine' },
    { frequency: 880.0, startOffsetSec: 0.08, durationSec: 0.2, gain: 0.085, type: 'triangle' },
  ],
  // Gentle rising two-note confirmation ping (E5 -> G5)
  save: [
    { frequency: 659.25, startOffsetSec: 0, durationSec: 0.075, gain: 0.055, type: 'sine' },
    { frequency: 783.99, startOffsetSec: 0.065, durationSec: 0.13, gain: 0.065, type: 'sine' },
  ],
  // Soft muted descending wooden thud
  delete: [
    { frequency: 330.0, startOffsetSec: 0, durationSec: 0.075, gain: 0.06, type: 'triangle' },
    { frequency: 220.0, startOffsetSec: 0.065, durationSec: 0.13, gain: 0.055, type: 'sine' },
  ],
  // Tactile clean click-chime for PDF download / print
  export: [
    { frequency: 740.0, startOffsetSec: 0, durationSec: 0.06, gain: 0.05, type: 'sine' },
    { frequency: 987.77, startOffsetSec: 0.05, durationSec: 0.11, gain: 0.055, type: 'sine' },
  ],
  // Subtle attention double pulse
  warning: [
    { frequency: 440.0, startOffsetSec: 0, durationSec: 0.09, gain: 0.055, type: 'triangle' },
    { frequency: 440.0, startOffsetSec: 0.12, durationSec: 0.11, gain: 0.05, type: 'triangle' },
  ],
  // Low gentle error tone
  error: [
    { frequency: 246.94, startOffsetSec: 0, durationSec: 0.11, gain: 0.07, type: 'sawtooth' },
    { frequency: 196.0, startOffsetSec: 0.1, durationSec: 0.18, gain: 0.06, type: 'triangle' },
  ],
  // Soft single chirp when unmuting sound
  toggle: [
    { frequency: 698.46, startOffsetSec: 0, durationSec: 0.08, gain: 0.05, type: 'sine' },
  ],
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readSoundPreference(storage?: StorageLike | null): boolean {
  try {
    const store = storage !== undefined ? storage : typeof window !== 'undefined' ? window.localStorage : null;
    if (!store) return true;
    const raw = store.getItem(SOUND_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeSoundPreference(enabled: boolean, storage?: StorageLike | null): void {
  try {
    const store = storage !== undefined ? storage : typeof window !== 'undefined' ? window.localStorage : null;
    if (!store) return;
    store.setItem(SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage quota or sandbox errors cleanly
  }
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtor();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Synthesizes a subtle, zero-latency feedback sound via Web Audio API.
 * Never throws in headless browsers, Node tests, or autoplay-blocked environments.
 */
export function playFeedbackSound(kind: FeedbackSoundKind, enabled: boolean): boolean {
  if (!enabled) return false;
  const profile = SOUND_PROFILES[kind];
  if (!profile || profile.length === 0) return false;

  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    const now = ctx.currentTime;
    for (const step of profile) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = step.type;
      osc.frequency.setValueAtTime(step.frequency, now + step.startOffsetSec);

      const start = now + step.startOffsetSec;
      const attackEnd = start + Math.min(0.015, step.durationSec * 0.25);
      const end = start + step.durationSec;

      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.exponentialRampToValueAtTime(step.gain, attackEnd);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}
