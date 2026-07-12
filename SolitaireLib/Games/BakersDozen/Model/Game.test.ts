import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { Colour } from "~CardLib/Model/Colour";
import { Rank } from "~CardLib/Model/Rank";
import { Pile } from "~CardLib/Model/Pile";

describe("BakersDozen Game Model", () => {
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
        const params = new URLSearchParams("autoMoveToFoundation=0");
        game = new Game(new GameOptions(params));
    });

    it("should initialize correctly", () => {
        expect(game.tableaux.length).toBe(13);
        expect(game.foundations.length).toBe(4);
        expect(game.cards.length).toBe(52);
    });

    it("should deal cards correctly on restart and satisfy the special King rule", () => {
        const restartGen = game.restart(12345);
        let result = restartGen.next();
        while (!result.done) {
            result = restartGen.next();
        }

        // 13 tableau columns of 4 cards each = 52 cards
        for (let i = 0; i < 13; ++i) {
            expect(game.tableaux[i].length).toBe(4);
        }

        for (const card of game.cards) {
            expect(card.faceUp).toBe(true);
        }

        for (const fd of game.foundations) {
            expect(fd.length).toBe(0);
        }

        // SPECIAL DEAL RULE assertion:
        // No card ever starts out buried directly beneath a King.
        // This means if a card at index `i` in a tableau is a King,
        // then any card below it (index `j < i`) must also be a King.
        for (const tableau of game.tableaux) {
            for (let i = 0; i < tableau.length; ++i) {
                if (tableau.at(i).rank === Rank.King) {
                    for (let j = 0; j < i; ++j) {
                        expect(tableau.at(j).rank).toBe(Rank.King);
                    }
                }
            }
        }
    });

    it("should respect BakersDozen dragging and dropping rules (single card, build down regardless of suit)", () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];

        const s7 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7.faceUp = true;
        game.cards.push(s7);

        const h6 = t0.createCard(Suit.Hearts, Colour.Red, Rank.Six);
        h6.faceUp = true;
        game.cards.push(h6);

        // Only the top (exposed) card can be dragged
        expect(game.canDrag(h6).canDrag).toBe(true);
        expect(game.canDrag(h6).extraCards.length).toBe(0);

        // Cannot drag s7 because h6 is on top of it (no group moves)
        expect(game.canDrag(s7).canDrag).toBe(false);

        // Try putting a club 5 onto heart 6 (build down regardless of suit)
        const c5 = t1.createCard(Suit.Clubs, Colour.Black, Rank.Five);
        c5.faceUp = true;
        game.cards.push(c5);

        // can drop c5 (rank 5) onto h6 (rank 6)
        expect(game.previewDrop(c5, t0)).toBe(true);

        // Try putting a club 7 onto heart 6 (invalid build direction)
        const c7 = t1.createCard(Suit.Clubs, Colour.Black, Rank.Seven);
        c7.faceUp = true;
        game.cards.push(c7);
        expect(game.previewDrop(c7, t0)).toBe(false);
    });

    it("should NEVER allow refilling empty tableau columns", () => {
        clearAllPiles(game);

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];

        const s7 = t0.createCard(Suit.Spades, Colour.Black, Rank.Seven);
        s7.faceUp = true;
        game.cards.push(s7);

        // t1 is currently empty. We cannot drop s7 onto t1 because empty columns cannot be refilled.
        expect(game.previewDrop(s7, t1)).toBe(false);
    });

    it("should support building up foundations by suit, Ace to King", () => {
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

        // Diamonds Two cannot build on Hearts Ace (must match suit)
        const d2 = t0.createCard(Suit.Diamonds, Colour.Red, Rank.Two);
        d2.faceUp = true;
        game.cards.push(d2);
        expect(game.previewDrop(d2, fd0)).toBe(false);
    });

    it("should reach won condition when all 52 cards are in foundations", () => {
        clearAllPiles(game);
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
                // Since this is manually pushed and we want game won checks to pass correctly,
                // we should push to game.cards too
                game.cards.push(card);
            }
        }

        // Trigger win evaluation
        expect((game as any).doGetWon_()).toBe(true);
    });
});
