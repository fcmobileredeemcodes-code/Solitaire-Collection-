import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('Gypsy Game Model', () => {
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
        // Disable automatic behaviors
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;

        // Run restart generator
        Array.from(game.restart(12345));

        // 8 tableau piles, 8 foundations, 1 stock
        expect(game.tableaux.length).toBe(8);
        expect(game.foundations.length).toBe(8);
        expect(game.stock).toBeDefined();

        // 16 cards dealt initially across 8 tableaux (2 each)
        let totalDealt = 0;
        for (let i = 0; i < 8; i++) {
            const pile = game.tableaux[i];
            expect(pile.length).toBe(2);
            totalDealt += pile.length;

            // Card 0 (bottom) is face down, Card 1 (top) is face up
            expect(pile.at(0).faceUp).toBe(false);
            expect(pile.at(1).faceUp).toBe(true);
        }
        expect(totalDealt).toBe(16);

        // Remaining 104 - 16 = 88 cards are in stock
        expect(game.stock.length).toBe(88);
        for (let i = 0; i < game.stock.length; i++) {
            expect(game.stock.at(i).faceUp).toBe(false);
        }
    });

    it('should build down on tableaus in alternating colors', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        // Clear tableaux[0] and tableaux[1]
        clearPile(game.tableaux[0]);
        clearPile(game.tableaux[1]);

        // Place a Hearts 7 in tableaux[0]
        const heart7 = game.tableaux[0].createCard(Suit.Hearts, Colour.Red, Rank.Seven);
        heart7.faceUp = true;
        game.cards.push(heart7);
        game.tableaux[0].push(heart7);

        // Place a Spades 6 in tableaux[1] (valid drag source)
        const spade6 = game.tableaux[1].createCard(Suit.Spades, Colour.Black, Rank.Six);
        spade6.faceUp = true;
        game.cards.push(spade6);
        game.tableaux[1].push(spade6);

        // Verify that Spades 6 can be dropped on Hearts 7 (Black 6 on Red 7)
        expect((game as any).isTableauxDrop_(spade6, game.tableaux[0])).toBe(true);

        // Place a Diamonds 6 in tableaux[1]
        clearPile(game.tableaux[1]);
        const diamond6 = game.tableaux[1].createCard(Suit.Diamonds, Colour.Red, Rank.Six);
        diamond6.faceUp = true;
        game.cards.push(diamond6);
        game.tableaux[1].push(diamond6);

        // Verify that Diamonds 6 is rejected (Red 6 on Red 7)
        expect((game as any).isTableauxDrop_(diamond6, game.tableaux[0])).toBe(false);
    });

    it('should allow empty tableau spaces to be filled by any card', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        // Clear tableaux[0] and tableaux[1]
        clearPile(game.tableaux[0]);
        clearPile(game.tableaux[1]);

        // Place a King in tableaux[1]
        const kingOfClubs = game.tableaux[1].createCard(Suit.Clubs, Colour.Black, Rank.King);
        kingOfClubs.faceUp = true;
        game.cards.push(kingOfClubs);
        game.tableaux[1].push(kingOfClubs);

        // King can fill empty space
        expect((game as any).isTableauxDrop_(kingOfClubs, game.tableaux[0])).toBe(true);

        // Place a Three in tableaux[1]
        clearPile(game.tableaux[1]);
        const threeOfHearts = game.tableaux[1].createCard(Suit.Hearts, Colour.Red, Rank.Three);
        threeOfHearts.faceUp = true;
        game.cards.push(threeOfHearts);
        game.tableaux[1].push(threeOfHearts);

        // Three can also fill empty space in Gypsy!
        expect((game as any).isTableauxDrop_(threeOfHearts, game.tableaux[0])).toBe(true);
    });

    it('should move perfectly sorted sequences together as a unit', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        clearPile(game.tableaux[0]);

        // Build a perfect alternating descending sequence on tableaux[0]
        const h8 = game.tableaux[0].createCard(Suit.Hearts, Colour.Red, Rank.Eight);
        const c7 = game.tableaux[0].createCard(Suit.Clubs, Colour.Black, Rank.Seven);
        const d6 = game.tableaux[0].createCard(Suit.Diamonds, Colour.Red, Rank.Six);

        h8.faceUp = true;
        c7.faceUp = true;
        d6.faceUp = true;

        game.cards.push(h8, c7, d6);
        game.tableaux[0].push(h8);
        game.tableaux[0].push(c7);
        game.tableaux[0].push(d6);

        // Dragging the whole pile starting at h8 should be allowed
        const drag8 = game.canDrag(h8);
        expect(drag8.canDrag).toBe(true);
        expect(drag8.extraCards.length).toBe(2);
        expect(drag8.extraCards[0]).toBe(c7);
        expect(drag8.extraCards[1]).toBe(d6);

        // Dragging starting at c7 should be allowed
        const drag7 = game.canDrag(c7);
        expect(drag7.canDrag).toBe(true);
        expect(drag7.extraCards.length).toBe(1);
        expect(drag7.extraCards[0]).toBe(d6);

        // If sequence is broken (e.g., h8, c7, c6 - black on black)
        clearPile(game.tableaux[0]);
        const c6 = game.tableaux[0].createCard(Suit.Clubs, Colour.Black, Rank.Six);
        c6.faceUp = true;
        game.cards.push(c6);

        game.tableaux[0].push(h8);
        game.tableaux[0].push(c7);
        game.tableaux[0].push(c6);

        // Dragging starting at h8 should now be rejected because c7 to c6 is not alternating color
        expect(game.canDrag(h8).canDrag).toBe(false);

        // But dragging c6 directly is allowed as it is the top card
        expect(game.canDrag(c6).canDrag).toBe(true);
    });

    it('should build foundations up by suit from Ace to King', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        clearPile(game.foundations[0]);
        clearPile(game.tableaux[0]);

        // Drop Ace of Spades on empty foundation
        const aceOfSpades = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Ace);
        aceOfSpades.faceUp = true;
        game.cards.push(aceOfSpades);
        game.tableaux[0].push(aceOfSpades);

        expect((game as any).isFoundationDrop_(aceOfSpades, game.foundations[0])).toBe(true);

        // Non-Ace is rejected
        const jackOfSpades = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Jack);
        jackOfSpades.faceUp = true;
        game.cards.push(jackOfSpades);

        expect((game as any).isFoundationDrop_(jackOfSpades, game.foundations[0])).toBe(false);

        // Push Ace to foundation
        game.foundations[0].push(aceOfSpades);

        // Drop 2 of Spades on Ace of Spades
        const twoOfSpades = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Two);
        twoOfSpades.faceUp = true;
        game.cards.push(twoOfSpades);
        game.tableaux[0].push(twoOfSpades);

        expect((game as any).isFoundationDrop_(twoOfSpades, game.foundations[0])).toBe(true);

        // 2 of Hearts (wrong suit) is rejected
        const twoOfHearts = game.tableaux[0].createCard(Suit.Hearts, Colour.Red, Rank.Two);
        twoOfHearts.faceUp = true;
        game.cards.push(twoOfHearts);
        game.tableaux[0].push(twoOfHearts);

        expect((game as any).isFoundationDrop_(twoOfHearts, game.foundations[0])).toBe(false);
    });

    it('should deal 1 card face up to each tableau column when stock is clicked', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        const initialStockLen = game.stock.length;
        const initialTableauxLen = game.tableaux.map(t => t.length);

        // Click stock (or trigger doDrawFromStock_)
        Array.from((game as any).doDrawFromStock_());

        // Stock decreased by 8
        expect(game.stock.length).toBe(initialStockLen - 8);

        // Each tableau column increased by 1 card, and that card is face up
        for (let i = 0; i < 8; i++) {
            expect(game.tableaux[i].length).toBe(initialTableauxLen[i] + 1);
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
        }
    });

    it('should detect win when all 104 cards are in foundations', () => {
        expect((game as any).doGetWon_()).toBe(false);

        // Move all cards to foundations
        for (let i = 0; i < game.cards.length; i++) {
            game.foundations[i % 8].push(game.cards[i]);
        }

        expect((game as any).doGetWon_()).toBe(true);

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
