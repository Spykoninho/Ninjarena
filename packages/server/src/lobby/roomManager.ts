import type { Room } from './room';

export class RoomManager {
  private readonly factory: () => Room;
  private defaultRoom: Room | null = null;

  constructor(factory: () => Room) {
    this.factory = factory;
  }

  getOrCreateDefault(): Room {
    this.defaultRoom ??= this.factory();
    return this.defaultRoom;
  }
}
