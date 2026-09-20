import type { ServerErrorCode } from '@ninjarena/protocol';

// Le serveur parle en codes et en anglais: le joueur lit une phrase en français.
const ERROR_TEXTS: Record<ServerErrorCode, string> = {
  PROTOCOL_VERSION: 'Le jeu n’est pas à la même version que le serveur, recharge la page',
  INVALID_MESSAGE: 'Message refusé par le serveur',
  NOT_INTRODUCED: 'Session invalide, recharge la page',
  NOT_IN_ROOM: 'Tu n’es dans aucune salle',
  ALREADY_IN_ROOM: 'Tu es déjà dans une salle',
  ROOM_NOT_FOUND: 'Aucune salle ne porte ce code',
  ROOM_FULL: 'La salle est pleine',
  WRONG_PASSWORD: 'Mot de passe incorrect',
  ROOM_IN_GAME: 'La partie a déjà commencé dans cette salle',
  TOO_MANY_ROOMS: 'Le serveur est plein, réessaie plus tard',
  NOT_HOST: 'Seul l’hôte peut faire ça',
  WRONG_STATUS: 'Impossible à ce moment de la partie',
  INVALID_SETTINGS: 'Réglages refusés par le serveur',
  INVALID_LOADOUT: 'Équipement refusé par le serveur',
  TEAM_FULL: 'Cette équipe est pleine',
  CANNOT_START: 'La partie ne peut pas encore être lancée',
  INVALID_MAP: 'Carte refusée par le serveur',
  MAP_NOT_FOUND: 'Carte introuvable sur le serveur',
  MAP_STORE_FULL: 'Le serveur ne peut plus enregistrer de carte',
  MAP_READONLY: 'Une carte intégrée ne peut pas être supprimée',
  NAME_TAKEN: 'Ce pseudo est déjà pris',
  BAD_CREDENTIALS: 'Pseudo ou mot de passe incorrect',
  ALREADY_LOGGED_IN: 'Ce compte est déjà connecté',
  NOT_LOGGED_IN: 'Connecte-toi à un compte pour jouer en classé',
  SERVER_ERROR: 'Erreur du serveur',
};

// Une carte refusée dit pourquoi dans la langue de la validation: le détail reste utile à l'auteur.
export function serverErrorText(code: ServerErrorCode, message: string): string {
  const text = ERROR_TEXTS[code];
  return code === 'INVALID_MAP' && message.length > 0 ? `${text} : ${message}` : text;
}
