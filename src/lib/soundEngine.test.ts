import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUND_PROFILES,
  SOUND_STORAGE_KEY,
  playFeedbackSound,
  readSoundPreference,
  writeSoundPreference,
  type FeedbackSoundKind,
} from './soundEngine';

test('SOUND_PROFILES defines valid positive frequencies and durations for every feedback kind', () => {
  const kinds: FeedbackSoundKind[] = [
    'sale',
    'payment',
    'save',
    'delete',
    'export',
    'warning',
    'error',
    'toggle',
  ];
  for (const kind of kinds) {
    const steps = SOUND_PROFILES[kind];
    assert.ok(Array.isArray(steps) && steps.length >= 1, `missing sound profile for ${kind}`);
    for (const step of steps) {
      assert.ok(step.frequency > 50 && step.frequency < 5000);
      assert.ok(step.durationSec > 0 && step.durationSec <= 0.5);
      assert.ok(step.gain > 0 && step.gain <= 0.2);
    }
  }
});

test('readSoundPreference defaults to enabled and persists mute/unmute state', () => {
  const map = new Map<string, string>();
  const memoryStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };

  assert.equal(readSoundPreference(memoryStorage), true);

  writeSoundPreference(false, memoryStorage);
  assert.equal(map.get(SOUND_STORAGE_KEY), '0');
  assert.equal(readSoundPreference(memoryStorage), false);

  writeSoundPreference(true, memoryStorage);
  assert.equal(map.get(SOUND_STORAGE_KEY), '1');
  assert.equal(readSoundPreference(memoryStorage), true);
});

test('playFeedbackSound safely no-ops when muted or when AudioContext is unavailable in Node', () => {
  assert.equal(playFeedbackSound('sale', false), false);
  assert.equal(playFeedbackSound('sale', true), false);
});
