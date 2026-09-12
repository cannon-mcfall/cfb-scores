export interface Team {
  name: string;
  score: string;
  conferences: string[];
  rank?: number;
}

export interface Game {
  id: string;
  away: Team;
  home: Team;
  possession?: "away" | "home";
  situation?: string;
  lastPlay?: string;
  statusText?: string;
  status: string;
  period: string;
  clock: string;
  startTime: string;
}

interface EspnStatus {
  displayClock?: string;
  period?: number;
  type?: {
    completed?: boolean;
    shortDetail?: string;
    state?: "in" | "post" | "pre";
  };
}

interface EspnCompetitor {
  id?: string;
  homeAway?: "away" | "home";
  score?: string;
  curatedRank?: {
    current?: number;
  };
  team?: {
    abbreviation?: string;
    conferenceId?: string;
    displayName?: string;
    shortDisplayName?: string;
  };
}

interface EspnCompetition {
  competitors?: EspnCompetitor[];
  situation?: {
    downDistanceText?: string;
    lastPlay?: {
      text?: string;
    };
    possession?: string;
  };
  status?: EspnStatus;
}

interface EspnEvent {
  id?: string;
  competitions?: EspnCompetition[];
  status?: EspnStatus;
}

interface EspnResponse {
  events?: EspnEvent[];
}

const CONFERENCES_BY_ID: Record<string, string> = {
  "1": "acc",
  "4": "big-12",
  "5": "big-ten",
  "8": "sec",
};

function compactPlay(text: string | undefined): string | undefined {
  const trimmed = text?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.length <= 120
    ? trimmed
    : `${trimmed.slice(0, 117).trimEnd()}...`;
}

function gameStatus(status: EspnStatus): string {
  if (status.type?.state === "in") {
    return "live";
  }

  if (
    status.type?.state === "post" ||
    status.type?.completed
  ) {
    return "final";
  }

  return "pre";
}

function mapTeam(
  competitor: EspnCompetitor,
  status: string,
  fallbackName: string
): Team {
  const currentRank = competitor.curatedRank?.current;
  const conferenceId = competitor.team?.conferenceId;
  const conference = conferenceId
    ? CONFERENCES_BY_ID[conferenceId]
    : undefined;

  return {
    name:
      competitor.team?.shortDisplayName ??
      competitor.team?.displayName ??
      competitor.team?.abbreviation ??
      fallbackName,
    score:
      status === "pre" ? "-" : competitor.score ?? "-",
    rank:
      currentRank !== undefined && currentRank <= 25
        ? currentRank
        : undefined,
    conferences: conference ? [conference] : [],
  };
}

export async function getGames(): Promise<Game[]> {
  const url = new URL(
    "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
  );
  url.searchParams.set("groups", "80");
  url.searchParams.set("limit", "100");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ESPN API returned ${response.status}`);
  }

  const data = (await response.json()) as EspnResponse;

  return (data.events ?? []).flatMap((event): Game[] => {
    const competition = event.competitions?.[0];
    const awayCompetitor = competition?.competitors?.find(
      (competitor) => competitor.homeAway === "away"
    );
    const homeCompetitor = competition?.competitors?.find(
      (competitor) => competitor.homeAway === "home"
    );

    if (!competition || !awayCompetitor || !homeCompetitor) {
      return [];
    }

    const espnStatus = event.status ?? competition.status ?? {};
    const status = gameStatus(espnStatus);
    const possessionId = competition.situation?.possession;
    const possessingTeam = competition.competitors?.find(
      (competitor) => competitor.id === possessionId
    );

    return [
      {
        id: event.id ?? "",
        away: mapTeam(awayCompetitor, status, "Away"),
        home: mapTeam(homeCompetitor, status, "Home"),
        possession:
          status === "live"
            ? possessingTeam?.homeAway
            : undefined,
        situation:
          status === "live"
            ? competition.situation?.downDistanceText
            : undefined,
        lastPlay:
          status === "live"
            ? compactPlay(competition.situation?.lastPlay?.text)
            : undefined,
        statusText:
          status === "live"
            ? espnStatus.type?.shortDetail
            : undefined,
        status,
        period:
          status === "live" && espnStatus.period !== undefined
            ? String(espnStatus.period)
            : "",
        clock:
          status === "live" ? espnStatus.displayClock ?? "" : "",
        startTime:
          status === "pre"
            ? espnStatus.type?.shortDetail ?? "TBD"
            : "",
      },
    ];
  });
}
