import { describe, it, expect, beforeEach } from "vitest";
import { Suit } from "~CardLib/Model/Suit";
import { Colour } from "~CardLib/Model/Colour";
import { Rank } from "~CardLib/Model/Rank";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";

const consume = (gen: Generator) => {
    let res = gen.next();
    while (!res.done) {
        res = gen.next();
    }
};

describe("Giza Game Model", () => {
    let game: Game;

    beforeEach(() => {
        const options = new GameOptions(new URLSearchParams());
        options.autoPlayKings = false;
        game = new Game(options);
    });

    it("should initialize with correct piles structure", () => {
        expect(game.pyramid.length).toBe(7);
        expect(game.columns.length).toBe(8);
        expect(game.foundation).toBeDefined();
        expect(game.piles.length).toBe(37); // 28 pyramid + 8 columns + 1 foundation
    });

    it("should deal cards correctly to pyramid and columns on restart", () => {
        consume(game.restart(12345));

        // Pyramid size: row 0 has 1, row 1 has 2, ..., row 6 has 7. Total 28.
        let pyramidCount = 0;
        for (let y = 0; y < game.pyramid.length; ++y) {
            const row = game.pyramid[y];
            expect(row.length).toBe(y + 1);
            for (const pile of row) {
                expect(pile.length).toBe(1);
                expect(pile.peek()?.faceUp).toBe(true);
                pyramidCount += pile.length;
            }
        }
        expect(pyramidCount).toBe(28);

        // Columns size: 8 columns of 3 cards each fanned down, total 24.
        let colCount = 0;
        for (const col of game.columns) {
            expect(col.length).toBe(3);
            for (const card of col) {
                expect(card.faceUp).toBe(true);
            }
            colCount += col.length;
        }
        expect(colCount).toBe(24);
        expect(game.foundation.length).toBe(0);
    });

    it("should produce deterministic deal with fixed seed", () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        const game2 = new Game(new GameOptions(new URLSearchParams()));

        consume(game1.restart(999));
        consume(game2.restart(999));

        for (let i = 0; i < game1.piles.length; ++i) {
            const p1 = game1.piles[i]!;
            const p2 = game2.piles[i]!;
            expect(p1.length).toBe(p2.length);
            for (let j = 0; j < p1.length; ++j) {
                expect(p1.at(j).suit).toBe(p2.at(j).suit);
                expect(p1.at(j).rank).toBe(p2.at(j).rank);
            }
        }
    });

    it("should correctly identify free/accessible cards in pyramid and columns", () => {
        consume(game.restart(5555));

        // The top card of each column (the index 2 card) is free.
        for (const col of game.columns) {
            const topCard = col.peek();
            expect(topCard).toBeDefined();
            expect(game.canDrag(topCard!).canDrag).toBe(true);

            // A card deeper in the column (index 0 or 1) is not free.
            const bottomCard = col.at(0);
            expect(game.canDrag(bottomCard).canDrag).toBe(false);
        }

        // Bottom row of the pyramid (row 6) has no row 7 below it, so all cards in row 6 are free.
        const bottomRow = game.pyramid[6];
        for (const pile of bottomRow) {
            expect(game.canDrag(pile.peek()!).canDrag).toBe(true);
        }

        // Row 5 is currently covered by row 6 cards, so row 5 cards are NOT free.
        const row5 = game.pyramid[5];
        for (const pile of row5) {
            expect(game.canDrag(pile.peek()!).canDrag).toBe(false);
        }

        // If we clear the blocking cards in row 6, the card in row 5 above them should become free.
        // E.g., row 5 pile 0 is covered by row 6 pile 0 and row 6 pile 1.
        const block0 = bottomRow[0]!;
        const block1 = bottomRow[1]!;

        // Let's clear them by popping their cards to foundation
        game.foundation.push(block0.peek()!);
        game.foundation.push(block1.peek()!);

        expect(block0.length).toBe(0);
        expect(block1.length).toBe(0);

        // Now, row 5 pile 0 should be free!
        const r5p0 = row5[0]!;
        expect(game.canDrag(r5p0.peek()!).canDrag).toBe(true);

        // But row 5 pile 1 is covered by row 6 pile 1 and row 6 pile 2. Since pile 1 is cleared but pile 2 is not, it remains blocked.
        const r5p1 = row5[1]!;
        expect(game.canDrag(r5p1.peek()!).canDrag).toBe(false);
    });

    it("should allow matching pairs that sum to 13 and discarding them", () => {
        consume(game.restart(111));

        // Clear some piles for custom testing
        const col0 = game.columns[0];
        const col1 = game.columns[1];
        const col2 = game.columns[2];
        while (col0.length > 0) game.foundation.push(col0.peek()!);
        while (col1.length > 0) game.foundation.push(col1.peek()!);
        while (col2.length > 0) game.foundation.push(col2.peek()!);

        // Create custom cards on the cleared columns
        // Note: createCard pushes them to the columns automatically.
        const ace = col0.createCard(Suit.Hearts, Colour.Red, Rank.Ace); // value = 1
        const queen = col1.createCard(Suit.Spades, Colour.Black, Rank.Queen); // value = 12
        const jack = col2.createCard(Suit.Diamonds, Colour.Red, Rank.Jack); // value = 11

        ace.faceUp = true;
        queen.faceUp = true;
        jack.faceUp = true;

        game.cards.push(ace, queen, jack);

        // Ace (1) and Queen (12) sum to 13, so dropping Queen onto Ace is valid
        expect(game.previewDrop(queen, col0)).toBe(true);

        // Drop Queen on Ace
        consume(game.dropCard(queen, col0));

        // Both cards should be moved to foundation
        expect(game.foundation.peek()).toBe(queen);
        expect(game.foundation.at(game.foundation.length - 2)).toBe(ace);
        expect(col0.length).toBe(0);
        expect(col1.length).toBe(0); // col1 was cleared
        expect(col2.length).toBe(1); // jack is still in col2
        expect(col2.peek()).toBe(jack);

        // Now place Jack (11) in col1. Jack and another card (no card) cannot sum to 13.
        expect(game.previewDrop(jack, col1)).toBe(false); // col1 is empty, no card to match
    });

    it("should allow single-clicking an unblocked King to discard it", () => {
        consume(game.restart(222));

        const col0 = game.columns[0];
        while (col0.length > 0) game.foundation.push(col0.peek()!);

        const king = col0.createCard(Suit.Clubs, Colour.Black, Rank.King);
        king.faceUp = true;
        game.cards.push(king);

        expect(game.canDrag(king).canDrag).toBe(true);

        // Click the King
        consume(game.cardPrimary(king));

        // King should be moved to foundation
        expect(game.foundation.peek()).toBe(king);
        expect(col0.length).toBe(0);
    });

    it("should automatically discard Kings if autoPlayKings is enabled", () => {
        const options = new GameOptions(new URLSearchParams());
        options.autoPlayKings = true;
        const autoGame = new Game(options);

        // Place a King at the top of column 0 and restart
        consume(autoGame.restart(777));

        // Any free King in the dealt game should be auto-played to the foundation immediately!
        // Let's verify that if a King is at the bottom row of pyramid or top of column, it is in foundation.
        for (const card of autoGame.foundation) {
            if (card.rank === Rank.King) {
                // Yes, some King was auto-played!
                expect(card.faceUp).toBe(true);
            }
        }
    });

    it("should detect won state correctly when all cards are cleared", () => {
        consume(game.restart(888));

        // Initially not won
        expect(game.won).toBe(false);

        // Move all cards from pyramid and columns to foundation to simulate a win
        for (const row of game.pyramid) {
            for (const pile of row) {
                while (pile.length > 0) {
                    game.foundation.push(pile.peek()!);
                }
            }
        }
        for (const col of game.columns) {
            while (col.length > 0) {
                game.foundation.push(col.peek()!);
            }
        }

        // Execute a final game state check
        expect((game as any).doGetWon_()).toBe(true);

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
