import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('Canfield Game Model', () => {
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
        // Disable automatic moves during initial deal test
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        // Run restart generator
        Array.from(game.restart(12345));

        // 13 reserve cards
        expect(game.reserve.length).toBe(13);
        expect(game.reserve.peek()?.faceUp).toBe(true);
        for (let i = 0; i < 12; i++) {
            expect(game.reserve.at(i).faceUp).toBe(false);
        }

        // 1 foundation card in foundations[0]
        expect(game.foundations[0].length).toBe(1);
        expect(game.foundations[0].peek()?.faceUp).toBe(true);
        expect(game.foundations[1].length).toBe(0);
        expect(game.foundations[2].length).toBe(0);
        expect(game.foundations[3].length).toBe(0);

        const baseRank = (game as any).baseRank_;
        expect(baseRank).toBeDefined();

        // 4 tableau cards
        expect(game.tableaux.length).toBe(4);
        for (let i = 0; i < 4; i++) {
            expect(game.tableaux[i].length).toBe(1);
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
        }

        // Stock length (52 - 13 - 1 - 4 = 34)
        expect(game.stock.length).toBe(34);
    });

    it('should test alternating color building on tableaus with King-to-Ace wrapping', () => {
        // Run restart generator
        Array.from(game.restart(12345));

        // Clear tableaux[0] and waste9
        clearPile(game.tableaux[0]);
        clearPile(game.waste9);

        // Put a black Ace on tableaux[0]
        const blackAce = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Ace);
        blackAce.faceUp = true;

        // Create a red King on waste9 (valid single source)
        const redKing = game.waste9.createCard(Suit.Hearts, Colour.Red, Rank.King);
        redKing.faceUp = true;

        // Verify if a red King can be placed on a black Ace
        // (Expected behavior: Alternating colors, wrapping from Ace to King)
        const isValidRedKing = (game as any).isTableauxDrop_(redKing, game.tableaux[0]);
        expect(isValidRedKing).toBe(true);

        // Clear waste9 and put a black King on it
        clearPile(game.waste9);
        const blackKing = game.waste9.createCard(Suit.Clubs, Colour.Black, Rank.King);
        blackKing.faceUp = true;

        // Verify if a black King is rejected (same color)
        const isValidBlackKing = (game as any).isTableauxDrop_(blackKing, game.tableaux[0]);
        expect(isValidBlackKing).toBe(false);

        // Put a red King on tableaux[0]
        clearPile(game.tableaux[0]);
        const redKingInTableau = game.tableaux[0].createCard(Suit.Hearts, Colour.Red, Rank.King);
        redKingInTableau.faceUp = true;

        // Create a red Queen on waste9
        clearPile(game.waste9);
        const redQueen = game.waste9.createCard(Suit.Diamonds, Colour.Red, Rank.Queen);
        redQueen.faceUp = true;

        // Verify if a red Queen is rejected (same color)
        const isValidQueenWrongColor = (game as any).isTableauxDrop_(redQueen, game.tableaux[0]);
        expect(isValidQueenWrongColor).toBe(false);

        // Create a black Queen on waste9
        clearPile(game.waste9);
        const blackQueen = game.waste9.createCard(Suit.Clubs, Colour.Black, Rank.Queen);
        blackQueen.faceUp = true;

        // Verify if a black Queen can be placed on a red King
        const isValidBlackQueen = (game as any).isTableauxDrop_(blackQueen, game.tableaux[0]);
        expect(isValidBlackQueen).toBe(true);
    });

    it('should test foundation building and wrapping from King to Ace', () => {
        // Run restart generator
        Array.from(game.restart(12345));
        const baseRank = (game as any).baseRank_;
        expect(baseRank).toBeDefined();

        // Let's force baseRank_ to King (13) and check if Ace (1) of the same suit can be dropped on it
        (game as any).baseRank_ = Rank.King;
        clearPile(game.foundations[0]);
        clearPile(game.waste9);

        const kingOfHearts = game.foundations[0].createCard(Suit.Hearts, Colour.Red, Rank.King);
        kingOfHearts.faceUp = true;

        const aceOfHearts = game.waste9.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
        aceOfHearts.faceUp = true;

        // Ace of Hearts should be allowed on King of Hearts (wrapping)
        const isValidAce = (game as any).isFoundationDrop_(aceOfHearts, game.foundations[0]);
        expect(isValidAce).toBe(true);

        // Use another single source like waste10
        clearPile(game.waste10);
        const aceOfSpades = game.waste10.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        aceOfSpades.faceUp = true;

        // Ace of Spades should be rejected (wrong suit)
        const isValidWrongSuit = (game as any).isFoundationDrop_(aceOfSpades, game.foundations[0]);
        expect(isValidWrongSuit).toBe(false);

        clearPile(game.waste10);
        const twoOfHearts = game.waste10.createCard(Suit.Hearts, Colour.Red, Rank.Two);
        twoOfHearts.faceUp = true;

        // Two of Hearts should be rejected (not Ace)
        const isValidTwo = (game as any).isFoundationDrop_(twoOfHearts, game.foundations[0]);
        expect(isValidTwo).toBe(false);
    });

    it('should test drawing 3 cards and restocking in correct order', () => {
        // Disable automatic moves during this test
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        // Run restart generator
        Array.from(game.restart(12345));

        // Grab the top 3 cards of stock
        const s1 = game.stock.at(game.stock.length - 1);
        const s2 = game.stock.at(game.stock.length - 2);
        const s3 = game.stock.at(game.stock.length - 3);

        // Draw 3 cards
        Array.from((game as any).doDrawFromStock_());

        // They should be in waste9, waste10, waste11 respectively
        expect(game.waste9.peek()).toBe(s1);
        expect(game.waste10.peek()).toBe(s2);
        expect(game.waste11.peek()).toBe(s3);

        expect(s1.faceUp).toBe(true);
        expect(s2.faceUp).toBe(true);
        expect(s3.faceUp).toBe(true);

        // Now empty the stock completely
        clearPile(game.stock);

        // Restock by executing pilePrimary_ on stock
        Array.from((game as any).pilePrimary_(game.stock));

        // Stock should be replenished and face down
        expect(game.stock.length).toBe(3);
        expect(game.stock.at(2)).toBe(s1);
        expect(game.stock.at(1)).toBe(s2);
        expect(game.stock.at(0)).toBe(s3);

        expect(s1.faceUp).toBe(false);
        expect(s2.faceUp).toBe(false);
        expect(s3.faceUp).toBe(false);
    });
});
