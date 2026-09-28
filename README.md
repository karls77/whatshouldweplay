# What Should We Play?

A small web app that answers "what game should we play next?" from a
[BoardGameGeek](https://boardgamegeek.com) collection
([ratpfink's](https://boardgamegeek.com/collection/user/ratpfink?own=1&subtype=boardgame)).

Enter how many players you have and how much time, and it lists the owned games
that fit, ranked by how well they play at that count. It uses BGG's community
"suggested number of players" poll: if most voters say a game is **not
recommended** at your player count, it's left out even if the box supports it.
You can also filter by complexity, sort by rating / plays / length, or hit
**Pick one for us** for a random pick among the best matches.

## How it works

- `scripts/fetch_bgg.py` downloads the owned collection and each game's details
  (player range, play time, weight, ratings, player-count poll) from the
  [BGG XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2) and writes
  `site/data/games.json`.
- `site/` is a plain static site (no build step) that reads that JSON and does
  all the filtering in the browser. The logic lives in `site/recommend.js`.
- A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs the fetcher
  daily and on every push, then publishes `site/` to GitHub Pages. Everything
  is free.

## Setup (one time)

1. **Get a BGG API token.** BGG requires registered applications for API access.
   Sign in to BGG, go to <https://boardgamegeek.com/applications>, register an
   application (non-commercial), and create a token.
2. **Add it to this repo:** Settings → Secrets and variables → Actions →
   New repository secret, name `BGG_TOKEN`.
   (Optional: add a repository *variable* `BGG_USERNAME` to use another collection.)
3. **Turn on Pages:** Settings → Pages → Build and deployment → Source:
   **GitHub Actions**.
4. Merge to `main` (or go to Actions → "Update collection and deploy" → Run workflow).

The site will be at `https://karls77.github.io/whatshouldweplay/`. On a phone,
use "Add to Home Screen" to get an app-like icon.

GitHub Pages is free for public repositories. For a private repository it needs
a paid GitHub plan; in that case make the repo public (it contains no secrets;
the token stays in GitHub's secret store).

## Run it locally

```sh
BGG_TOKEN=your-token python3 scripts/fetch_bgg.py
cd site && python3 -m http.server 8000   # open http://localhost:8000
```

## Tests

```sh
python3 -m unittest discover -s tests   # BGG XML parsing
npm test                                # recommendation logic (Node 18+)
```
