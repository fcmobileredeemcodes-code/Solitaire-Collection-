import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { Suit } from "~CardLib/Model/Suit";
import { Rank } from "~CardLib/Model/Rank";

describe("Manni Game Model", () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it("should initialize with exactly 3 players and no partnerships", () => {
        expect(game.players.length).toBe(3);
        expect(game.players[0].name).toBe("You");
        expect(game.players[0].isHuman).toBe(true);
        expect(game.players[1].name).toBe("AI West");
        expect(game.players[1].isHuman).toBe(false);
        expect(game.players[2].name).toBe("AI East");
        expect(game.players[2].isHuman).toBe(false);
        expect(game.scoreTracker.mode).toBe("player");
    });

    it("should build a 48-card deck and set aside the four 2s as indicators", () => {
        // total master cards list is 52 (48 play cards + four 2s)
        expect(game.cards.length).toBe(52);

        // check that each of the four 2s is placed in a separate trump indicator pile
        const orderOfSuits = [Suit.Hearts, Suit.Spades, Suit.Diamonds, Suit.Clubs];
        for (let i = 0; i < 4; ++i) {
            const pile = game.trumpIndicatorPiles[i];
            expect(pile.length).toBe(1);
            expect(pile.peek()?.rank).toBe(Rank.Two);
            expect(pile.peek()?.suit).toBe(orderOfSuits[i]);
        }
    });

    it("should deal 12 cards to each player and place remaining 12 in the Manni pile", () => {
        const originalRandom = Math.random;
        Math.random = () => 0.9; // Forces roundStarterIndex = 2 (Human acts first, pausing exchange phase immediately)
        try {
            const restartGen = game.restart(54321);
            let res = restartGen.next();
            while (!res.done) {
                res = restartGen.next();
            }

            expect(game.handPiles[0].length).toBe(12);
            expect(game.handPiles[1].length).toBe(12);
            expect(game.handPiles[2].length).toBe(12);
            expect(game.manniPile.length).toBe(12);
        } finally {
            Math.random = originalRandom;
        }
    });

    it("should rotate Trump suit correctly across rounds and Visually flip the 2 indicator card", () => {
        // Round 1 -> Hearts
        expect(game.determineTrump_(1)).toBe(Suit.Hearts);
        expect(game.trumpIndicatorPiles[0].peek()?.faceUp).toBe(true);
        expect(game.trumpIndicatorPiles[1].peek()?.faceUp).toBe(false);

        // Round 2 -> Spades
        expect(game.determineTrump_(2)).toBe(Suit.Spades);
        expect(game.trumpIndicatorPiles[1].peek()?.faceUp).toBe(true);
        expect(game.trumpIndicatorPiles[0].peek()?.faceUp).toBe(false);

        // Round 3 -> Diamonds
        expect(game.determineTrump_(3)).toBe(Suit.Diamonds);
        expect(game.trumpIndicatorPiles[2].peek()?.faceUp).toBe(true);

        // Round 4 -> Clubs
        expect(game.determineTrump_(4)).toBe(Suit.Clubs);
        expect(game.trumpIndicatorPiles[3].peek()?.faceUp).toBe(true);

        // Round 5 -> Hearts
        expect(game.determineTrump_(5)).toBe(Suit.Hearts);
        expect(game.trumpIndicatorPiles[0].peek()?.faceUp).toBe(true);
    });

    it("should support human exchange and complete exchange phase", () => {
        const originalRandom = Math.random;
        Math.random = () => 0.9; // Forces roundStarterIndex = 2 (dealer AI East, human left of dealer is 1st to act)
        try {
            const restartGen = game.restart(12345);
            let res = restartGen.next();
            while (!res.done) {
                res = restartGen.next();
            }

            expect(game.isExchangePhase).toBe(true);
            expect(game.currentExchangingPlayerIndex).toBe(0);

            const firstThreeCards = [...game.handPiles[0]].slice(0, 3);
            const exchangeGen = game.submitHumanExchange_(firstThreeCards);
            let exchangeRes = exchangeGen.next();
            while (!exchangeRes.done) {
                exchangeRes = exchangeGen.next();
            }

            // exchange completes since human exchanged cards (subsequent players play original hands)
            expect(game.isExchangePhase).toBe(false);
            expect(game.exchangesCount[0]).toBe(3);
            expect(game.handPiles[0].length).toBe(12);
            expect(game.manniPile.length).toBe(12);
        } finally {
            Math.random = originalRandom;
        }
    });

    it("should score correctly (1 pt per trick won above 4)", () => {
        game.scoreTracker.resetAll();

        // Simulate trick wins: player 0 wins 6, player 1 wins 4, player 2 wins 2
        for (let i = 0; i < 6; ++i) game.scoreTracker.addTrick(game.players[0]);
        for (let i = 0; i < 4; ++i) game.scoreTracker.addTrick(game.players[1]);
        for (let i = 0; i < 2; ++i) game.scoreTracker.addTrick(game.players[2]);

        (game as any).evaluateRoundScores_();

        expect(game.scoreTracker.getScore(game.players[0])).toBe(2); // 6 - 4
        expect(game.scoreTracker.getScore(game.players[1])).toBe(0); // 4 - 4
        expect(game.scoreTracker.getScore(game.players[2])).toBe(0); // 2 - 4
    });
});
