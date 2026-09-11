import type { z } from 'zod';
import type { ClientMessage, ServerMessage } from './messages';
import { ClientMessageSchema, ServerMessageSchema } from './schemas';

export interface MessageCodec<T> {
  encode(message: T): string;
  decode(raw: string): T | null;
}

export function createJsonCodec<T>(schema: z.ZodType<T>): MessageCodec<T> {
  return {
    encode(message) {
      return JSON.stringify(message);
    },
    decode(raw) {
      // Une trame réseau est hostile par défaut: le décodage renvoie null au lieu de lever.
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        return null;
      }
      const result = schema.safeParse(value);
      return result.success ? result.data : null;
    },
  };
}

export const clientMessageCodec: MessageCodec<ClientMessage> = createJsonCodec(ClientMessageSchema);
export const serverMessageCodec: MessageCodec<ServerMessage> = createJsonCodec(ServerMessageSchema);
