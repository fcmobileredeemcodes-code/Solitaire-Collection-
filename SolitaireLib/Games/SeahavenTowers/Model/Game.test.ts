import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Rank } from '~CardLib/Model/Rank';
import { Pile } from '~CardLib/Model/Pile';

describe('SeahavenTowers Game Model', () => {
    let game: Game;

    const clearAllPiles = (g: Game) => {
        g.cards = [];
        const tempPile = new Pile(g);
        for (const p of g.piles) {
            while (p.length > 0) {
                tempPile.push(p.peek()!);
            }
        }
    };

    beforeEach(() => {
        const params = new URLSearchParams('autoMoveToFoundation=0');
        game = new Game(new GameOptions(params));
    });

    it('should initialize correctly', () => {
        expect(game.freecells.length).toBe(4);
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(10);
        expect(game.cards.length).toBe(52);
    });

    it('should deal cards correctly on restart', () => {
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        // 10 tableaux of 5 cards each = 50 cards
        for (let i = 0; i < 10; ++i) {
            expect(game.tableaux[i].length).toBe(5);
        }

        // 2 pre-occupied freecells with 1 card each
        expect(game.freecells[0].length).toBe(0);
        expect(game.freecells[1].length).toBe(1);
        expect(game.freecells[2].length).toBe(1);
        expect(game.freecells[3].length).toBe(0);

        for (const card of game.cards) {
            expect(card.faceUp).toBe(true);
        }

        for (const fd of game.foundations) {
            expect(fd.length).toBe(0);
        }
    });

    it('should respect dragging and dropping rules', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];
        const fc0 = game.freecells[0];

        const s7 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7.faceUp = true;
        game.cards.push(s7);

        const s6 = t0.createCard(Suit.Spades, Colour.Black, Rank.Six);
        s6.faceUp = true;
        game.cards.push(s6);

        // Same suit sequence should be draggable as a unit
        expect(game.canDrag(s7).canDrag).toBe(true);
        expect(game.canDrag(s7).extraCards.length).toBe(1);
        expect(game.canDrag(s7).extraCards[0]).toBe(s6);

        // Cannot build different suit
        const h5 = t1.createCard(Suit.Hearts, Colour.Red, Rank.Five);
        h5.faceUp = true;
        game.cards.push(h5);
        expect(game.previewDrop(s6, t1)).toBe(false);

        // Can drop single card on empty free cell
        expect(game.previewDrop(s6, fc0)).toBe(true);
        // Cannot drop a sequence on empty free cell
        expect(game.previewDrop(s7, fc0)).toBe(false);
    });

    it('should respect empty tableau King constraint', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];

        const s7 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7.faceUp = true;
        game.cards.push(s7);

        const t1 = game.tableaux[1]; // empty

        // Cannot drop Seven of Spades on empty tableau column
        expect(game.previewDrop(s7, t1)).toBe(false);

        const kSpades = t0.createCard(Suit.Spades, Colour.Black, Rank.King);
        kSpades.faceUp = true;
        game.cards.push(kSpades);

        // Can drop King of Spades on empty tableau column
        expect(game.previewDrop(kSpades, t1)).toBe(true);
    });

    it('should enforce sequence move limits based on empty free cells', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];

        // Create a same-suit sequence: Spades 10 -> 9 -> 8 -> 7 (length 4)
        const s10 = t0.createCard(Suit.Spades, Colour.Black, Rank.Ten);
        s10.faceUp = true;
        game.cards.push(s10);

        const s9 = t0.createCard(Suit.Spades, Colour.Black, Rank.Nine);
        s9.faceUp = true;
        game.cards.push(s9);

        const s8 = t0.createCard(Suit.Spades, Colour.Black, Rank.Eight);
        s8.faceUp = true;
        game.cards.push(s8);

        const s7 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7.faceUp = true;
        game.cards.push(s7);

        // target card: Spades Jack
        const sJ = t1.createCard(Suit.Spades, Colour.Black, Rank.Jack);
        sJ.faceUp = true;
        game.cards.push(sJ);

        // All 4 free cells are empty: emptyFreeCells = 4, maxMove = 1 + 4 = 5.
        // Sequence of size 4 should be allowed.
        expect(game.previewDrop(s10, t1)).toBe(true);

        // Now pre-occupy three free cells with dummy cards so only 1 empty free cell is left:
        for (let i = 0; i < 3; ++i) {
            const fc = game.freecells[i];
            const dummy = fc.createCard(Suit.Spades, Colour.Black, Rank.Ace);
            dummy.faceUp = true;
            game.cards.push(dummy);
        }

        // Now emptyFreeCells = 1, maxMove = 1 + 1 = 2.
        // Moving sequence of size 4 should be disallowed!
        expect(game.previewDrop(s10, t1)).toBe(false);

        // Moving sequence of size 2 (s8 -> s7) onto s9 should be allowed:
        expect(game.previewDrop(s8, t0)).toBe(false); // cannot drop on itself
        // Let's create a temporary Spades Nine target in t2
        const t2 = game.tableaux[2];
        const target9 = t2.createCard(Suit.Spades, Colour.Black, Rank.Nine);
        target9.faceUp = true;
        game.cards.push(target9);

        // Size 2 sequence (s8 -> s7) onto target9 (Spades Nine) is allowed
        expect(game.previewDrop(s8, t2)).toBe(true);
    });

    it('should support dropping of Aces and building up foundations', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const fd0 = game.foundations[0];

        const ace = t0.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
        ace.faceUp = true;
        game.cards.push(ace);

        // Can drop Ace to empty foundation
        expect(game.previewDrop(ace, fd0)).toBe(true);

        // Move it
        fd0.push(ace);

        // Hearts Two can build on top of Hearts Ace
        const h2 = t0.createCard(Suit.Hearts, Colour.Red, Rank.Two);
        h2.faceUp = true;
        game.cards.push(h2);
        expect(game.previewDrop(h2, fd0)).toBe(true);

        // Diamonds Two cannot build on Hearts Ace
        const d2 = t0.createCard(Suit.Diamonds, Colour.Red, Rank.Two);
        d2.faceUp = true;
        game.cards.push(d2);
        expect(game.previewDrop(d2, fd0)).toBe(false);
    });

    it('should reach won condition when all 52 cards are in foundations', () => {
        expect(game.won).toBe(false);

        // Fill foundations with 52 cards (13 each)
        for (let f = 0; f < 4; ++f) {
            const fd = game.foundations[f];
            const suit = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs][f]!;
            const colour = [Colour.Black, Colour.Red, Colour.Red, Colour.Black][f]!;
            const ranks = [
                Rank.Ace, Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six,
                Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King
            ];
            for (const r of ranks) {
                const card = fd.createCard(suit, colour, r);
                card.faceUp = true;
                game.cards.push(card);
            }
        }

        // Trigger win evaluation
        expect((game as any).doGetWon_()).toBe(true);
    });
});
