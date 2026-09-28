import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend, playerFit, pickOne, FIT } from "../site/recommend.js";

const catalans = {
  id: 146228, name: "1714", minPlayers: 3, maxPlayers: 6, minTime: 120, maxTime: 180,
  bggRating: 7.6, weight: 3.5, plays: 3,
  playerPoll: {
    3: { best: 2, rec: 10, not: 4 },
    4: { best: 9, rec: 6, not: 1 },
    5: { best: 12, rec: 4, not: 0 },
    6: { best: 1, rec: 4, not: 11 },
  },
};
const filler = {
  id: 1, name: "Filler", minPlayers: 2, maxPlayers: 8, minTime: 15, maxTime: 30,
  bggRating: 6.5, weight: 1.2, plays: 10, playerPoll: {},
};
const games = [catalans, filler];
const names = (r) => r.map((x) => x.game.name);

test("classifies the player-count poll", () => {
  assert.equal(playerFit(catalans, 3), FIT.RECOMMENDED);
  assert.equal(playerFit(catalans, 5), FIT.BEST);
  assert.equal(playerFit(catalans, 6), FIT.NOT_RECOMMENDED);
  assert.equal(playerFit(filler, 4), FIT.UNKNOWN);
});

test("drops counts a majority says are not recommended, even if the box allows them", () => {
  assert.deepEqual(names(recommend(games, { players: 6, minutes: null })), ["Filler"]);
  assert.deepEqual(names(recommend(games, { players: 5, minutes: null })), ["1714", "Filler"]);
});

test("respects the player range", () => {
  assert.deepEqual(names(recommend(games, { players: 2, minutes: null })), ["Filler"]);
  assert.deepEqual(names(recommend(games, { players: 9, minutes: null })), []);
});

test("filters by time, optionally allowing games that might run long", () => {
  assert.deepEqual(names(recommend(games, { players: 4, minutes: 150 })), ["Filler"]);
  assert.deepEqual(names(recommend(games, { players: 4, minutes: 150, allowLong: true })), ["1714", "Filler"]);
});

test("best-only and weight filters", () => {
  assert.deepEqual(names(recommend(games, { players: 4, minutes: null, fit: "best" })), ["1714"]);
  assert.deepEqual(names(recommend(games, { players: 4, minutes: null, maxWeight: 2 })), ["Filler"]);
});

test("sorting", () => {
  assert.deepEqual(names(recommend(games, { players: 4, minutes: null, sort: "leastPlayed" })), ["1714", "Filler"]);
  assert.deepEqual(names(recommend(games, { players: 4, minutes: null, sort: "shortest" })), ["Filler", "1714"]);
});

test("pickOne picks from the results", () => {
  const results = recommend(games, { players: 4, minutes: null });
  assert.equal(pickOne(results, () => 0).game.name, results[0].game.name);
  assert.equal(pickOne(results, () => 0.999999).game.name, results[1].game.name);
  assert.equal(pickOne([]), null);
});
