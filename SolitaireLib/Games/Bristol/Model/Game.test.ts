import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('Bristol Game Model', () => {
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

    it('should initialize correctly with 8 tableaux, 4 foundations, stock, and 3 waste piles', () => {
        expect(game.stock).toBeDefined();
        expect(game.waste0).toBeDefined();
        expect(game.waste1).toBeDefined();
        expect(game.waste2).toBeDefined();
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(8);
        expect(game.won).toBe(false);
    });

    it('should deal 3 face-up cards to each of the 8 tableaux on restart', () => {
        // Disable automatic moves to foundations to keep tableaux sizes at exactly 3
        game.options.autoMoveToFoundation = 0;
        game.options.autoReveal = false;

        // We consume the restart generator completely
        Array.from(game.restart(12345));

        expect(game.stock.length).toBe(28); // 52 - 8 * 3 = 28
        for (let i = 0; i < 8; ++i) {
            expect(game.tableaux[i]!.length).toBe(3);
            for (let j = 0; j < 3; ++j) {
                expect(game.tableaux[i]!.at(j).faceUp).toBe(true);
            }
        }
    });

    it('should draw 1 card to each waste pile from stock when stock is clicked', () => {
        // Disable automatic moves to foundation during test
        game.options.autoMoveToFoundation = 0;
        game.options.autoReveal = false;

        Array.from(game.restart(12345));
        expect(game.stock.length).toBe(28);
        expect(game.waste0.length).toBe(0);
        expect(game.waste1.length).toBe(0);
        expect(game.waste2.length).toBe(0);

        // Click top card of stock to trigger drawing
        const topStock = game.stock.peek();
        expect(topStock).toBeDefined();

        Array.from((game as any).cardPrimary_(topStock));
        expect(game.stock.length).toBe(25);
        expect(game.waste0.length).toBe(1);
        expect(game.waste1.length).toBe(1);
        expect(game.waste2.length).toBe(1);

        expect(game.waste0.peek()!.faceUp).toBe(true);
        expect(game.waste1.peek()!.faceUp).toBe(true);
        expect(game.waste2.peek()!.faceUp).toBe(true);
    });

    it('should allow building down regardless of suit on tableaux', () => {
        game.options.autoMoveToFoundation = 0;
        game.options.autoReveal = false;

        Array.from(game.restart(12345));

        // Clear tableaux and setup cards
        for (const t of game.tableaux) {
            clearPile(t);
        }

        // Tableau 0: Ten of Spades
        const c1 = game.tableaux[0]!.createCard(Suit.Spades, Colour.Black, Rank.Ten);
        c1.faceUp = true;

        // Tableau 1: Nine of Hearts
        const c2 = game.tableaux[1]!.createCard(Suit.Hearts, Colour.Red, Rank.Nine);
        c2.faceUp = true;

        // Nine of Hearts (c2) should be allowed on Ten of Spades (c1)
        const canDrop = (game as any).previewDrop_(c2, game.tableaux[0]!);
        expect(canDrop).toBe(true);
    });

    it('should NOT allow empty tableaux to be refilled', () => {
        game.options.autoMoveToFoundation = 0;
        game.options.autoReveal = false;

        Array.from(game.restart(12345));

        // Empty Tableau 0
        clearPile(game.tableaux[0]!);

        // Tableau 1: King of Clubs
        const c2 = game.tableaux[1]!.createCard(Suit.Clubs, Colour.Black, Rank.King);
        c2.faceUp = true;

        // Cannot drop on empty tableau
        const canDrop = (game as any).previewDrop_(c2, game.tableaux[0]!);
        expect(canDrop).toBe(false);
    });

    it('should allow building up by suit from Ace to King on foundations', () => {
        game.options.autoMoveToFoundation = 0;
        game.options.autoReveal = false;

        Array.from(game.restart(12345));

        // Empty foundations
        const f0 = game.foundations[0]!;
        clearPile(f0);

        // Card: Ace of Spades
        const ace = game.tableaux[0]!.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        ace.faceUp = true;

        // Should allow Ace on empty foundation
        expect((game as any).previewDrop_(ace, f0)).toBe(true);

        // Put Ace on foundation
        f0.push(ace);

        // Card: Two of Spades
        const twoSpades = game.tableaux[1]!.createCard(Suit.Spades, Colour.Black, Rank.Two);
        twoSpades.faceUp = true;

        // Card: Two of Hearts
        const twoHearts = game.tableaux[2]!.createCard(Suit.Hearts, Colour.Red, Rank.Two);
        twoHearts.faceUp = true;

        // Should allow Two of Spades on Ace of Spades
        expect((game as any).previewDrop_(twoSpades, f0)).toBe(true);

        // Should NOT allow Two of Hearts on Ace of Spades
        expect((game as any).previewDrop_(twoHearts, f0)).toBe(false);
    });

    it('should evaluate won when all 52 cards are on foundations', () => {
        game.options.autoMoveToFoundation = 0;
        game.options.autoReveal = false;

        Array.from(game.restart(12345));
        expect(game.won).toBe(false);

        // Move all 52 cards to foundations to mock win
        for (let i = 0; i < game.piles.length; ++i) {
            const pile = game.piles[i]!;
            if (game.foundations.indexOf(pile) >= 0) continue;
            while (pile.length > 0) {
                const card = pile.peek()!;
                game.foundations[0]!.push(card);
            }
        }

        // Explicitly check won_ as mutating piles directly doesn't automatically trigger it in some cases
        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
