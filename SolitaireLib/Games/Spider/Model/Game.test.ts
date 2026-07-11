import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('Spider Game Model', () => {
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

    it('should initialize and deal correctly (scenario a)', () => {
        // Disable automatic behaviors to keep initial deal deterministic and clean
        game.options.autoReveal = false;

        // Run restart generator
        Array.from(game.restart(12345));

        // 10 tableau piles, 8 foundations, 1 stock
        expect(game.tableaux.length).toBe(10);
        expect(game.foundations.length).toBe(8);
        expect(game.stock).toBeDefined();

        // 54 cards dealt initially across 10 tableaux:
        // first 4 get 6 cards, remaining 6 get 5 cards.
        let totalDealt = 0;
        for (let i = 0; i < 10; i++) {
            const pile = game.tableaux[i];
            const expectedCount = i < 4 ? 6 : 5;
            expect(pile.length).toBe(expectedCount);
            totalDealt += pile.length;

            // Only top card is face up, the rest are face down
            for (let j = 0; j < expectedCount - 1; j++) {
                expect(pile.at(j).faceUp).toBe(false);
            }
            expect(pile.peek()?.faceUp).toBe(true);
        }
        expect(totalDealt).toBe(54);

        // Remaining 104 - 54 = 50 cards are in stock
        expect(game.stock.length).toBe(50);
        for (let i = 0; i < game.stock.length; i++) {
            expect(game.stock.at(i).faceUp).toBe(false);
        }
    });

    it('should only allow dragging single cards or perfect same-suit descending sequences (scenario b)', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        // Clear tableaux[0]
        clearPile(game.tableaux[0]);

        // Build a same-suit descending sequence on tableaux[0]
        const s8 = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Eight);
        const s7 = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Seven);
        const s6 = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Six);

        s8.faceUp = true;
        s7.faceUp = true;
        s6.faceUp = true;

        game.cards.push(s8, s7, s6);
        game.tableaux[0].push(s8);
        game.tableaux[0].push(s7);
        game.tableaux[0].push(s6);

        // Dragging the whole pile starting at s8 should be allowed (same-suit, descending)
        const drag8 = game.canDrag(s8);
        expect(drag8.canDrag).toBe(true);
        expect(drag8.extraCards.length).toBe(2);
        expect(drag8.extraCards[0]).toBe(s7);
        expect(drag8.extraCards[1]).toBe(s6);

        // If sequence has different suits (e.g. Spades 8, Hearts 7, Spades 6)
        clearPile(game.tableaux[0]);
        const h7 = game.tableaux[0].createCard(Suit.Hearts, Colour.Red, Rank.Seven);
        h7.faceUp = true;
        game.cards.push(h7);

        game.tableaux[0].push(s8);
        game.tableaux[0].push(h7);
        game.tableaux[0].push(s6);

        // Dragging starting at s8 should be rejected (mixed suits)
        expect(game.canDrag(s8).canDrag).toBe(false);

        // Dragging starting at h7 should also be rejected because Spades 6 is on top of Hearts 7 (mixed suits)
        expect(game.canDrag(h7).canDrag).toBe(false);

        // Dragging s6 directly should be allowed (it is top card)
        expect(game.canDrag(s6).canDrag).toBe(true);
    });

    it('should build down regardless of suit, and fill empty spaces with any card (scenario c)', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        // Clear tableaux[0] and tableaux[1]
        clearPile(game.tableaux[0]);
        clearPile(game.tableaux[1]);

        // Place a Hearts 7 in tableaux[0]
        const h7 = game.tableaux[0].createCard(Suit.Hearts, Colour.Red, Rank.Seven);
        h7.faceUp = true;
        game.cards.push(h7);
        game.tableaux[0].push(h7);

        // Place a Spades 6 in tableaux[1] (valid drag source)
        const s6 = game.tableaux[1].createCard(Suit.Spades, Colour.Black, Rank.Six);
        s6.faceUp = true;
        game.cards.push(s6);
        game.tableaux[1].push(s6);

        // Can drop Spades 6 on Hearts 7 (builds down regardless of suit!)
        expect(game.previewDrop(s6, game.tableaux[0])).toBe(true);

        // Empty slot test: clear tableaux[0]
        clearPile(game.tableaux[0]);
        // Can drop any card (like Spades 6) on an empty tableau
        expect(game.previewDrop(s6, game.tableaux[0])).toBe(true);
    });

    it('should deal 1 card face up to each tableau column when stock is clicked if none are empty (scenario d)', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        const initialStockLen = game.stock.length;
        const initialLengths = game.tableaux.map(t => t.length);

        // Trigger deal from stock
        Array.from((game as any).doDrawFromStock_());

        // Stock decreased by 10
        expect(game.stock.length).toBe(initialStockLen - 10);

        // Every tableau has 1 more card, and it is face up
        for (let i = 0; i < 10; i++) {
            expect(game.tableaux[i].length).toBe(initialLengths[i] + 1);
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
        }

        // Empty tableau constraint: if one tableau is empty, we should not be able to draw from stock
        clearPile(game.tableaux[0]);
        expect((game as any).canDrawFromStock_()).toBe(false);
    });

    it('should automatically clear complete King-to-Ace same-suit sequences to foundation (scenario e)', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        // Let's clear tableaux[0] and put a complete sequence of Spades King to Ace
        clearPile(game.tableaux[0]);
        const seqCards = [];
        for (let r = 13; r >= 1; r--) {
            // Rank values map from King (13) to Ace (1)
            let rank: Rank;
            if (r === 13) rank = Rank.King;
            else if (r === 12) rank = Rank.Queen;
            else if (r === 11) rank = Rank.Jack;
            else if (r === 10) rank = Rank.Ten;
            else if (r === 9) rank = Rank.Nine;
            else if (r === 8) rank = Rank.Eight;
            else if (r === 7) rank = Rank.Seven;
            else if (r === 6) rank = Rank.Six;
            else if (r === 5) rank = Rank.Five;
            else if (r === 4) rank = Rank.Four;
            else if (r === 3) rank = Rank.Three;
            else if (r === 2) rank = Rank.Two;
            else rank = Rank.Ace;

            const card = game.tableaux[0].createCard(Suit.Spades, Colour.Black, rank);
            card.faceUp = true;
            game.cards.push(card);
            game.tableaux[0].push(card);
            seqCards.push(card);
        }

        // Initially foundations are empty
        expect(game.foundations[0].length).toBe(0);

        // Run autoMoves to detect and transfer the completed sequence
        Array.from((game as any).doAutoMoves_());

        // Foundation 0 should now have the 13 cards of the completed sequence!
        expect(game.foundations[0].length).toBe(13);
        expect(game.tableaux[0].length).toBe(0);
    });

    it('should detect win when all 104 cards are in foundations (scenario f)', () => {
        expect((game as any).doGetWon_()).toBe(false);

        // Put all cards into foundations
        for (let i = 0; i < game.cards.length; i++) {
            // Divide 104 cards evenly into 8 foundations (13 cards each)
            game.foundations[i % 8].push(game.cards[i]);
        }

        expect((game as any).doGetWon_()).toBe(true);

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
