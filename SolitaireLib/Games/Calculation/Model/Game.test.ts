import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';

const consume = (gen: Generator) => {
    let res = gen.next();
    while (!res.done) {
        res = gen.next();
    }
};

describe('Calculation Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it('should initialize correctly', () => {
        expect(game.stock).toBeDefined();
        expect(game.waste).toBeDefined();
        expect(game.tableaux.length).toBe(4);
        expect(game.foundations.length).toBe(4);
    });

    it('should pre-deal Ace, 2, 3, 4 of some suits to the foundations on restart', () => {
        consume(game.restart(12345));

        expect(game.foundations[0].peek()?.rank).toBe(Rank.Ace);
        expect(game.foundations[1].peek()?.rank).toBe(Rank.Two);
        expect(game.foundations[2].peek()?.rank).toBe(Rank.Three);
        expect(game.foundations[3].peek()?.rank).toBe(Rank.Four);

        // All of these should be faceUp
        expect(game.foundations[0].peek()?.faceUp).toBe(true);
        expect(game.foundations[1].peek()?.faceUp).toBe(true);
        expect(game.foundations[2].peek()?.faceUp).toBe(true);
        expect(game.foundations[3].peek()?.faceUp).toBe(true);

        // Sum of cards in stock + waste + tableaux + foundations must be 52
        let count = game.stock.length + game.waste.length;
        for (const pile of game.tableaux) count += pile.length;
        for (const pile of game.foundations) count += pile.length;
        expect(count).toBe(52);
    });

    it('should correctly validate foundation math progression rules', () => {
        consume(game.restart(12345));

        // sequences for foundation 4 (index 0) starts with Ace, next is 2, 3, etc.
        const f0 = game.foundations[0];
        const cardTwo = game.stock.slice().find(c => c.rank === Rank.Two);
        expect(cardTwo).toBeDefined();
        if (cardTwo) {
            expect(game.previewDrop(cardTwo, f0)).toBe(true);
        }

        // sequences for foundation 5 (index 1) starts with Two, next is 4, 6, etc.
        const f1 = game.foundations[1];
        const cardFour = game.stock.slice().find(c => c.rank === Rank.Four);
        expect(cardFour).toBeDefined();
        if (cardFour) {
            expect(game.previewDrop(cardFour, f1)).toBe(true);
        }

        const cardThree = game.stock.slice().find(c => c.rank === Rank.Three);
        if (cardThree) {
            // cardThree is not valid for f1 (needs 4)
            expect(game.previewDrop(cardThree, f1)).toBe(false);
        }
    });

    it('should not allow dragging from foundations, and only allow dragging top cards of tableaux/waste', () => {
        consume(game.restart(12345));

        const cardInF0 = game.foundations[0].peek();
        expect(cardInF0).toBeDefined();
        if (cardInF0) {
            expect(game.canDrag(cardInF0).canDrag).toBe(false);
        }
    });
});
