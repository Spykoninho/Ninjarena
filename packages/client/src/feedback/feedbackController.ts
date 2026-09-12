import type { Vec2, WorldEvent } from '@ninjarena/core';
import type { AudioPort } from '../audio/audioPort';
import type { Renderer } from '../rendering/renderer';
import { CameraShake } from './cameraShake';
import type { FeedbackView } from './cues';
import { cuesForEvent } from './cues';
import { HitStop } from './hitStop';

export interface FeedbackDeps {
  renderer: Renderer;
  audio: AudioPort;
}

export interface FeedbackPulse {
  frozen: boolean;
  shake: Vec2;
}

// Le contrôleur traduit les événements en retours sensoriels: le jeu ne sait rien des particules.
export class FeedbackController {
  private readonly deps: FeedbackDeps;
  private readonly shake = new CameraShake();
  private readonly hitStop = new HitStop();

  constructor(deps: FeedbackDeps) {
    this.deps = deps;
  }

  apply(events: readonly WorldEvent[], view: FeedbackView): void {
    for (const event of events) {
      const cue = cuesForEvent(event, view);
      for (const visual of cue.visual) this.deps.renderer.showCue(visual);
      if (cue.audio !== null) this.deps.audio.play(cue.audio);
      if (cue.shake > 0) this.shake.add(cue.shake);
      if (cue.hitStopMs > 0) this.hitStop.trigger(cue.hitStopMs);
    }
  }

  advance(dtMs: number): FeedbackPulse {
    const frozen = this.hitStop.advance(dtMs);
    const shake = this.shake.advance(dtMs);
    this.deps.renderer.setShake(shake);
    return { frozen, shake };
  }
}
