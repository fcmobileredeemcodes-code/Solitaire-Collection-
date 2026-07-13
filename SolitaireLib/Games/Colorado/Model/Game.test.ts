import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Card } from '~CardLib/Model/Card';

function runGenerator(gen: Generator<any, any, any>) {
    while (!gen.next().done) {}
}

describe('Colorado Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it('should initialize correctly', () => {
        expect(game.stock).toBeDefined();
        expect(game.foundations.length).toBe(8);
        expect(game.tableaux.length).toBe(20);
        expect(game.cards.length).toBe(104);
    });

    it('should deal cards correctly on restart', () => {
        game.options.autoMoveToFoundation = false;
        runGenerator(game.restart(12345));

        // 20 tableaux, each with exactly 1 card, face up
        for (let i = 0; i < 20; ++i) {
            expect(game.tableaux[i].length).toBe(1);
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
        }

        // Remaining 84 cards in the stock, face down
        expect(game.stock.length).toBe(84);
        for (const card of game.stock) {
            expect(card.faceUp).toBe(false);
        }

        expect(game.won).toBe(false);
    });

    it('should produce deterministic deal with a fixed seed', () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        game1.options.autoMoveToFoundation = false;
        runGenerator(game1.restart(12345));

        const game2 = new Game(new GameOptions(new URLSearchParams()));
        game2.options.autoMoveToFoundation = false;
        runGenerator(game2.restart(12345));

        expect(game1.stock.length).toBe(game2.stock.length);
        for (let i = 0; i < game1.stock.length; i++) {
            expect(game1.stock.at(i).suit).toBe(game2.stock.at(i).suit);
            expect(game1.stock.at(i).rank).toBe(game2.stock.at(i).rank);
        }
    });

    it('should build on foundations correctly (ascending and descending)', () => {
        game.options.autoMoveToFoundation = false;
        runGenerator(game.restart(1));

        // Find an Ace and a King in the game
        const ace = game.cards.find(c => c.rank === Rank.Ace && c.suit === Suit.Spades) as Card;
        const spade2 = game.cards.find(c => c.rank === Rank.Two && c.suit === Suit.Spades && c !== ace) as Card;

        const king = game.cards.find(c => c.rank === Rank.King && c.suit === Suit.Hearts) as Card;
        const heartQueen = game.cards.find(c => c.rank === Rank.Queen && c.suit === Suit.Hearts && c !== king) as Card;

        // Ensure these cards are on the tableaux first, as stock cards cannot be dropped on foundations directly
        game.tableaux[0].push(ace);
        game.tableaux[1].push(spade2);
        game.tableaux[2].push(king);
        game.tableaux[3].push(heartQueen);

        // Foundation indices 0..3 are ascending (Ace to King)
        // Check if Ace is valid drop on empty ascending foundation
        expect(game.previewDrop(ace, game.foundations[0])).toBe(true);
        expect(game.previewDrop(spade2, game.foundations[0])).toBe(false); // cannot place 2 on empty

        // Place Ace of Spades on foundation 0
        game.foundations[0].push(ace);
        expect(game.previewDrop(spade2, game.foundations[0])).toBe(true); // now 2 is valid

        // Foundation indices 4..7 are descending (King to Ace)
        expect(game.previewDrop(king, game.foundations[4])).toBe(true);
        expect(game.previewDrop(heartQueen, game.foundations[4])).toBe(false); // cannot place Queen on empty

        // Place King of Hearts on foundation 4
        game.foundations[4].push(king);
        expect(game.previewDrop(heartQueen, game.foundations[4])).toBe(true); // now Queen is valid
    });

    it('should automatically refill empty tableau piles from stock', () => {
        game.options.autoMoveToFoundation = false;
        runGenerator(game.restart(12345));

        const emptyTableau = game.tableaux[0];
        const initialStockLength = game.stock.length;
        const nextStockCard = game.stock.peek();

        expect(emptyTableau.length).toBe(1);

        // Move the top card of tableau 0 to a foundation safely using push
        const cardToRemove = emptyTableau.peek() as Card;
        game.foundations[0].push(cardToRemove);

        // Trigger doAutoMoves_ generator to perform the automatic refill
        runGenerator((game as any).doAutoMoves_());

        // Tableau should have been automatically refilled with the top stock card
        expect(emptyTableau.length).toBe(1);
        expect(emptyTableau.peek()).toBe(nextStockCard);
        expect(nextStockCard?.faceUp).toBe(true);
        expect(game.stock.length).toBe(initialStockLength - 1);
    });

    it('should correctly flag the win condition when all cards are on foundations', () => {
        game.options.autoMoveToFoundation = false;
        runGenerator(game.restart(12345));

        expect(game.won).toBe(false);

        // Move all 104 game cards into foundations to simulate the won state
        for (let i = 0; i < game.cards.length; i++) {
            const card = game.cards[i];
            const foundationIndex = i % 8;
            game.foundations[foundationIndex].push(card);
        }

        // Explicitly evaluate won
        (game as any).checkWon_();

        expect(game.won).toBe(true);
    });
});
