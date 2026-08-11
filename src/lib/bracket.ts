import type { Match, Player } from "./tournament-types";

const uid = () => crypto.randomUUID();

function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function seedOrder(count: number): number[] {
  const bits = Math.max(0, Math.round(Math.log2(Math.max(1, count))));
  return Array.from({ length: count }, (_, index) => {
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      if (index & (1 << bit)) reversed |= 1 << (bits - 1 - bit);
    }
    return { index, reversed };
  })
    .sort((a, b) => a.reversed - b.reversed)
    .map(({ index }) => index);
}

function blankMatch(round: number, index: number): Match {
  return {
    id: uid(),
    round,
    index,
    p1: null,
    p2: null,
    score1: 0,
    score2: 0,
    status: "waiting",
    table: null,
    winner: null,
    events: [],
    nextMatchId: null,
    nextSlot: null,
    kind: "main",
    loserNextMatchId: null,
    loserNextSlot: null,
  };
}

/** Builds a complete draw without dropping non-power-of-two entrants. */
export function buildBracket(players: Player[], random = Math.random): Match[] {
  if (players.length < 2) return [];
  const order = shuffle(players, random);
  let mainDrawSize = 1;
  while (mainDrawSize * 2 <= order.length) mainDrawSize *= 2;
  const playInCount = order.length - mainDrawSize;
  const roundOffset = playInCount > 0 ? 1 : 0;

  const rounds: Match[][] = [];
  for (let round = 0; round < Math.log2(mainDrawSize); round += 1) {
    const count = mainDrawSize / 2 ** (round + 1);
    rounds.push(
      Array.from({ length: count }, (_, index) => blankMatch(round + roundOffset, index)),
    );
  }
  for (let round = 0; round < rounds.length - 1; round += 1) {
    rounds[round].forEach((match, index) => {
      match.nextMatchId = rounds[round + 1][Math.floor(index / 2)].id;
      match.nextSlot = index % 2 === 0 ? 1 : 2;
    });
  }

  const firstRound = rounds[0];
  const spread = seedOrder(firstRound.length);
  const seats: { match: Match; slot: 1 | 2 }[] = [];
  for (const slot of [1, 2] as const) {
    for (const index of spread) seats.push({ match: firstRound[index], slot });
  }
  const reservedSeats = seats.slice(0, playInCount);
  const preliminary = reservedSeats.map((seat, index) => {
    const match = blankMatch(0, index);
    match.nextMatchId = seat.match.id;
    match.nextSlot = seat.slot;
    return match;
  });

  let nextPlayer = 0;
  for (const match of preliminary) {
    match.p1 = order[nextPlayer++]?.id ?? null;
    match.p2 = order[nextPlayer++]?.id ?? null;
    match.status = match.p1 && match.p2 ? "ready" : "waiting";
  }
  const reservedKeys = new Set(reservedSeats.map(({ match, slot }) => `${match.id}:${slot}`));
  for (const index of spread) {
    const match = firstRound[index];
    for (const slot of [1, 2] as const) {
      if (reservedKeys.has(`${match.id}:${slot}`)) continue;
      const playerId = order[nextPlayer++]?.id ?? null;
      if (slot === 1) match.p1 = playerId;
      else match.p2 = playerId;
    }
  }
  for (const match of firstRound) if (match.p1 && match.p2) match.status = "ready";

  const thirdPlace: Match[] = [];
  if (rounds.length >= 2) {
    const semifinals = rounds[rounds.length - 2];
    const bronze = blankMatch(rounds[rounds.length - 1][0].round, 1);
    bronze.kind = "third";
    thirdPlace.push(bronze);
    semifinals.forEach((match, index) => {
      match.loserNextMatchId = bronze.id;
      match.loserNextSlot = index === 0 ? 1 : 2;
    });
  }

  return [...preliminary, ...rounds.flat(), ...thirdPlace];
}
