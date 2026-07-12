import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";
import { Rank } from "~CardLib/Model/Rank";
import { Suit } from "~CardLib/Model/Suit";

const consume = (gen: Generator) => {
    let res = gen.next();
    while (!res.done) {
        res = gen.next();
    }
};

describe("Cruel Game Model", () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it("should initialize correctly", () => {
        expect(game.stock).toBeDefined();
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(12);
        expect(game.piles.length).toBe(17); // 1 stock + 4 foundations + 12 tableaux
    });

    it("should produce deterministic deal with a fixed seed", () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        consume(game1.restart(12345));

        const game2 = new Game(new GameOptions(new URLSearchParams()));
        consume(game2.restart(12345));

        for (let i = 0; i < game1.tableaux.length; i++) {
            const tab1 = game1.tableaux[i];
            const tab2 = game2.tableaux[i];
            expect(tab1.length).toBe(tab2.length);
            for (let j = 0; j < tab1.length; j++) {
                expect(tab1.at(j).suit).toBe(tab2.at(j).suit);
                expect(tab1.at(j).rank).toBe(tab2.at(j).rank);
            }
        }
    });

    it("should have correct initial layout after restart", () => {
        consume(game.restart(12345));
        expect(game.stock.length).toBe(0);

        // All 4 foundations should have 1 Ace each
        for (const foundation of game.foundations) {
            expect(foundation.length).toBe(1);
            expect(foundation.peek()?.rank).toBe(Rank.Ace);
        }

        // All 12 tableaux should have 4 cards each, all face up
        for (const tableau of game.tableaux) {
            expect(tableau.length).toBe(4);
            for (const card of tableau) {
                expect(card.faceUp).toBe(true);
            }
        }
    });

    it("should preserve layout on redeal if no cards were moved", () => {
        consume(game.restart(12345));

        // Save original cards layout
        const originalCards = game.tableaux.map(t => t.slice().map(c => ({ suit: c.suit, rank: c.rank })));

        // Trigger redeal
        consume(game.pilePrimary(game.stock));

        const postRedealCards = game.tableaux.map(t => t.slice().map(c => ({ suit: c.suit, rank: c.rank })));
        expect(postRedealCards).toEqual(originalCards);
    });

    it("should handle redealing with fewer cards correctly", () => {
        consume(game.restart(12345));

        // Manually move a top card from a tableau to its matching foundation to simulate gameplay
        const cardToMove = game.tableaux[0].peek()!;
        game.foundations[0].push(cardToMove);

        // Sum of cards in tableaux before redeal is 47
        let sumBefore = game.tableaux.reduce((sum, t) => sum + t.length, 0);
        expect(sumBefore).toBe(47);

        // Trigger redeal
        consume(game.pilePrimary(game.stock));

        // After redeal, all 47 cards should be in tableaux, evening out into piles of 4
        // 47 cards / 4 = 11 piles of 4, plus 1 pile of 3. Remaining piles are empty.
        let sumAfter = game.tableaux.reduce((sum, t) => sum + t.length, 0);
        expect(sumAfter).toBe(47);

        for (let i = 0; i < 11; i++) {
            expect(game.tableaux[i].length).toBe(4);
        }
        expect(game.tableaux[11].length).toBe(3);
    });

    it("should reject invalid tableau-to-tableau moves and empty tableau plays", () => {
        consume(game.restart(12345));

        const card = game.tableaux[0].peek()!;
        const destEmpty = game.tableaux[1];

        // Empty out tableau 1 manually to test empty tableau drop rule
        while (destEmpty.length > 0) {
            game.stock.push(destEmpty.peek()!);
        }

        // Test dropping into empty tableau
        const canDropIntoEmpty = (game as any).previewDrop_(card, destEmpty);
        expect(canDropIntoEmpty).toBe(false);

        // Test building down on tableau with non-matching suit or incorrect rank
        const otherTableau = game.tableaux[2];
        const canBuildIncorrect = (game as any).previewDrop_(card, otherTableau);
        // Unless it happens to match suit and be rank + 1, it must be false
        const otherTop = otherTableau.peek()!;
        const expectedValid = otherTop.suit === card.suit && otherTop.rank === card.rank + 1;
        expect(canBuildIncorrect).toBe(expectedValid);
    });
});
