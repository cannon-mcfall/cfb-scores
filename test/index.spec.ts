import { fetchMock } from "cloudflare:test";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { renderGame } from "../src/index";
import { getGames, type Game } from "../src/espn";

beforeAll(() => fetchMock.activate());
beforeEach(() => fetchMock.disableNetConnect());
afterEach(() => fetchMock.assertNoPendingInterceptors());

function makeGame(overrides: Partial<Game> = {}): Game {
	return {
		id: "1",
		away: {
			name: "Penn St.",
			score: "14",
			conferences: ["big-ten"],
		},
		home: {
			name: "Temple",
			score: "7",
			conferences: ["american"],
		},
		status: "live",
		period: "2",
		clock: "10:32",
		startTime: "",
		...overrides,
	};
}

describe("score rendering", () => {
	it("shows the possession arrow beside the away team", () => {
		const output = renderGame(
			makeGame({ possession: "away" })
		);

		expect(output).toContain("▶ Penn St.");
		expect(output).not.toContain("▶ Temple");
	});

	it("shows the possession arrow beside the home team", () => {
		const output = renderGame(
			makeGame({ possession: "home" })
		);

		expect(output).toContain("▶ Temple");
		expect(output).not.toContain("▶ Penn St.");
	});

	it("does not show a possession arrow after the game", () => {
		const output = renderGame(
			makeGame({ status: "final", possession: "home" })
		);

		expect(output).not.toContain("▶");
	});

	it("shows the current down and field position", () => {
		const output = renderGame(
			makeGame({
				situation: "2nd & 4 at TEM 4",
			})
		);

		expect(output).toContain(
			"Q2 10:32 | 2nd &amp; 4 at TEM 4"
		);
	});
});

describe("ESPN scoreboard data", () => {
	it("loads scores and live situation data in one request", async () => {
		fetchMock
			.get("https://site.web.api.espn.com")
			.intercept({
				path: /\/apis\/site\/v2\/sports\/football\/college-football\/scoreboard\?.+/,
			})
			.reply(
				200,
				JSON.stringify({
					events: [
						{
							id: "1",
							status: {
								displayClock: "10:32",
								period: 2,
								type: {
									state: "in",
									shortDetail: "10:32 - 2nd",
								},
							},
							competitions: [
								{
									situation: {
										possession: "213",
										downDistanceText:
											"2nd & 4 at TEM 4",
									},
									competitors: [
										{
											id: "218",
											homeAway: "home",
											score: "7",
											team: {
												shortDisplayName: "Temple",
												conferenceId: "1",
											},
										},
										{
											id: "213",
											homeAway: "away",
											score: "14",
											curatedRank: { current: 16 },
											team: {
												shortDisplayName: "Penn State",
												conferenceId: "5",
											},
										},
									],
								},
							],
						},
					],
				})
			);

		const games = await getGames();

		expect(games).toHaveLength(1);
		expect(games[0].possession).toBe("away");
		expect(games[0].situation).toBe("2nd & 4 at TEM 4");
		expect(games[0].away).toMatchObject({
			name: "Penn State",
			score: "14",
			rank: 16,
			conferences: ["big-ten"],
		});
	});
});
