import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";

const consume = (gen: Generator) => {
    let res = gen.next();
    while (!res.done) {
        res = gen.next();
    }
};

describe("AcesUp Game Model", () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it("should initialize correctly", () => {
        expect(game.stock).toBeDefined();
        expect(game.foundation).toBeDefined();
        expect(game.tableaux.length).toBe(4);
        expect(game.piles.length).toBe(6);
    });

    it("should produce deterministic deal with a fixed seed", () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        consume(game1.restart(12345));

        const game2 = new Game(new GameOptions(new URLSearchParams()));
        consume(game2.restart(12345));

        expect(game1.stock.length).toBe(game2.stock.length);
        for (let i = 0; i < game1.stock.length; i++) {
            expect(game1.stock.at(i).suit).toBe(game2.stock.at(i).suit);
            expect(game1.stock.at(i).rank).toBe(game2.stock.at(i).rank);
        }
    });

    it("should have correct initial layout after restart", () => {
        consume(game.restart(12345));
        expect(game.stock.length).toBe(48);
        expect(game.foundation.length).toBe(0);
        for (const tableau of game.tableaux) {
            expect(tableau.length).toBe(1);
            expect(tableau.peek()?.faceUp).toBe(true);
        }
    });

    it("should allow drawing cards from stock", () => {
        consume(game.restart(12345));
        // Draw card should deal 1 card to each tableau by triggering stock click
        consume(game.pilePrimary(game.stock));

        expect(game.stock.length).toBe(44);
        for (const tableau of game.tableaux) {
            expect(tableau.length).toBe(2);
        }
    });

    it("should detect winnable state flag", () => {
        expect(game.won).toBe(false);
    });
});
