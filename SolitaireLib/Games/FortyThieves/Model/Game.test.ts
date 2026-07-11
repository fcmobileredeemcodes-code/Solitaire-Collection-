import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('FortyThieves Game Model', () => {
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
        game.options.autoPlayStock = false;

        // Run restart generator
        Array.from(game.restart(54321));

        // 10 tableau piles, 8 foundations, 1 waste, 1 stock
        expect(game.tableaux.length).toBe(10);
        expect(game.foundations.length).toBe(8);
        expect(game.waste).toBeDefined();
        expect(game.stock).toBeDefined();

        // 40 cards dealt face up across tableaus
        let tableauCount = 0;
        for (let i = 0; i < 10; i++) {
            tableauCount += game.tableaux[i].length;
            for (let j = 0; j < game.tableaux[i].length; j++) {
                expect(game.tableaux[i].at(j).faceUp).toBe(true);
            }
        }
        expect(tableauCount).toBe(40);

        // 104 total cards, so 104 - 40 = 64 cards in stock
        expect(game.stock.length).toBe(64);
        for (let i = 0; i < game.stock.length; i++) {
            expect(game.stock.at(i).faceUp).toBe(false);
        }
    });

    it('should build down on tableaus only in the same suit', () => {
        // Run restart generator
        Array.from(game.restart(54321));

        // Clear tableaux[0] and waste
        clearPile(game.tableaux[0]);
        clearPile(game.waste);

        // Put a Spades 7 in tableaux[0]
        const spade7 = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Seven);
        spade7.faceUp = true;

        // Put a Spades 6 in waste (valid single source)
        const spade6 = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Six);
        spade6.faceUp = true;

        // Verify if a Spades 6 can be placed on a Spades 7 (same suit, lower rank)
        const isValidSameSuit = (game as any).isTableauxDrop_(spade6, game.tableaux[0]);
        expect(isValidSameSuit).toBe(true);

        // Put a Clubs 6 in waste (different suit, same color)
        clearPile(game.waste);
        const club6 = game.waste.createCard(Suit.Clubs, Colour.Black, Rank.Six);
        club6.faceUp = true;

        // Verify if a Clubs 6 is rejected
        const isValidWrongSuitSameColor = (game as any).isTableauxDrop_(club6, game.tableaux[0]);
        expect(isValidWrongSuitSameColor).toBe(false);

        // Put a Hearts 6 in waste (different suit, different color)
        clearPile(game.waste);
        const heart6 = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Six);
        heart6.faceUp = true;

        // Verify if a Hearts 6 is rejected
        const isValidWrongSuitWrongColor = (game as any).isTableauxDrop_(heart6, game.tableaux[0]);
        expect(isValidWrongSuitWrongColor).toBe(false);
    });

    it('should allow any card to fill empty tableau spaces', () => {
        // Run restart generator
        Array.from(game.restart(54321));

        // Clear tableaux[0] and waste
        clearPile(game.tableaux[0]);
        clearPile(game.waste);

        // Put a Queen of Diamonds in waste
        const queenOfDiamonds = game.waste.createCard(Suit.Diamonds, Colour.Red, Rank.Queen);
        queenOfDiamonds.faceUp = true;

        // Verify if a Queen is allowed to fill the empty tableau space
        const isValidQueen = (game as any).isTableauxDrop_(queenOfDiamonds, game.tableaux[0]);
        expect(isValidQueen).toBe(true);

        // Put an Ace of Clubs in waste
        clearPile(game.waste);
        const aceOfClubs = game.waste.createCard(Suit.Clubs, Colour.Black, Rank.Ace);
        aceOfClubs.faceUp = true;

        // Verify if an Ace is allowed to fill the empty tableau space
        const isValidAce = (game as any).isTableauxDrop_(aceOfClubs, game.tableaux[0]);
        expect(isValidAce).toBe(true);
    });

    it('should build foundations up by suit from Ace to King', () => {
        // Run restart generator
        Array.from(game.restart(54321));

        clearPile(game.foundations[0]);
        clearPile(game.waste);

        // Drop Ace on empty foundation
        const aceOfHearts = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
        aceOfHearts.faceUp = true;
        expect((game as any).isFoundationDrop_(aceOfHearts, game.foundations[0])).toBe(true);

        // Drop non-Ace on empty foundation
        const twoOfHearts = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Two);
        twoOfHearts.faceUp = true;
        expect((game as any).isFoundationDrop_(twoOfHearts, game.foundations[0])).toBe(false);

        // Add Ace to foundation
        game.foundations[0].push(aceOfHearts);

        // Drop 2 of Hearts on Ace of Hearts (valid)
        expect((game as any).isFoundationDrop_(twoOfHearts, game.foundations[0])).toBe(true);

        // Drop 2 of Spades on Ace of Hearts (invalid wrong suit)
        clearPile(game.waste);
        const twoOfSpades = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Two);
        twoOfSpades.faceUp = true;
        expect((game as any).isFoundationDrop_(twoOfSpades, game.foundations[0])).toBe(false);
    });

    it('should handle stock drawing 1 card and restocks correctly', () => {
        // Disable auto behaviors
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;
        game.options.restocksAllowed = 0; // Default is 0 restocks

        // Run restart generator
        Array.from(game.restart(54321));

        const stockCount = game.stock.length;
        const topCardOfStock = game.stock.peek();

        // Draw 1 card
        Array.from((game as any).doDrawFromStock_());

        expect(game.stock.length).toBe(stockCount - 1);
        expect(game.waste.peek()).toBe(topCardOfStock);
        expect(topCardOfStock?.faceUp).toBe(true);

        // Deplete stock
        clearPile(game.stock);

        // Try restocking (should be rejected since restocksAllowed = 0)
        Array.from((game as any).pilePrimary_(game.stock));
        expect(game.stock.length).toBe(0);
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
