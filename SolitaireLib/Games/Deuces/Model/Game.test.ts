import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('Deuces Game Model', () => {
    let game: Game;

    const clearPile = (pile: Pile) => {
        const tempPile = new Pile(game);
        while (pile.length > 0) {
            tempPile.push(pile.peek()!);
        }
    };

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
        game.options.autoReveal = false;
        game.options.autoPlayStock = false;
        game.options.autoMoveToFoundation = 0;
    });

    it('should initialize and deal correctly with 8 Twos in foundations and 1 card per tableau', () => {
        // Run restart generator fully
        for (const _ of game.restart(54321)) {}

        // 10 tableau piles, 8 foundations, 1 waste, 1 stock
        expect(game.tableaux.length).toBe(10);
        expect(game.foundations.length).toBe(8);
        expect(game.waste).toBeDefined();
        expect(game.stock).toBeDefined();

        // 8 foundations should each have exactly 1 card, and that card should be a Two
        for (let i = 0; i < 8; i++) {
            expect(game.foundations[i].length).toBe(1);
            expect(game.foundations[i].peek()?.rank).toBe(Rank.Two);
            expect(game.foundations[i].peek()?.faceUp).toBe(true);
        }

        // 10 tableaus should each have exactly 1 card, all face up
        for (let i = 0; i < 10; i++) {
            expect(game.tableaux[i].length).toBe(1);
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
        }

        // Remaining cards in stock: 104 - 8 (foundations) - 10 (tableaux) = 86 cards
        expect(game.stock.length).toBe(86);
        for (let i = 0; i < game.stock.length; i++) {
            expect(game.stock.at(i).faceUp).toBe(false);
        }
    });

    it('should follow correct building rules with same-suit restriction', () => {
        // Run restart generator
        for (const _ of game.restart(54321)) {}

        // Clear tableaux[0] and waste
        clearPile(game.tableaux[0]);
        clearPile(game.waste);

        // Tableau build down test: Spade 3 should accept Spade 2
        const spade3 = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Three);
        spade3.faceUp = true;

        const spade2 = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Two);
        spade2.faceUp = true;

        expect((game as any).isTableauxDrop_(spade2, game.tableaux[0])).toBe(true);

        // Tableau build down test: Spade 3 should NOT accept Heart 2 (wrong suit)
        clearPile(game.waste);
        const heart2 = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Two);
        heart2.faceUp = true;
        expect((game as any).isTableauxDrop_(heart2, game.tableaux[0])).toBe(false);

        // Tableau building down circular wraparound: Spade 2 should accept Spade Ace
        clearPile(game.tableaux[0]);
        clearPile(game.waste);
        const spade2base = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Two);
        spade2base.faceUp = true;
        const spadeAce = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        spadeAce.faceUp = true;
        expect((game as any).isTableauxDrop_(spadeAce, game.tableaux[0])).toBe(true);

        // Tableau building down circular wraparound: Spade Ace should accept Spade King
        clearPile(game.tableaux[0]);
        clearPile(game.waste);
        const spadeAceBase = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Ace);
        spadeAceBase.faceUp = true;
        const spadeKing = game.waste.createCard(Suit.Spades, Colour.Black, Rank.King);
        spadeKing.faceUp = true;
        expect((game as any).isTableauxDrop_(spadeKing, game.tableaux[0])).toBe(true);

        // Foundation build up test: Spade 2 should accept Spade 3
        clearPile(game.foundations[0]);
        clearPile(game.waste);
        const spade2f = game.foundations[0].createCard(Suit.Spades, Colour.Black, Rank.Two);
        spade2f.faceUp = true;
        const spade3f = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Three);
        spade3f.faceUp = true;
        expect((game as any).isFoundationDrop_(spade3f, game.foundations[0])).toBe(true);

        // Foundation build up circular wraparound: Spade King should accept Spade Ace
        clearPile(game.foundations[0]);
        clearPile(game.waste);
        const spadeKingf = game.foundations[0].createCard(Suit.Spades, Colour.Black, Rank.King);
        spadeKingf.faceUp = true;
        const spadeAcef = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        spadeAcef.faceUp = true;
        expect((game as any).isFoundationDrop_(spadeAcef, game.foundations[0])).toBe(true);
    });

    it('should automatically refill empty tableau from waste first, and stock second', () => {
        // Run restart generator
        for (const _ of game.restart(54321)) {}

        // Setup: clear tableaux[0] and waste
        clearPile(game.tableaux[0]);
        clearPile(game.waste);

        // Put a card in waste
        const wasteCard = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Five);
        wasteCard.faceUp = true;

        // Run auto-moves
        for (const _ of (game as any).doAutoMoves_()) {}

        // Empty tableaux[0] should be refilled with the top waste card
        expect(game.tableaux[0].length).toBe(1);
        expect(game.tableaux[0].peek()).toBe(wasteCard);
        expect(game.waste.length).toBe(0);

        // Setup: clear tableaux[0] again, waste is already empty
        clearPile(game.tableaux[0]);
        const topOfStock = game.stock.peek();

        // Run auto-moves
        for (const _ of (game as any).doAutoMoves_()) {}

        // Empty tableaux[0] should be refilled with the top stock card
        expect(game.tableaux[0].length).toBe(1);
        expect(game.tableaux[0].peek()).toBe(topOfStock);
        expect(topOfStock?.faceUp).toBe(true);
    });

    it('should detect win condition correctly', () => {
        expect((game as any).doGetWon_()).toBe(false);

        // Fill all 8 foundations to 13 cards each
        for (let i = 0; i < game.cards.length; i++) {
            game.foundations[i % 8].push(game.cards[i]);
        }

        expect((game as any).doGetWon_()).toBe(true);

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
