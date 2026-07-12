import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Rank } from '~CardLib/Model/Rank';
import { Pile } from '~CardLib/Model/Pile';

describe('Penguin Game Model', () => {
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
        expect(game.tableaux.length).toBe(7);
        expect(game.flippers.length).toBe(7);
        expect(game.foundations.length).toBe(4);
        expect(game.cards.length).toBe(52);
    });

    it('should deal cards correctly on restart', () => {
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        // The beak card is bottom of tableaux[0]
        const beakCard = game.tableaux[0].at(0);
        expect(beakCard).toBeDefined();
        const beakRank = game.beakRank;
        expect(beakRank).toBe(beakCard!.rank);

        // Every tableau has exactly 7 cards
        for (let i = 0; i < 7; ++i) {
            expect(game.tableaux[i].length).toBe(7);
        }

        // 3 foundations have exactly 1 card each of beakRank
        let beakRankInFoundationsCount = 0;
        for (const fd of game.foundations) {
            if (fd.length > 0) {
                expect(fd.length).toBe(1);
                expect(fd.peek()!.rank).toBe(beakRank);
                beakRankInFoundationsCount++;
            }
        }
        expect(beakRankInFoundationsCount).toBe(3);

        // Total cards: 49 in tableaux + 3 in foundations = 52
        let totalCards = 0;
        for (const t of game.tableaux) {
            totalCards += t.length;
        }
        for (const f of game.foundations) {
            totalCards += f.length;
        }
        expect(totalCards).toBe(52);

        // All cards are faceUp
        for (const card of game.cards) {
            expect(card.faceUp).toBe(true);
        }

        // All flippers are empty
        for (const fc of game.flippers) {
            expect(fc.length).toBe(0);
        }
    });

    it('should build tableaux down in suit wrapping cyclically', () => {
        clearAllPiles(game);

        // Set up the beak rank dynamically (since no cards exist, let's create a foundation bottom or tableaux bottom)
        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];

        // Create Ace of Spades on t0 as the bottom card so the beak rank is Ace (r1).
        const sA = t0.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        sA.faceUp = true;
        game.cards.push(sA);
        expect(game.beakRank).toBe(Rank.Ace);

        // Create Spades King on t1. Spades King (Rank.King) should be able to build on Spades Ace (Rank.Ace)
        const sK = t1.createCard(Suit.Spades, Colour.Black, Rank.King);
        sK.faceUp = true;
        game.cards.push(sK);

        expect(game.previewDrop(sK, t0)).toBe(true); // King builds on Ace (same suit, cyclic build down)

        // Diamonds King should NOT build on Spades Ace
        const dK = t1.createCard(Suit.Diamonds, Colour.Red, Rank.King);
        dK.faceUp = true;
        game.cards.push(dK);
        expect(game.previewDrop(dK, t0)).toBe(false); // Suit mismatch

        // Spades Queen builds on Spades King
        const sQ = t1.createCard(Suit.Spades, Colour.Black, Rank.Queen);
        sQ.faceUp = true;
        game.cards.push(sQ);

        t0.push(sK);
        expect(game.previewDrop(sQ, t0)).toBe(true); // Queen builds on King
    });

    it('should only fill empty tableaux with rank exactly one below the beak', () => {
        clearAllPiles(game);

        // Set beak rank as Ten by placing Ten of Spades at bottom of tableaux[0]
        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];

        const s10 = t0.createCard(Suit.Spades, Colour.Black, Rank.Ten);
        s10.faceUp = true;
        game.cards.push(s10);
        expect(game.beakRank).toBe(Rank.Ten);

        // Empty tableaux[1] can only accept Nine (one below Ten)
        const s9 = t0.createCard(Suit.Spades, Colour.Black, Rank.Nine);
        s9.faceUp = true;
        game.cards.push(s9);

        const s8 = t0.createCard(Suit.Spades, Colour.Black, Rank.Eight);
        s8.faceUp = true;
        game.cards.push(s8);

        expect(game.previewDrop(s9, t1)).toBe(true); // Nine can fill empty tableau
        expect(game.previewDrop(s8, t1)).toBe(false); // Eight cannot fill empty tableau
    });

    it('should allow dragging sequence with no flipper limits', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];

        // Beak rank Ace
        const sA = t0.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        sA.faceUp = true;
        game.cards.push(sA);

        const sK = t0.createCard(Suit.Spades, Colour.Black, Rank.King);
        sK.faceUp = true;
        game.cards.push(sK);

        const sQ = t0.createCard(Suit.Spades, Colour.Black, Rank.Queen);
        sQ.faceUp = true;
        game.cards.push(sQ);

        const sJ = t0.createCard(Suit.Spades, Colour.Black, Rank.Jack);
        sJ.faceUp = true;
        game.cards.push(sJ);

        // Dragging sK should also drag sQ and sJ (sequence of length 3)
        expect(game.canDrag(sK).canDrag).toBe(true);
        expect(game.canDrag(sK).extraCards.length).toBe(2);
        expect(game.canDrag(sK).extraCards[0]).toBe(sQ);
        expect(game.canDrag(sK).extraCards[1]).toBe(sJ);

        // Fill all flippers completely
        for (let i = 0; i < 7; ++i) {
            const fc = game.flippers[i];
            const dummy = fc.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
            dummy.faceUp = true;
            game.cards.push(dummy);
        }

        // Create target on t1
        const sA2 = t1.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        sA2.faceUp = true;
        game.cards.push(sA2);

        // Even with all flippers full, complete sequence can move to valid target on t1
        expect(game.previewDrop(sK, t1)).toBe(true);
    });

    it('should build foundations up from beak rank wrapping cyclically', () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const fd0 = game.foundations[0];

        // Beak rank is King
        const sK = t0.createCard(Suit.Spades, Colour.Black, Rank.King);
        sK.faceUp = true;
        game.cards.push(sK);
        expect(game.beakRank).toBe(Rank.King);

        // Empty foundation accepts King of Spades
        expect(game.previewDrop(sK, fd0)).toBe(true);
        fd0.push(sK);

        // King of Spades built on, next is Ace of Spades (up wrapping)
        const sA = t0.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        sA.faceUp = true;
        game.cards.push(sA);
        expect(game.previewDrop(sA, fd0)).toBe(true);
        fd0.push(sA);

        // Spades Ace built on, next is Spades Two
        const s2 = t0.createCard(Suit.Spades, Colour.Black, Rank.Two);
        s2.faceUp = true;
        game.cards.push(s2);
        expect(game.previewDrop(s2, fd0)).toBe(true);
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
