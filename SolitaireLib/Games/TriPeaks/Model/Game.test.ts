import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { Colour } from "~CardLib/Model/Colour";
import { Rank } from "~CardLib/Model/Rank";

describe("TriPeaks Game Model", () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it("should initialize correctly with 30 piles", () => {
        expect(game.stock).toBeDefined();
        expect(game.waste).toBeDefined();
        expect(game.peaks.length).toBe(28);
        expect(game.piles.length).toBe(30);
    });

    it("should produce deterministic deal with a fixed seed", () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        // restart is a generator, so we must consume it to execute dealing logic
        const gen1 = game1.restart(12345);
        let res1 = gen1.next();
        while (!res1.done) {
            res1 = gen1.next();
        }

        const game2 = new Game(new GameOptions(new URLSearchParams()));
        const gen2 = game2.restart(12345);
        let res2 = gen2.next();
        while (!res2.done) {
            res2 = gen2.next();
        }

        expect(game1.stock.length).toBe(game2.stock.length);
        for (let i = 0; i < game1.stock.length; i++) {
            expect(game1.stock.at(i).suit).toBe(game2.stock.at(i).suit);
            expect(game1.stock.at(i).rank).toBe(game2.stock.at(i).rank);
        }
    });

    it("should handle card blocking and unblocking logic properly", () => {
        // Run restart to deal cards
        const gen = game.restart(999);
        let res = gen.next();
        while (!res.done) {
            res = gen.next();
        }

        // Initially Row 4 (18-27) should be face up
        for (let i = 18; i <= 27; ++i) {
            expect(game.peaks[i].peek()?.faceUp).toBe(true);
        }

        // Rows 1-3 should be face down
        for (let i = 0; i <= 17; ++i) {
            expect(game.peaks[i].peek()?.faceUp).toBe(false);
        }

        // Test drag/drop conditions
        const bottomCard = game.peaks[18].peek()!;
        expect(game.canDrag(bottomCard).canDrag).toBe(true);

        const blockedCard = game.peaks[9].peek()!;
        expect(game.canDrag(blockedCard).canDrag).toBe(false);
    });

    it("should correctly handle rank wrapping movement rules", () => {
        // Run restart to deal
        const gen = game.restart(123);
        let res = gen.next();
        while (!res.done) {
            res = gen.next();
        }

        // Let's manually manipulate cards to test wrap rules cleanly
        const peakCard = game.peaks[18].peek()!;
        const wasteCard = game.waste.peek()!;

        // Let's set some exact values
        // Case 1: King on Ace
        peakCard.faceUp = true;
        Object.defineProperty(peakCard, "rank", { value: Rank.King });
        Object.defineProperty(wasteCard, "rank", { value: Rank.Ace });
        expect(game.previewDrop(peakCard, game.waste)).toBe(true);

        // Case 2: Ace on King
        Object.defineProperty(peakCard, "rank", { value: Rank.Ace });
        Object.defineProperty(wasteCard, "rank", { value: King_Val() });
        function King_Val() { return Rank.King; }
        expect(game.previewDrop(peakCard, game.waste)).toBe(true);

        // Case 3: 5 on 4
        Object.defineProperty(peakCard, "rank", { value: Rank.Five });
        Object.defineProperty(wasteCard, "rank", { value: Rank.Four });
        expect(game.previewDrop(peakCard, game.waste)).toBe(true);

        // Case 4: 5 on 6
        Object.defineProperty(peakCard, "rank", { value: Rank.Five });
        Object.defineProperty(wasteCard, "rank", { value: Rank.Six });
        expect(game.previewDrop(peakCard, game.waste)).toBe(true);

        // Case 5: 5 on King (invalid)
        Object.defineProperty(peakCard, "rank", { value: Rank.Five });
        Object.defineProperty(wasteCard, "rank", { value: Rank.King });
        expect(game.previewDrop(peakCard, game.waste)).toBe(false);
    });

    it("should recognize win state when all peak piles are empty", () => {
        const gen = game.restart(777);
        let res = gen.next();
        while (!res.done) {
            res = gen.next();
        }

        expect(game.won).toBe(false);

        // Empty all but the last peak pile manually
        for (let i = 0; i < 27; ++i) {
            const card = game.peaks[i].peek();
            if (card) {
                game.waste.push(card);
            }
        }

        const lastCard = game.peaks[27].peek()!;
        lastCard.faceUp = true;
        const wasteCard = game.waste.peek()!;
        Object.defineProperty(lastCard, "rank", { value: Rank.Ace });
        Object.defineProperty(wasteCard, "rank", { value: Rank.Two });

        // Trigger the drop via the public dropCard method, which commits operation and checks win state
        const genDrop = game.dropCard(lastCard, game.waste);
        let resDrop = genDrop.next();
        while (!resDrop.done) {
            resDrop = genDrop.next();
        }

        expect(game.won).toBe(true);
    });
});
