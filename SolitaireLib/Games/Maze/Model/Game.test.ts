import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('Maze Game Model', () => {
    let game: Game;

    const clearPile = (pile: Pile) => {
        const tempPile = new Pile(game);
        while (pile.length > 0) {
            tempPile.push(pile.peek()!);
        }
    };

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it('should initialize and deal correctly', () => {
        expect(game.gridPiles.length).toBe(52);
        expect(game.discardPile).toBeDefined();

        // Run restart generator
        Array.from(game.restart(12345));

        // 4 Kings should be in the discardPile
        expect(game.discardPile.length).toBe(4);
        for (let i = 0; i < 4; i++) {
            expect(game.discardPile.at(i).rank).toBe(Rank.King);
            expect(game.discardPile.at(i).faceUp).toBe(false);
        }

        // Each grid pile should have exactly 1 card, except for 4 empty slots left by Kings
        let emptyCount = 0;
        let filledCount = 0;
        for (let i = 0; i < 52; i++) {
            const pile = game.gridPiles[i];
            if (pile.length === 0) {
                emptyCount++;
            } else {
                expect(pile.length).toBe(1);
                expect(pile.peek()?.faceUp).toBe(true);
                expect(pile.peek()?.rank).not.toBe(Rank.King);
                filledCount++;
            }
        }

        expect(emptyCount).toBe(4);
        expect(filledCount).toBe(48);
    });

    it('should validate drag-and-drop mechanics (correctly enforcing left/right suit and rank constraints)', () => {
        // Run restart generator to initialize cards
        Array.from(game.restart(12345));

        // Clear all grid piles and discard pile for a deterministic custom state
        for (const pile of game.gridPiles) {
            clearPile(pile);
        }
        clearPile(game.discardPile);

        // Reset game.cards to empty before pushing custom cards
        game.cards = [];

        // Create cards:
        // Left card at pile 0 (Row 0, Col 0): 5 of Hearts
        const heart5 = game.gridPiles[0].createCard(Suit.Hearts, Colour.Red, Rank.Five);
        heart5.faceUp = true;
        game.cards.push(heart5);
        game.gridPiles[0].push(heart5);

        // Right card at pile 2 (Row 0, Col 2): 7 of Hearts
        const heart7 = game.gridPiles[2].createCard(Suit.Hearts, Colour.Red, Rank.Seven);
        heart7.faceUp = true;
        game.cards.push(heart7);
        game.gridPiles[2].push(heart7);

        // Card to test: 6 of Hearts
        const heart6 = game.discardPile.createCard(Suit.Hearts, Colour.Red, Rank.Six);
        heart6.faceUp = true;
        game.cards.push(heart6);
        game.discardPile.push(heart6);

        // Card to test: 6 of Spades (wrong suit)
        const spade6 = game.discardPile.createCard(Suit.Spades, Colour.Black, Rank.Six);
        spade6.faceUp = true;
        game.cards.push(spade6);
        game.discardPile.push(spade6);

        // Card to test: 8 of Hearts (wrong rank)
        const heart8 = game.discardPile.createCard(Suit.Hearts, Colour.Red, Rank.Eight);
        heart8.faceUp = true;
        game.cards.push(heart8);
        game.discardPile.push(heart8);

        // Pile index 1 is an empty slot (Row 0, Col 1)
        const targetPile = game.gridPiles[1];

        // 6 of Hearts should be allowed at index 1 (matches Heart 5 on left, Heart 7 on right)
        expect((game as any).previewDrop_(heart6, targetPile)).toBe(true);

        // 6 of Spades (wrong suit) should be rejected
        expect((game as any).previewDrop_(spade6, targetPile)).toBe(false);

        // 8 of Hearts (wrong rank) should be rejected
        expect((game as any).previewDrop_(heart8, targetPile)).toBe(false);
    });

    it('should verify that the win condition triggers correctly when each row is sequenced Ace-Queen and column 12 is empty', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        // Clear all piles
        for (const pile of game.gridPiles) {
            clearPile(pile);
        }
        clearPile(game.discardPile);

        // Reset game.cards
        game.cards = [];

        const suits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
        const colours = [Colour.Black, Colour.Red, Colour.Red, Colour.Black];
        const ranks = [
            Rank.Ace, Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six,
            Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen
        ];

        // Fill columns 0..11 for each row r = 0..3 with Ace to Queen of that row's suit
        for (let r = 0; r < 4; ++r) {
            const suit = suits[r]!;
            const colour = colours[r]!;
            for (let c = 0; c < 12; ++c) {
                const rank = ranks[c]!;
                const card = game.gridPiles[r * 13 + c].createCard(suit, colour, rank);
                card.faceUp = true;
                game.cards.push(card);
                game.gridPiles[r * 13 + c].push(card);
            }
        }

        // Add 4 Kings to discard pile so that game has 52 cards total
        for (let r = 0; r < 4; ++r) {
            const suit = suits[r]!;
            const colour = colours[r]!;
            const king = game.discardPile.createCard(suit, colour, Rank.King);
            king.faceUp = false;
            game.cards.push(king);
            game.discardPile.push(king);
        }

        // Verify that win condition triggers
        expect((game as any).doGetWon_()).toBe(true);

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
