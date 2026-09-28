import { FIT, recommend, pickOne, playerFit, longestTime, shortestTime } from "./recommend.js";

const form = document.getElementById("criteria");
const resultsEl = document.getElementById("results");
const countEl = document.getElementById("count");
const pickEl = document.getElementById("pick-result");
const STORAGE_KEY = "wswp-criteria";

const FIT_LABEL = {
  [FIT.BEST]: "Best",
  [FIT.RECOMMENDED]: "Recommended",
  [FIT.NOT_RECOMMENDED]: "Not recommended",
  [FIT.UNKNOWN]: "Few votes",
};

let games = [];

function readCriteria() {
  const f = new FormData(form);
  return {
    players: Math.max(1, parseInt(f.get("players"), 10) || 1),
    minutes: f.get("minutes") ? Number(f.get("minutes")) : null,
    allowLong: f.get("allowLong") === "on",
    fit: f.get("fit"),
    maxWeight: f.get("maxWeight") ? Number(f.get("maxWeight")) : null,
    sort: f.get("sort"),
  };
}

function saveForm() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(new FormData(form))));
  } catch { /* storage unavailable */ }
}

function restoreForm() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch { return; }
  if (!saved) return;
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") el.checked = saved[el.name] === "on";
    else if (el.name in saved) el.value = saved[el.name];
  }
}

function formatTime(game) {
  const lo = shortestTime(game), hi = longestTime(game);
  if (!hi) return "? min";
  return lo && lo !== hi ? `${lo}–${hi} min` : `${hi} min`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

// One chip per supported player count, coloured by community fit.
function playerChips(game, selected) {
  const wrap = el("div", { class: "chips", "aria-label": "Community player-count votes" });
  for (let n = game.minPlayers; n <= game.maxPlayers && n - game.minPlayers < 12; n++) {
    const fit = playerFit(game, n);
    wrap.append(el("span", {
      class: `chip fit-${fit}${n === selected ? " selected" : ""}`,
      title: `${n} players: ${FIT_LABEL[fit]}`,
    }, String(n)));
  }
  return wrap;
}

function gameCard({ game, fit }, players, tag = "li") {
  const facts = [
    `${game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}–${game.maxPlayers}`} players`,
    formatTime(game),
    game.weight ? `weight ${game.weight.toFixed(1)}` : null,
    game.bggRating ? `BGG ${game.bggRating.toFixed(1)}` : null,
    game.myRating ? `mine ${game.myRating}` : null,
    `${game.plays} play${game.plays === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return el(tag, { class: "game" },
    game.thumbnail
      ? el("img", { src: game.thumbnail, alt: "", loading: "lazy", width: 72, height: 72 })
      : el("div", { class: "thumb-placeholder" }),
    el("div", { class: "info" },
      el("a", { class: "name", href: `https://boardgamegeek.com/boardgame/${game.id}`, target: "_blank", rel: "noopener" },
        game.name, game.year ? el("span", { class: "muted" }, ` (${game.year})`) : null),
      el("div", { class: "facts" }, facts.join(" · ")),
      el("div", { class: "fitline" },
        el("span", { class: `badge fit-${fit}` }, `${FIT_LABEL[fit]} at ${players}`),
        playerChips(game, players)),
    ),
  );
}

function render() {
  const criteria = readCriteria();
  const results = recommend(games, criteria);
  countEl.textContent = results.length
    ? `${results.length} game${results.length === 1 ? "" : "s"} fit`
    : "Nothing fits. Try more time or a different player count.";
  resultsEl.replaceChildren(...results.map((r) => gameCard(r, criteria.players)));
  document.getElementById("pick").disabled = !results.length;
  return results;
}

function update() {
  pickEl.hidden = true;
  saveForm();
  render();
}

form.addEventListener("input", update);
form.addEventListener("submit", (e) => e.preventDefault());

form.querySelectorAll("[data-step]").forEach((btn) => btn.addEventListener("click", () => {
  const input = form.elements.players;
  input.value = Math.min(20, Math.max(1, (parseInt(input.value, 10) || 1) + Number(btn.dataset.step)));
  update();
}));

document.getElementById("pick").addEventListener("click", () => {
  const criteria = readCriteria();
  const choice = pickOne(recommend(games, criteria));
  if (!choice) return;
  pickEl.replaceChildren(el("h2", {}, "Let's play…"), gameCard(choice, criteria.players, "div"));
  pickEl.hidden = false;
  pickEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

async function load() {
  const subtitle = document.getElementById("subtitle");
  try {
    const resp = await fetch("data/games.json", { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    games = data.games.filter((g) => g.minPlayers && g.maxPlayers);
    const updated = new Date(data.updated).toLocaleDateString();
    subtitle.textContent = `${data.games.length} games owned by ${data.username} · updated ${updated}`;
  } catch (err) {
    subtitle.textContent = `Couldn't load the collection (${err.message}).`;
    return;
  }
  restoreForm();
  render();
}

load();
