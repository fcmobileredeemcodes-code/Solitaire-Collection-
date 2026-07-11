import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Rank } from '~CardLib/Model/Rank';
import { Pile } from '~CardLib/Model/Pile';

describe('BakersGame Game Model', () => {
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
        expect(game.tableaux.length).toBe(8);
        expect(game.cards.length).toBe(52);
    });

    it('should deal all 52 cards face up correctly on restart', () => {
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        for (let i = 0; i < 4; ++i) {
            expect(game.tableaux[i].length).toBe(7);
        }
        for (let i = 4; i < 8; ++i) {
            expect(game.tableaux[i].length).toBe(6);
        }

        for (const card of game.cards) {
            expect(card.faceUp).toBe(true);
        }

        for (const fc of game.freecells) {
            expect(fc.length).toBe(0);
        }
        for (const fd of game.foundations) {
            expect(fd.length).toBe(0);
        }
    });

    it('should respect BakersGame dragging and dropping rules (same suit building down)', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];
        const fc0 = game.freecells[0];

        const s7 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7.faceUp = true;
        game.cards.push(s7);

        // Seven of Spades -> Six of Spades is a valid sequence (same suit!)
        const s6 = t0.createCard(Suit.Spades, Colour.Black, Rank.Six);
        s6.faceUp = true;
        game.cards.push(s6);

        expect(game.canDrag(s7).canDrag).toBe(true);
        expect(game.canDrag(s7).extraCards.length).toBe(1);
        expect(game.canDrag(s7).extraCards[0]).toBe(s6);

        // Alternate color build (Six of Hearts on Seven of Spades) is NOT a valid sequence in BakersGame
        clearAllPiles(game);

        const s7_2 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7_2.faceUp = true;
        game.cards.push(s7_2);

        const h6 = t0.createCard(Suit.Hearts, Colour.Red, Rank.Six);
        h6.faceUp = true;
        game.cards.push(h6);

        // Sequence is not valid because suits are different
        expect(game.canDrag(s7_2).canDrag).toBe(false);

        // Free cell dropping still works the same
        expect(game.canDrag(h6).canDrag).toBe(true);
        const canDropFC = game.previewDrop(h6, fc0);
        expect(canDropFC).toBe(true);

        fc0.push(h6);
        expect(fc0.length).toBe(1);
        expect(t0.length).toBe(1);

        expect(game.canDrag(h6).canDrag).toBe(true);
        expect(game.canDrag(h6).extraCards.length).toBe(0);
    });

    it('should calculate valid sequence move limits mathematically', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];

        // Place a long valid sequence on t0
        // s8 -> s7 -> s6 -> s5 (length 4, all Spades)
        const s8 = t0.createCard(Suit.Spades, Colour.Black, Rank.Eight);
        s8.faceUp = true;
        game.cards.push(s8);

        const s7 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7.faceUp = true;
        game.cards.push(s7);

        const s6 = t0.createCard(Suit.Spades, Colour.Black, Rank.Six);
        s6.faceUp = true;
        game.cards.push(s6);

        const s5 = t0.createCard(Suit.Spades, Colour.Black, Rank.Five);
        s5.faceUp = true;
        game.cards.push(s5);

        // Place a target of the same suit on t1 (s9)
        const s9 = t1.createCard(Suit.Spades, Colour.Black, Rank.Nine);
        s9.faceUp = true;
        game.cards.push(s9);

        // With 4 empty free cells and 6 other empty tableaux (excluding t0, t1),
        // maxMove = (4 + 1) * 2^6 = 320 cards. So sequence of 4 is allowed.
        expect(game.previewDrop(s8, t1)).toBe(true);

        // Now fill all freecells so 0 empty freecells are left
        for (let i = 0; i < 4; ++i) {
            const fc = game.freecells[i];
            const dummy = fc.createCard(Suit.Spades, Colour.Black, Rank.Ace);
            dummy.faceUp = true;
            game.cards.push(dummy);
        }

        // Fill 6 other empty tableaux so they are not empty (tableaux 2 to 7)
        for (let i = 2; i < 8; ++i) {
            const t = game.tableaux[i];
            const dummy = t.createCard(Suit.Spades, Colour.Black, Rank.Ace);
            dummy.faceUp = true;
            game.cards.push(dummy);
        }

        // Now emptyFreeCells = 0, emptyTableaux = 0
        // maxMove = (0 + 1) * 2^0 = 1 card.
        // Moving sequence of 4 cards should be disallowed!
        expect(game.previewDrop(s8, t1)).toBe(false);

        // Create a spade target for s5 (s6)
        const s6_target = t1.createCard(Suit.Spades, Colour.Black, Rank.Six);
        s6_target.faceUp = true;
        game.cards.push(s6_target);
        expect(game.previewDrop(s5, t1)).toBe(true); // Spades 5 onto Spades 6, length 1, maxMove = 1. Valid!
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
            }
        }

        // Trigger win evaluation
        expect((game as any).doGetWon_()).toBe(true);
    });
});
