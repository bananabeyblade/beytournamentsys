type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Keeps exact Combo snapshots out of the public spectator payload during an event. */
export function sanitizePublicLiveState(liveState: unknown): unknown {
  if (!isRecord(liveState) || !Array.isArray(liveState.matches)) return liveState;
  return {
    ...liveState,
    matches: liveState.matches.map((match) => {
      if (!isRecord(match) || !Array.isArray(match.events)) return match;
      return {
        ...match,
        events: match.events.map((event) => {
          if (!isRecord(event)) return event;
          const publicEvent = { ...event };
          delete publicEvent.combo1Snapshot;
          delete publicEvent.combo2Snapshot;
          return publicEvent;
        }),
      };
    }),
  };
}
