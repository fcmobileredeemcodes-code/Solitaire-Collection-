import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';

describe('AuldLangSyne Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it('should initialize correctly', () => {
        expect(game.stock).toBeDefined();
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(4);
        expect(game.cards.length).toBe(52);
    });

    it('should separate Aces and deal correctly on restart', () => {
        // Run restart. We need to consume the generator!
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        // Each foundation should have exactly 1 card, which is an Ace
        for (const foundation of game.foundations) {
            expect(foundation.length).toBe(1);
            expect(foundation.peek()?.rank).toBe(Rank.Ace);
        }

        // Each tableau pile should have exactly 1 card face up
        for (const tableau of game.tableaux) {
            expect(tableau.length).toBe(1);
            expect(tableau.peek()?.faceUp).toBe(true);
        }

        // Stock should have 52 - 4 - 4 = 44 cards
        expect(game.stock.length).toBe(44);
    });

    it('should handle drop logic correctly', () => {
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        // Let's manually place a 2 of any suit on top of a tableau pile, and try dropping it onto a foundation
        const targetFoundation = game.foundations[0];
        // Ensure foundation top is Ace
        expect(targetFoundation.peek()?.rank).toBe(Rank.Ace);

        // Find a card of rank 2
        const cardTwo = game.cards.find(c => c.rank === Rank.Two);
        expect(cardTwo).toBeDefined();

        if (cardTwo) {
            // Move it to tableau[0]
            game.tableaux[0].push(cardTwo);
            cardTwo.faceUp = true;

            // Since it's on top of the tableau, can we drag it?
            expect(game.canDrag(cardTwo).canDrag).toBe(true);

            // Is dropping cardTwo on foundation valid?
            const isValidDrop = game.previewDrop(cardTwo, targetFoundation);
            expect(isValidDrop).toBe(true);

            // Drop it! We must consume the generator.
            const dropGen = game.dropCard(cardTwo, targetFoundation);
            let dropRes = dropGen.next();
            while (!dropRes.done) {
                dropRes = dropGen.next();
            }

            expect(targetFoundation.length).toBe(2);
            expect(targetFoundation.peek()).toBe(cardTwo);
        }
    });

    it('should reject invalid moves', () => {
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        const targetFoundation = game.foundations[0];
        // Find a card of rank King (13)
        const cardKing = game.cards.find(c => c.rank === Rank.King);
        expect(cardKing).toBeDefined();

        if (cardKing) {
            // Put it on tableau
            game.tableaux[1].push(cardKing);
            cardKing.faceUp = true;

            // King cannot be placed on Ace
            const isValidDrop = game.previewDrop(cardKing, targetFoundation);
            expect(isValidDrop).toBe(false);
        }
    });

    it('should draw 4 cards from stock to tableaux when stock is clicked/drawn', () => {
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        const initialStockLen = game.stock.length; // 44
        const initialTableauLengths = game.tableaux.map(t => t.length); // [1, 1, 1, 1]

        // Draw from stock
        const drawGen = game.pilePrimary(game.stock);
        let drawRes = drawGen.next();
        while (!drawRes.done) {
            drawRes = drawGen.next();
        }

        expect(game.stock.length).toBe(initialStockLen - 4);
        for (let i = 0; i < 4; i++) {
            const tableau = game.tableaux[i];
            const initialLength = initialTableauLengths[i] ?? 0;
            expect(tableau.length).toBe(initialLength + 1);
        }
    });
});
