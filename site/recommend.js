// Recommendation logic: which owned games fit a group and a time budget.

// How the BGG community rates a game at one player count.
export const FIT = {
  BEST: "best",
  RECOMMENDED: "recommended",
  NOT_RECOMMENDED: "not",
  UNKNOWN: "unknown", // too few poll votes to say
};

const MIN_VOTES = 3;

// Poll votes for exactly `players`. BGG lists counts above the maximum as "N+",
// which never matches here because games are only considered within their range.
export function pollVotes(game, players) {
  return (game.playerPoll || {})[String(players)] || null;
}

export function playerFit(game, players) {
  const v = pollVotes(game, players);
  const total = v ? v.best + v.rec + v.not : 0;
  if (total < MIN_VOTES) return FIT.UNKNOWN;
  // A majority voting "Not Recommended" rules the count out, even if the box allows it.
  if (v.not > total / 2) return FIT.NOT_RECOMMENDED;
  if (v.best >= v.rec && v.best >= v.not) return FIT.BEST;
  return FIT.RECOMMENDED;
}

// 0..1: how enthusiastic voters are about this player count.
export function fitScore(game, players) {
  const v = pollVotes(game, players);
  const total = v ? v.best + v.rec + v.not : 0;
  if (total < MIN_VOTES) return 0.4;
  return (v.best + 0.5 * v.rec) / total;
}

export function supportsPlayers(game, players) {
  return game.minPlayers != null && game.maxPlayers != null &&
    players >= game.minPlayers && players <= game.maxPlayers;
}

// Longest a game is expected to take; BGG's playing time is usually the upper end.
export function longestTime(game) {
  return game.maxTime || game.playingTime || game.minTime || null;
}

export function shortestTime(game) {
  return game.minTime || game.playingTime || game.maxTime || null;
}

/**
 * Filter and rank games.
 * criteria: {
 *   players: number,
 *   minutes: number | null      (null = no time limit)
 *   allowLong: boolean          (fit on the game's minimum time rather than maximum)
 *   fit: "best" | "recommended"  (games without enough poll votes count as recommended)
 *   maxWeight: number | null    (BGG complexity, 1-5)
 *   sort: "fit" | "rating" | "myRating" | "leastPlayed" | "shortest" | "name"
 * }
 * Returns [{ game, fit, score }], best first.
 */
export function recommend(games, criteria) {
  const { players, minutes, allowLong, fit = "recommended", maxWeight, sort = "fit" } = criteria;
  const allowed = {
    best: [FIT.BEST],
    recommended: [FIT.BEST, FIT.RECOMMENDED, FIT.UNKNOWN],
  }[fit];

  const results = [];
  for (const game of games) {
    if (!supportsPlayers(game, players)) continue;
    const gameFit = playerFit(game, players);
    if (!allowed.includes(gameFit)) continue;
    if (minutes != null) {
      const time = allowLong ? shortestTime(game) : longestTime(game);
      if (time == null || time > minutes) continue;
    }
    if (maxWeight != null && game.weight != null && game.weight > maxWeight) continue;

    const community = (game.bggRating || 6) / 10;
    const score = 0.6 * fitScore(game, players) + 0.4 * community;
    results.push({ game, fit: gameFit, score });
  }

  const byName = (a, b) => a.game.name.localeCompare(b.game.name);
  const sorters = {
    fit: (a, b) => b.score - a.score,
    rating: (a, b) => (b.game.bggRating || 0) - (a.game.bggRating || 0),
    myRating: (a, b) => (b.game.myRating || 0) - (a.game.myRating || 0),
    leastPlayed: (a, b) => a.game.plays - b.game.plays || b.score - a.score,
    shortest: (a, b) => (longestTime(a.game) || 0) - (longestTime(b.game) || 0),
    name: byName,
  };
  return results.sort((a, b) => sorters[sort](a, b) || byName(a, b));
}

// Pick one of the top results at random, favouring better matches.
export function pickOne(results, random = Math.random, pool = 10) {
  const top = results.slice(0, pool);
  if (!top.length) return null;
  const weights = top.map((r) => r.score ** 2);
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return top[i];
  }
  return top[top.length - 1];
}
