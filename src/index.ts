import { getGames, type Game } from "./ncaa";

interface Env {
  SCORES: KVNamespace;
}

interface ScoreSnapshot {
  games: Game[];
  updatedAt: number;
}

type FilterMode =
  | "all"
  | "top25"
  | "sec"
  | "bigten"
  | "acc"
  | "big12";

function getFilter(pathname: string): FilterMode {
  switch (pathname) {
    case "/top25":
      return "top25";
    case "/sec":
      return "sec";
    case "/bigten":
      return "bigten";
    case "/acc":
      return "acc";
    case "/big12":
      return "big12";
    default:
      return "all";
  }
}

const CACHE_KEY = "fbs-scoreboard";
const FRESH_FOR_MS = 20_000;

// Don't write every successful request to KV.
// This keeps us comfortably under the free-tier write limit.
const STORE_INTERVAL_MS = 120_000;


function isInConference(
  game: Game,
  conference: string
): boolean {
  return (
    game.away.conferences.includes(conference) ||
    game.home.conferences.includes(conference)
  );
}

function filterGames(
  games: Game[],
  filter: FilterMode
): Game[] {
  switch (filter) {
    case "top25":
      return games.filter(
        (game) =>
          game.away.rank !== undefined ||
          game.home.rank !== undefined
      );

    case "sec":
      return games.filter((game) =>
        isInConference(game, "sec")
      );

    case "bigten":
      return games.filter((game) =>
        isInConference(game, "big-ten")
      );

    case "acc":
      return games.filter((game) =>
        isInConference(game, "acc")
      );

    case "big12":
      return games.filter((game) =>
        isInConference(game, "big-12")
      );

    default:
      return games;
  }
}



function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function gameCategory(
  game: Game
): "live" | "final" | "upcoming" {
  if (game.status === "live") {
    return "live";
  }

  if (game.status === "final") {
    return "final";
  }

  return "upcoming";
}

function renderTeam(team: Game["home"]): string {
  const rank =
    team.rank !== undefined ? `#${team.rank} ` : "";

  return `${rank}${team.name}`;
}

function renderGame(game: Game): string {
  const category = gameCategory(game);

  let status = "";

  if (category === "live") {
    status =
      [
        game.period ? `Q${game.period}` : "",
        game.clock,
      ]
        .filter(Boolean)
        .join(" ") || "LIVE";
  }

  if (category === "final") {
    status = "FINAL";
  }

  if (category === "upcoming") {
    status = game.startTime || "TBD";
  }

  const awayName = renderTeam(game.away);
  const homeName = renderTeam(game.home);

  return `${escapeHtml(status)}
	${escapeHtml(awayName.padEnd(24))} ${escapeHtml(game.away.score)}
	${escapeHtml(homeName.padEnd(24))} ${escapeHtml(game.home.score)}`;
}

function renderSection(
  title: string,
  games: Game[]
): string {
  if (games.length === 0) {
    return "";
  }

  return `${title}

${games.map(renderGame).join("\n\n")}`;
}

function formatAge(updatedAt: number): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - updatedAt) / 1000)
  );

  if (seconds < 5) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds} seconds ago`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes === 1) {
    return "1 minute ago";
  }

  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }

  const hours = Math.floor(minutes / 60);

  return hours === 1
    ? "1 hour ago"
    : `${hours} hours ago`;
}
function renderNav(): string {
  return `<nav>
<a href="/">ALL</a> |
<a href="/top25">TOP 25</a> |
<a href="/sec">SEC</a> |
<a href="/bigten">B1G</a> |
<a href="/acc">ACC</a> |
<a href="/big12">B12</a>
</nav>`;
}

async function loadScores(
  env: Env
): Promise<{
  snapshot: ScoreSnapshot;
  stale: boolean;
}> {
  const cached = await env.SCORES.get<ScoreSnapshot>(
    CACHE_KEY,
    "json"
  );

  const now = Date.now();

  // Recent enough: don't even contact NCAA.
  if (
    cached &&
    now - cached.updatedAt < FRESH_FOR_MS
  ) {
    return {
      snapshot: cached,
      stale: false,
    };
  }

  try {
    const games = await getGames();

    const snapshot: ScoreSnapshot = {
      games,
      updatedAt: now,
    };

    /*
     * Only persist if:
     * - there is no previous snapshot, or
     * - the stored copy is at least 2 minutes old.
     */
    if (
      !cached ||
      now - cached.updatedAt >= STORE_INTERVAL_MS
    ) {
      await env.SCORES.put(
        CACHE_KEY,
        JSON.stringify(snapshot)
      );
    }

    return {
      snapshot,
      stale: false,
    };
  } catch (error) {
    // Upstream failed, but old data is better than no data.
    if (cached) {
      return {
        snapshot: cached,
        stale: true,
      };
    }

    throw error;
  }
}





export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
	const url = new URL(request.url);
	const filter = getFilter(url.pathname);
    try {
      const { snapshot, stale } =
        await loadScores(env);

      const games = filterGames(
  		snapshot.games,
 		 filter
		);

      const live = games.filter(
        (game) => gameCategory(game) === "live"
      );

      const upcoming = games.filter(
        (game) => gameCategory(game) === "upcoming"
      );

      const final = games.filter(
        (game) => gameCategory(game) === "final"
      );

      const sections = [
        renderSection("LIVE", live),
        renderSection("UPCOMING", upcoming),
        renderSection("FINAL", final),
      ]
        .filter(Boolean)
        .join(
          "\n\n------------------------------\n\n"
        );

      const freshness = formatAge(
        snapshot.updatedAt
      );

      const warning = stale
        ? "\nWARNING: Live update failed. Showing last known scores.\n"
        : "";

      const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CFB Scores</title>
<style>
body{
  font:16px monospace;
  max-width:640px;
  margin:auto;
  padding:12px;
}
nav{
  margin:8px 0 14px;
}
pre{
  white-space:pre-wrap;
  margin:0;
}
a{
  color:inherit;
}
</style>

CFB SCORES
${renderNav()}

<pre>Updated ${escapeHtml(freshness)}
${warning}
${sections || "No games found."}

------------------------------
<a href="${escapeHtml(url.pathname)}">REFRESH</a>
</pre>`;

      return new Response(html, {
        headers: {
          "content-type":
            "text/html; charset=utf-8",

          // The browser should ask us again rather
          // than holding an old HTML page itself.
          "cache-control": "no-cache",
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error";

      return new Response(
        `Unable to load scores.\n\n${message}`,
        {
          status: 503,
          headers: {
            "content-type":
              "text/plain; charset=utf-8",
          },
        }
      );
    }
  },
};