import type { AudioPort } from './audioPort';

interface Envelope {
  wave: OscillatorType;
  fromHz: number;
  toHz: number;
  durationMs: number;
  gain: number;
}

const ENVELOPES: Record<string, Envelope> = {
  ability: { wave: 'triangle', fromHz: 420, toHz: 760, durationMs: 110, gain: 0.16 },
  hit: { wave: 'square', fromHz: 320, toHz: 110, durationMs: 90, gain: 0.2 },
  impact: { wave: 'sawtooth', fromHz: 220, toHz: 70, durationMs: 120, gain: 0.14 },
  dash: { wave: 'sine', fromHz: 660, toHz: 240, durationMs: 130, gain: 0.14 },
  death: { wave: 'sawtooth', fromHz: 300, toHz: 60, durationMs: 320, gain: 0.22 },
  'round-start': { wave: 'square', fromHz: 520, toHz: 880, durationMs: 220, gain: 0.16 },
  'round-end': { wave: 'triangle', fromHz: 520, toHz: 180, durationMs: 320, gain: 0.18 },
};

const ATTACK_MS = 8;
const MIN_GAIN = 0.0001;

// Aucune ressource à charger: chaque signal est une courte enveloppe d'oscillateur.
export class WebAudioSynth implements AudioPort {
  private context: AudioContext | null = null;

  play(cue: string): void {
    const envelope = ENVELOPES[cue];
    if (envelope === undefined) return;
    const context = this.ensureContext();
    if (context === null) return;
    try {
      const now = context.currentTime;
      const end = now + envelope.durationMs / 1000;
      const oscillator = context.createOscillator();
      oscillator.type = envelope.wave;
      oscillator.frequency.setValueAtTime(envelope.fromHz, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, envelope.toHz), end);
      const gain = context.createGain();
      gain.gain.setValueAtTime(MIN_GAIN, now);
      gain.gain.linearRampToValueAtTime(envelope.gain, now + ATTACK_MS / 1000);
      gain.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(end);
    } catch {
      // Un navigateur qui refuse l'audio ne doit pas interrompre la partie.
    }
  }

  private ensureContext(): AudioContext | null {
    try {
      this.context ??= new AudioContext();
      // Le contexte reste suspendu jusqu'au premier geste: la reprise est tentée à chaque signal.
      if (this.context.state === 'suspended') {
        this.context.resume().catch(() => undefined);
      }
      return this.context;
    } catch {
      return null;
    }
  }
}
