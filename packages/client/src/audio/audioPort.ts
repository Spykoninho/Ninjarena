export interface AudioPort {
  play(cue: string): void;
}

// Double de test : le jeu tourne sans contexte audio.
export class NullAudio implements AudioPort {
  play(): void {}
}
