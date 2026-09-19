import type { ClientSession } from '../session/clientSession';

export interface MatchmakerOptions {
  now: () => number;
  onMatch: (one: ClientSession, two: ClientSession) => void;
}

export type QueueErrorCode = 'NOT_LOGGED_IN' | 'ALREADY_IN_ROOM';

export type QueueResult =
  { ok: true } | { ok: false; error: { code: QueueErrorCode; message: string } };

interface Ticket {
  session: ClientSession;
  rating: number;
  since: number;
}

const MATCH_INTERVAL_MS = 1000;
// Deux joueurs s'apparient à 50 points d'écart, puis l'écart toléré grandit de 10 points par seconde d'attente.
const BASE_RATING_GAP = 50;
const GAP_PER_SECOND = 10;
const MS_PER_SECOND = 1000;

// La file classée: des comptes en attente, appariés par score au fil du temps.
export class Matchmaker {
  private readonly now: () => number;
  private readonly onMatch: (one: ClientSession, two: ClientSession) => void;
  private readonly tickets: Ticket[] = [];
  private lastMatchAt: number | null = null;

  constructor(options: MatchmakerOptions) {
    this.now = options.now;
    this.onMatch = options.onMatch;
  }

  get size(): number {
    return this.tickets.length;
  }

  sessions(): ClientSession[] {
    return this.tickets.map((ticket) => ticket.session);
  }

  has(session: ClientSession): boolean {
    return this.tickets.some((ticket) => ticket.session === session);
  }

  join(session: ClientSession): QueueResult {
    if (session.account === null) {
      return fail('NOT_LOGGED_IN', 'the ranked queue needs an account');
    }
    if (session.room !== null) return fail('ALREADY_IN_ROOM', 'leave the room first');
    // Une entrée répétée garde son rang: le temps d'attente n'est pas remis à zéro.
    if (this.has(session)) return { ok: true };
    this.tickets.push({ session, rating: session.account.rating, since: this.now() });
    return { ok: true };
  }

  leave(session: ClientSession): boolean {
    const index = this.tickets.findIndex((ticket) => ticket.session === session);
    if (index === -1) return false;
    this.tickets.splice(index, 1);
    return true;
  }

  // Appelé à chaque tick du serveur; l'appariement lui-même ne tourne qu'une fois par seconde.
  tick(): void {
    const now = this.now();
    if (this.lastMatchAt !== null && now - this.lastMatchAt < MATCH_INTERVAL_MS) return;
    this.lastMatchAt = now;
    for (const [one, two] of this.pairs(now)) {
      this.leave(one.session);
      this.leave(two.session);
      this.onMatch(one.session, two.session);
    }
  }

  private pairs(now: number): [Ticket, Ticket][] {
    const sorted = [...this.tickets].sort((a, b) => a.rating - b.rating || a.since - b.since);
    const pairs: [Ticket, Ticket][] = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const one = sorted[i];
      const two = sorted[i + 1];
      if (one === undefined || two === undefined) continue;
      if (Math.abs(one.rating - two.rating) > allowedGap(now, one, two)) continue;
      pairs.push([one, two]);
      i += 1;
    }
    return pairs;
  }
}

// L'écart accepté suit le joueur qui attend depuis le plus longtemps.
function allowedGap(now: number, one: Ticket, two: Ticket): number {
  const waitedMs = Math.max(0, now - Math.min(one.since, two.since));
  return BASE_RATING_GAP + (GAP_PER_SECOND * waitedMs) / MS_PER_SECOND;
}

function fail(code: QueueErrorCode, message: string): QueueResult {
  return { ok: false, error: { code, message } };
}
