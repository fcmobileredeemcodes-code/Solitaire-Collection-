import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from "~CardLib/Model/Rank";
import { Card } from "~CardLib/Model/Card";

function consume(generator: Generator<any, any, any>) {
    while (!generator.next().done) {}
}

describe('Carpet Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it('should initialize correctly', () => {
        expect(game.stock).toBeDefined();
        expect(game.waste).toBeDefined();
        expect(game.foundations.length).toBe(4);
        expect(game.carpet.length).toBe(20);
        expect(game.cards.length).toBe(52);
    });

    it('should deal cards correctly on restart', () => {
        consume(game.restart(12345));

        // 4 foundations must each have 1 Ace
        expect(game.foundations.length).toBe(4);
        for (const foundation of game.foundations) {
            expect(foundation.length).toBe(1);
            expect(foundation.peek()?.rank).toBe(Rank.Ace);
            expect(foundation.peek()?.faceUp).toBe(true);
        }

        // 20 carpet piles must each have exactly 1 card
        expect(game.carpet.length).toBe(20);
        for (const pile of game.carpet) {
            expect(pile.length).toBe(1);
            expect(pile.peek()?.faceUp).toBe(true);
        }

        // 28 stock cards remaining, waste empty
        expect(game.stock.length).toBe(28);
        expect(game.waste.length).toBe(0);
    });

    it('should produce deterministic deal with a fixed seed', () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        consume(game1.restart(12345));

        const game2 = new Game(new GameOptions(new URLSearchParams()));
        consume(game2.restart(12345));

        // Check if stock cards are in the same order
        expect(game1.stock.length).toBe(game2.stock.length);
        for(let i = 0; i < game1.stock.length; i++) {
            expect(game1.stock.at(i).suit).toBe(game2.stock.at(i).suit);
            expect(game1.stock.at(i).rank).toBe(game2.stock.at(i).rank);
        }
    });

    it('should allow dealing a card from stock to waste', () => {
        consume(game.restart(12345));
        const initialStockLength = game.stock.length;
        const topStockCard = game.stock.peek();

        // Click/activate stock
        consume(game.pilePrimary(game.stock));

        expect(game.stock.length).toBe(initialStockLength - 1);
        expect(game.waste.length).toBe(1);
        expect(game.waste.peek()).toBe(topStockCard);
        expect(game.waste.peek()?.faceUp).toBe(true);
    });

    it('should allow dragging only top card of carpet or waste', () => {
        consume(game.restart(12345));

        // Top card of carpet is draggable
        const carpetCard = game.carpet[0].peek() as Card;
        expect(game.canDrag(carpetCard).canDrag).toBe(true);

        // Click stock to put card in waste
        consume(game.pilePrimary(game.stock));
        const wasteCard = game.waste.peek() as Card;
        expect(game.canDrag(wasteCard).canDrag).toBe(true);

        // A card in foundation is not draggable
        const foundationCard = game.foundations[0].peek() as Card;
        expect(game.canDrag(foundationCard).canDrag).toBe(false);
    });

    it('should validate foundation drops (suit match and next rank)', () => {
        consume(game.restart(12345));

        const f0 = game.foundations[0];
        const aceCard = f0.peek() as Card;
        expect(aceCard.rank).toBe(Rank.Ace);

        // Let's create mock card of rank 2 and same suit using createCard
        const validTwo = game.waste.createCard(aceCard.suit, aceCard.colour, Rank.Two);
        game.cards.push(validTwo); // satisfy global card registration check

        const invalidTwo = game.waste.createCard((aceCard.suit % 4) + 1, aceCard.colour, Rank.Two);
        game.cards.push(invalidTwo);

        // Preview drop on f0
        expect(game.previewDrop(validTwo, f0)).toBe(true);
        expect(game.previewDrop(invalidTwo, f0)).toBe(false);
    });

    it('should automatically fill a carpet gap from the waste pile first', () => {
        consume(game.restart(12345));

        // Put a card on the waste pile
        consume(game.pilePrimary(game.stock));
        const wasteCard = game.waste.peek() as Card;
        const stockCard = game.stock.peek() as Card;
        expect(game.waste.length).toBe(1);

        // Now empty carpet pile 0
        const cell = game.carpet[0];
        const cellCard = cell.peek() as Card;

        // Manually transfer cellCard to foundation to trigger empty gap
        game.foundations[1].push(cellCard);

        // Now trigger auto moves
        consume((game as any).doAutoMoves_());

        // The empty gap at carpet[0] should be filled by wasteCard, not stockCard
        expect(cell.length).toBe(1);
        expect(cell.peek()).toBe(wasteCard);
        expect(game.waste.length).toBe(0);
    });

    it('should automatically fill a carpet gap from the stock pile if the waste is empty', () => {
        consume(game.restart(12345));

        expect(game.waste.length).toBe(0);
        const stockCard = game.stock.peek() as Card;

        const cell = game.carpet[0];
        const cellCard = cell.peek() as Card;

        // Manually transfer cellCard to foundation to trigger an empty gap
        game.foundations[1].push(cellCard);

        // Trigger auto moves
        consume((game as any).doAutoMoves_());

        // The empty gap should be filled from stock
        expect(cell.length).toBe(1);
        expect(cell.peek()).toBe(stockCard);
        expect(game.waste.length).toBe(0);
    });
});
