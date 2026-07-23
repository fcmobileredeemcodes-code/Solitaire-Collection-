import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { Suit } from "~CardLib/Model/Suit";
import { Rank } from "~CardLib/Model/Rank";
import prand from "pure-rand";

describe("Hearts Game Model", () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it("should initialize with 4 players, individual scores, and no partnerships", () => {
        expect(game.players.length).toBe(4);
        expect(game.players[0].name).toBe("You");
        expect(game.players[0].teamId).toBeUndefined();
        expect(game.players[1].teamId).toBeUndefined();
        expect(game.players[2].teamId).toBeUndefined();
        expect(game.players[3].teamId).toBeUndefined();
        expect(game.scoreTracker.mode).toBe("player");
        expect(game.winningScore).toBe(100);
    });

    it("should permanently have no trump suit", () => {
        expect(game.determineTrump_(1)).toBe(Suit.None);
        expect(game.determineTrump_(5)).toBe(Suit.None);
        expect(game.trumpSuit).toBe(Suit.None);
    });

    it("should implement 4-round rotation pass direction correctly", () => {
        // Round 1 (index 0): Left
        game.roundNumber = 1;
        const startGen1 = (game as any).startNewRound_(prand.mersenne(12345));
        while (!startGen1.next().done) {}
        expect(game.isPassingPhase).toBe(true);

        // Round 2 (index 1): Right
        game.roundNumber = 2;
        const startGen2 = (game as any).startNewRound_(prand.mersenne(12345));
        while (!startGen2.next().done) {}
        expect(game.isPassingPhase).toBe(true);

        // Round 3 (index 2): Across
        game.roundNumber = 3;
        const startGen3 = (game as any).startNewRound_(prand.mersenne(12345));
        while (!startGen3.next().done) {}
        expect(game.isPassingPhase).toBe(true);

        // Round 4 (index 3): No Pass
        game.roundNumber = 4;
        const startGen4 = (game as any).startNewRound_(prand.mersenne(12345));
        while (!startGen4.next().done) {}
        expect(game.isPassingPhase).toBe(false); // Direct play phase
    });

    it("should enforce AI passing heuristics correctly", () => {
        const restart = game.restart(12345);
        while (!restart.next().done) {}

        const hand1 = game.handPiles[1];
        // Move all cards out, then add specific ones to test heuristics
        while (hand1.length > 0) {
            (game as any).deckPile.push(hand1.peek());
        }

        const qSpades = hand1.createCard(Suit.Spades, 0, Rank.Queen);
        const lowClub = hand1.createCard(Suit.Clubs, 0, Rank.Two);
        const highHeart = hand1.createCard(Suit.Hearts, 0, Rank.Ace);
        const highClub = hand1.createCard(Suit.Clubs, 0, Rank.Ace);

        // AI chosen passes for player 1
        const passes = (game as any).chooseAIPasses_(1);
        expect(passes.includes(qSpades)).toBe(true); // Queen of Spades first
        expect(passes.includes(highHeart)).toBe(true); // Highest Heart next
        expect(passes.includes(highClub)).toBe(true); // Highest overall card next
        expect(passes.length).toBe(3);
    });

    it("should restrict leading with Hearts unless broken or only Hearts in hand", () => {
        const restart = game.restart(12345);
        while (!restart.next().done) {}

        const hand = game.handPiles[0];
        while (hand.length > 0) {
            (game as any).deckPile.push(hand.peek());
        }

        const clubCard = hand.createCard(Suit.Clubs, 0, Rank.Ace);
        const heartCard = hand.createCard(Suit.Hearts, 0, Rank.Ace);

        game.currentTrick = []; // leading
        game.heartsBroken = false;

        let legalCards = game.getLegalCards_(hand);
        expect(legalCards.includes(clubCard)).toBe(true);
        expect(legalCards.includes(heartCard)).toBe(false); // Hearts not broken, can't lead Heart

        game.heartsBroken = true;
        legalCards = game.getLegalCards_(hand);
        expect(legalCards.includes(heartCard)).toBe(true); // Broken, can lead Hearts

        // Setup hand with ONLY Hearts
        game.heartsBroken = false;
        while (hand.length > 0) {
            (game as any).deckPile.push(hand.peek());
        }
        const heartCardOnly = hand.createCard(Suit.Hearts, 0, Rank.Ace);
        legalCards = game.getLegalCards_(hand);
        expect(legalCards.includes(heartCardOnly)).toBe(true); // Forced to lead Heart
    });

    it("should break Hearts when played off-suit", () => {
        const restart = game.restart(12345);
        while (!restart.next().done) {}

        game.heartsBroken = false;
        game.currentTrick = [
            { player: game.players[0], card: game.handPiles[0].createCard(Suit.Clubs, 0, Rank.Ace) }
        ];

        // Player 1 plays Heart off-suit
        const heartOffSuit = game.handPiles[1].createCard(Suit.Hearts, 0, Rank.Two);
        const playGen = (game as any).playCard_(heartOffSuit, game.players[1]);
        while (!playGen.next().done) {}

        expect(game.heartsBroken).toBe(true);
    });

    it("should score correctly and implement Old Moon shooting the moon rule", () => {
        const restart = game.restart(12345);
        while (!restart.next().done) {}

        // Case 1: Standard scoring (each Heart = 1 pt, Q of Spades = 13 pts)
        game.roundPoints = [5, 13, 8, 0]; // Sum is 26
        game.evaluateRoundScores_();

        expect(game.scoreTracker.getScore(game.players[0])).toBe(5);
        expect(game.scoreTracker.getScore(game.players[1])).toBe(13);
        expect(game.scoreTracker.getScore(game.players[2])).toBe(8);
        expect(game.scoreTracker.getScore(game.players[3])).toBe(0);

        // Case 2: Shooting the moon (Player 3 takes all 26 pts)
        game.scoreTracker.resetAll();
        game.roundPoints = [0, 0, 0, 26];
        game.evaluateRoundScores_();

        expect(game.scoreTracker.getScore(game.players[0])).toBe(26);
        expect(game.scoreTracker.getScore(game.players[1])).toBe(26);
        expect(game.scoreTracker.getScore(game.players[2])).toBe(26);
        expect(game.scoreTracker.getScore(game.players[3])).toBe(0); // Shooter gets 0
    });

    it("should end the game when a player reaches 100 points, lowest score wins", () => {
        const restart = game.restart(12345);
        while (!restart.next().done) {}

        game.scoreTracker.addScore(game.players[0], 10);
        game.scoreTracker.addScore(game.players[1], 102); // reached 100
        game.scoreTracker.addScore(game.players[2], 15);
        game.scoreTracker.addScore(game.players[3], 20);

        const won = (game as any).checkGameWon_();
        expect(won).toBe(true);
    });
});
