import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Rank } from '~CardLib/Model/Rank';

describe('Accordion Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    // Helper to consume a generator fully
    function runGenerator(gen: Generator<any, any, any>) {
        while (!gen.next().done) {}
    }

    it('should initialize correctly with 52 piles', () => {
        expect(game.piles.length).toBe(52);
        expect(game.won).toBe(false);
    });

    it('should produce deterministic deal with a fixed seed', () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        runGenerator(game1.restart(12345));

        const game2 = new Game(new GameOptions(new URLSearchParams()));
        runGenerator(game2.restart(12345));

        // Check if top card of each pile is identical
        for (let i = 0; i < 52; ++i) {
            expect(game1.piles[i].length).toBe(1);
            expect(game2.piles[i].length).toBe(1);
            const card1 = game1.piles[i].peek()!;
            const card2 = game2.piles[i].peek()!;
            expect(card1.suit).toBe(card2.suit);
            expect(card1.rank).toBe(card2.rank);
        }
    });

    it('should validate slide (1-left) and leap (3-left) rules correctly', () => {
        (game as any).cards = [];
        for (const p of game.piles) {
            (p as any).cards_ = [];
        }

        // Pile 0: King of Spades
        // Pile 1: King of Hearts (matches Pile 0 in Rank)
        // Pile 2: Ten of Hearts (matches Pile 1 in Suit)
        // Pile 3: Seven of Diamonds
        // Pile 4: Ten of Spades (matches Pile 0 in Suit, Pile 2 in Rank)

        const card0 = game.piles[0].createCard(Suit.Spades, Colour.Black, Rank.King);
        const card1 = game.piles[1].createCard(Suit.Hearts, Colour.Red, Rank.King);
        const card2 = game.piles[2].createCard(Suit.Hearts, Colour.Red, Rank.Ten);
        const card3 = game.piles[3].createCard(Suit.Diamonds, Colour.Red, Rank.Seven);
        const card4 = game.piles[4].createCard(Suit.Spades, Colour.Black, Rank.Ten);

        game.cards.push(card0, card1, card2, card3, card4);

        // 1. Check Slide (1-left): Pile 1 onto Pile 0
        expect((game as any).previewDrop_(card1, game.piles[0])).toBe(true);

        // 2. Check Suit Match: Pile 2 onto Pile 1
        expect((game as any).previewDrop_(card2, game.piles[1])).toBe(true);

        // 3. Check invalid distance (2-left): Pile 2 onto Pile 0
        expect((game as any).previewDrop_(card2, game.piles[0])).toBe(false);

        // 4. Check invalid match on Leap (3-left): Pile 3 onto Pile 0
        expect((game as any).previewDrop_(card3, game.piles[0])).toBe(false);

        // Perform valid move: Pile 1 onto Pile 0
        runGenerator(game.dropCard(card1, game.piles[0]));

        expect(game.piles[0].length).toBe(2);
        expect(game.piles[0].peek()).toBe(card1);
        expect(game.piles[1].length).toBe(0);

        // Current non-empty visual ordering:
        // Visual 0: Pile 0 (top: King of Hearts)
        // Visual 1: Pile 2 (top: Ten of Hearts)
        // Visual 2: Pile 3 (top: Seven of Diamonds)
        // Visual 3: Pile 4 (top: Ten of Spades)

        // 5. Check Slide (1-left) in collapsed view: Pile 2 onto Pile 0 (since Pile 1 is empty, distance is 1)
        expect((game as any).previewDrop_(card2, game.piles[0])).toBe(true);

        // Perform slide: Pile 2 onto Pile 0
        runGenerator(game.dropCard(card2, game.piles[0]));

        expect(game.piles[0].length).toBe(3);
        expect(game.piles[0].peek()).toBe(card2);
        expect(game.piles[2].length).toBe(0);

        // Current non-empty visual ordering:
        // Visual 0: Pile 0 (top: Ten of Hearts)
        // Visual 1: Pile 3 (top: Seven of Diamonds)
        // Visual 2: Pile 4 (top: Ten of Spades)

        // 6. Check Leap (2-left now, which is invalid since visual index of Pile 4 is 2, and Pile 0 is 0)
        expect((game as any).previewDrop_(card4, game.piles[0])).toBe(false);

        // Add a new card in Pile 1 to insert an active pile back
        const card5 = game.piles[1].createCard(Suit.Hearts, Colour.Red, Rank.King);
        game.cards.push(card5);

        // Current non-empty visual ordering:
        // Visual 0: Pile 0 (top: Ten of Hearts)
        // Visual 1: Pile 1 (top: King of Hearts)
        // Visual 2: Pile 3 (top: Seven of Diamonds)
        // Visual 3: Pile 4 (top: Ten of Spades)

        // 7. Check Leap (3-left) in collapsed view: Pile 4 (Ten of Spades) onto Pile 0 (Ten of Hearts)
        // Matches in Rank (Ten)! Visual distance is 3!
        expect((game as any).previewDrop_(card4, game.piles[0])).toBe(true);

        // Perform leap: Pile 4 onto Pile 0
        runGenerator(game.dropCard(card4, game.piles[0]));

        expect(game.piles[0].length).toBe(4);
        expect(game.piles[0].peek()).toBe(card4);
        expect(game.piles[4].length).toBe(0);
    });

    it('should identify win condition correctly', () => {
        (game as any).cards = [];
        for (const p of game.piles) {
            (p as any).cards_ = [];
        }

        for (let i = 0; i < 52; ++i) {
            const card = game.piles[0].createCard(Suit.Spades, Colour.Black, Rank.Ace);
            game.cards.push(card);
        }

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
