export interface AudioPort {
  play(cue: string): void;
}

// Le son n'est pas encore implémenté: le port existe pour que le jeu n'ait rien à changer ensuite.
export class NullAudio implements AudioPort {
  play(): void {}
}
