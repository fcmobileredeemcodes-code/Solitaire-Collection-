import { TrickTakingGameBase } from "~CardLib/Model/TrickTakingGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { ScoreTracker } from "~CardLib/Model/ScoreTracker";
import { IGame } from "./IGame";

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    constructor(params: URLSearchParams) {
        super();
        this.options = new GameOptions(params);

        // Seating: 0: Human (South), 1: West (AI), 2: Partner (North, AI), 3: East (AI)
        this.players = [
            { id: "player0", name: "You", isHuman: true, teamId: "TeamA" },
            { id: "player1", name: "AI West", isHuman: false, teamId: "TeamB" },
            { id: "player2", name: "AI Partner", isHuman: false, teamId: "TeamA" },
            { id: "player3", name: "AI East", isHuman: false, teamId: "TeamB" },
        ];

        this.scoreTracker = new ScoreTracker("team");
    }

    public override determineTrump_(round: number): Suit {
        // Cycle: Hearts, Spades, Diamonds, Clubs, No Trump
        const cycle = [Suit.Hearts, Suit.Spades, Suit.Diamonds, Suit.Clubs, Suit.None];
        const index = (round - 1) % 5;
        return cycle[index] ?? Suit.None;
    }

    protected override evaluateRoundScores_(): void {
        const teamATricks = this.scoreTracker.getTricksByKey("TeamA");
        const teamBTricks = this.scoreTracker.getTricksByKey("TeamB");

        const teamAScore = Math.max(0, teamATricks - 6);
        const teamBScore = Math.max(0, teamBTricks - 6);

        this.scoreTracker.addScoreByKey("TeamA", teamAScore);
        this.scoreTracker.addScoreByKey("TeamB", teamBScore);

        this.gameLog.push(`Round ended. Team A (You) scored ${teamAScore} pts (Tricks: ${teamATricks}). Team B scored ${teamBScore} pts (Tricks: ${teamBTricks}).`);
    }

    protected override checkGameWon_(): boolean {
        const scoreA = this.scoreTracker.getScoreByKey("TeamA");
        const scoreB = this.scoreTracker.getScoreByKey("TeamB");

        if (scoreA >= 7 || scoreB >= 7) {
            const winningTeam = scoreA >= 7 ? "Team A (You & Partner)" : "Team B (Opponents)";
            this.gameLog.push(`${winningTeam} won the game with ${Math.max(scoreA, scoreB)} points!`);
            return true;
        }
        return false;
    }
}
