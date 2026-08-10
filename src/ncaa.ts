export interface Game {
  id: string;
  away: string;
  awayScore: string;
  home: string;
  homeScore: string;
  status: string;
  period: string;
  clock: string;
  startTime: string;
}

interface NcaaTeam {
  names?: {
    short?: string;
    char6?: string;
  };
  score?: string;
}

interface NcaaGame {
  game?: {
    gameID?: string;
    gameState?: string;
    currentPeriod?: string;
    contestClock?: string;
    finalMessage?: string;
    startTime?: string;
    away?: NcaaTeam;
    home?: NcaaTeam;
  };
}

interface NcaaResponse {
  games?: NcaaGame[];
}

interface ScoreboardWeek {
  season: number;
  week: number;
}

function getScoreboardWeek(now = new Date()): ScoreboardWeek {
  const year = now.getFullYear();

  /*
   * 2026 Week 1 begins around Aug. 29.
   *
   * We use Aug. 29 as our anchor and advance one scoreboard
   * week every seven days.
   *
   * Before the season starts, show Week 1 so visitors can
   * see upcoming games.
   */
  const weekOne = new Date(`${year}-08-29T00:00:00-04:00`);

  if (now < weekOne) {
    return {
      season: year,
      week: 1,
    };
  }

  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;

  const week =
    Math.floor(
      (now.getTime() - weekOne.getTime()) /
        millisecondsPerWeek
    ) + 1;

  return {
    season: year,
    week: Math.max(1, week),
  };
}

export async function getGames(): Promise<Game[]> {
  const { season, week } = getScoreboardWeek();

  const weekString = String(week).padStart(2, "0");

  const url =
    `https://ncaa-api.henrygd.me/scoreboard/football/fbs/${season}/${weekString}/all-conf`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NCAA API returned ${response.status}`
    );
  }

  const data = (await response.json()) as NcaaResponse;

  return (data.games ?? []).map(({ game }) => {
    if (!game) {
      throw new Error("Unexpected NCAA game format");
    }

    return {
      id: game.gameID ?? "",
      away:
        game.away?.names?.short ??
        game.away?.names?.char6 ??
        "Away",
      awayScore: game.away?.score ?? "-",
      home:
        game.home?.names?.short ??
        game.home?.names?.char6 ??
        "Home",
      homeScore: game.home?.score ?? "-",
      status:
        game.finalMessage ??
        game.gameState ??
        "",
      period: game.currentPeriod ?? "",
      clock: game.contestClock ?? "",
      startTime: game.startTime ?? ""
    };
  });
}