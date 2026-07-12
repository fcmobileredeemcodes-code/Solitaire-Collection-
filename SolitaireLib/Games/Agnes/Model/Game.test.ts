import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';

function consume(generator: Generator<any, any, any>) {
    while (!generator.next().done) {}
}

describe('Agnes Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams("autoMoveToFoundation=0")));
    });

    it('should initialize correctly', () => {
        expect(game.stock).toBeDefined();
        expect(game.leftovers.length).toBe(2);
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(7);
    });

    it('should produce deterministic deal with a fixed seed', () => {
        const game1 = new Game(new GameOptions(new URLSearchParams("autoMoveToFoundation=0")));
        consume(game1.restart(12345));

        const game2 = new Game(new GameOptions(new URLSearchParams("autoMoveToFoundation=0")));
        consume(game2.restart(12345));

        // Check if stock cards are in the same order
        expect(game1.stock.length).toBe(game2.stock.length);
        for(let i = 0; i < game1.stock.length; i++) {
            expect(game1.stock.at(i).suit).toBe(game2.stock.at(i).suit);
            expect(game1.stock.at(i).rank).toBe(game2.stock.at(i).rank);
        }
    });

    it('should set up tableaux and master foundation card correctly on restart', () => {
        consume(game.restart(12345));

        // Tableaux should have 1, 2, 3, 4, 5, 6, 7 cards
        for (let i = 0; i < 7; ++i) {
            expect(game.tableaux[i].length).toBe(i + 1);
            // top card should be face up
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
            // other cards should be face down
            for (let j = 0; j < i; ++j) {
                expect(game.tableaux[i].at(j).faceUp).toBe(false);
            }
        }

        // Foundations[0] should have 1 card face up (master card)
        expect(game.foundations[0].length).toBe(1);
        const masterCard = game.foundations[0].peek();
        expect(masterCard).toBeDefined();
        expect(masterCard?.faceUp).toBe(true);
        expect((game as any).masterRank_).toBe(masterCard?.rank);

        // Other foundations should be empty
        for (let i = 1; i < 4; ++i) {
            expect(game.foundations[i].length).toBe(0);
        }

        // Remaining 23 cards in stock (52 - 28 on tableaux - 1 master card = 23)
        expect(game.stock.length).toBe(23);
    });

    it('should build down tableau columns in alternating colors', () => {
        consume(game.restart(12345));

        // Create mock cards to test tableau drops explicitly
        const redSeven = (game as any).cards.find((c: any) => c.colour === Colour.Red && (game as any).getCardValue_(c) === 7);
        const blackSix = (game as any).cards.find((c: any) => c.colour === Colour.Black && (game as any).getCardValue_(c) === 6);
        const redSix = (game as any).cards.find((c: any) => c.colour === Colour.Red && (game as any).getCardValue_(c) === 6);

        expect(redSeven).toBeDefined();
        expect(blackSix).toBeDefined();
        expect(redSix).toBeDefined();

        // Put redSeven on tableaux[0] face up, blackSix on tableaux[1] face up
        redSeven.faceUp = true;
        game.tableaux[0].push(redSeven);

        blackSix.faceUp = true;
        game.tableaux[1].push(blackSix);

        redSix.faceUp = true;
        game.tableaux[2].push(redSix);

        // Can drop blackSix on redSeven?
        expect((game as any).previewDrop_(blackSix, game.tableaux[0])).toBe(true);

        // Can drop redSix on redSeven? (Same color -> false)
        expect((game as any).previewDrop_(redSix, game.tableaux[0])).toBe(false);
    });

    it('should restrict empty tableau space filling to rank masterRank - 1', () => {
        consume(game.restart(12345));

        const masterVal = (game as any).getCardValue_Rank((game as any).masterRank_);
        const requiredVal = masterVal === 1 ? 13 : masterVal - 1;

        // Clear tableaux[0]
        while (game.tableaux[0].length > 0) {
            game.stock.push(game.tableaux[0].peek()!);
        }
        expect(game.tableaux[0].length).toBe(0);

        // Find card with required rank
        const correctCard = (game as any).cards.find((c: any) => (game as any).getCardValue_(c) === requiredVal);
        correctCard.faceUp = true;
        game.leftovers[0].push(correctCard); // Place in playable spot

        // Find card with incorrect rank
        const incorrectVal = requiredVal === 1 ? 2 : requiredVal - 1;
        const incorrectCard = (game as any).cards.find((c: any) => (game as any).getCardValue_(c) === incorrectVal);
        incorrectCard.faceUp = true;
        game.leftovers[1].push(incorrectCard); // Place in playable spot

        // Correct card should be allowed to drop on empty space
        expect((game as any).previewDrop_(correctCard, game.tableaux[0])).toBe(true);

        // Incorrect card should be blocked
        expect((game as any).previewDrop_(incorrectCard, game.tableaux[0])).toBe(false);
    });

    it('should build foundations up by suit with circular wraparound starting from master rank', () => {
        consume(game.restart(12345));

        const masterCard = game.foundations[0].peek()!;
        const masterVal = (game as any).getCardValue_(masterCard);

        // The next rank we need is (masterVal % 13) + 1
        const nextVal = (masterVal % 13) + 1;
        const nextCard = (game as any).cards.find((c: any) => c.suit === masterCard.suit && (game as any).getCardValue_(c) === nextVal);
        nextCard.faceUp = true;
        game.leftovers[0].push(nextCard);

        // Correct card can drop
        expect((game as any).previewDrop_(nextCard, game.foundations[0])).toBe(true);

        // Incorrect card (wrong suit) cannot drop
        const wrongSuitCard = (game as any).cards.find((c: any) => c.suit !== masterCard.suit && (game as any).getCardValue_(c) === nextVal);
        wrongSuitCard.faceUp = true;
        game.leftovers[1].push(wrongSuitCard);
        expect((game as any).previewDrop_(wrongSuitCard, game.foundations[0])).toBe(false);
    });

    it('should handle stock deals and leftovers correctly', () => {
        consume(game.restart(12345));

        expect(game.stock.length).toBe(23);

        // 1st stock deal
        consume(game.pilePrimary(game.stock));
        expect(game.stock.length).toBe(16);
        for (let i = 0; i < 7; ++i) {
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
        }

        // 2nd stock deal
        consume(game.pilePrimary(game.stock));
        expect(game.stock.length).toBe(9);

        // 3rd stock deal: remaining 9 cards. 7 are dealt to tableaux, and 2 leftover are automatically moved to leftover piles
        consume(game.pilePrimary(game.stock));
        expect(game.stock.length).toBe(0);
        expect(game.leftovers[0].length).toBe(1);
        expect(game.leftovers[1].length).toBe(1);
        expect(game.leftovers[0].peek()?.faceUp).toBe(true);
        expect(game.leftovers[1].peek()?.faceUp).toBe(true);
    });

    it('should correctly evaluate won state', () => {
        consume(game.restart(12345));
        expect(game.won).toBe(false);

        // Mocking win state: move all cards to foundation piles
        // We must invoke (game as any).checkWon_() afterward as direct mutations bypass high-level game operations.
        for (const card of game.cards) {
            card.faceUp = true;
            game.foundations[0].push(card);
        }

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
