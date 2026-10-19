/**
 * A message for the trip screen to show once when it's next in front ("Day 2 was
 * re-planned" after the must-dos are saved on their own screen).
 */

const messages = new Map<number, string>();

export function setFlash(tripId: number, message: string): void {
  messages.set(tripId, message);
}

export function takeFlash(tripId: number): string | null {
  const m = messages.get(tripId) ?? null;
  messages.delete(tripId);
  return m;
}
