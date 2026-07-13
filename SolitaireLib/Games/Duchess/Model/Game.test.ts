import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import { Colour } from '~CardLib/Model/Colour';
import { Pile } from '~CardLib/Model/Pile';

describe('Duchess Game Model', () => {
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
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        // Run restart generator
        Array.from(game.restart(12345));

        // 4 reserve piles of 3 cards each (total 12 cards)
        expect(game.reserves.length).toBe(4);
        for (let i = 0; i < 4; i++) {
            expect(game.reserves[i].length).toBe(3);
            for (let j = 0; j < 3; j++) {
                expect(game.reserves[i].at(j).faceUp).toBe(true);
            }
        }

        // 4 tableaux piles of 1 card each (total 4 cards)
        expect(game.tableaux.length).toBe(4);
        for (let i = 0; i < 4; i++) {
            expect(game.tableaux[i].length).toBe(1);
            expect(game.tableaux[i].peek()?.faceUp).toBe(true);
        }

        // 4 foundations empty
        expect(game.foundations.length).toBe(4);
        for (let i = 0; i < 4; i++) {
            expect(game.foundations[i].length).toBe(0);
        }

        // Stock (52 - 12 - 4 = 36)
        expect(game.stock.length).toBe(36);
        expect(game.waste.length).toBe(0);

        // baseRank should be Rank.None initially
        expect((game as any).baseRank_).toBe(Rank.None);
    });

    it('should enforce the mandatory first move from reserve to foundation', () => {
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        Array.from(game.restart(12345));

        // Try to drag from waste (empty) - shouldn't work
        const cannotDragWaste = game.canDrag(game.waste.peek() || game.stock.peek()!);
        expect(cannotDragWaste.canDrag).toBe(false);

        // Top card of reserve should be draggable
        const firstReserveTop = game.reserves[0].peek()!;
        const canDragReserve = game.canDrag(firstReserveTop);
        expect(canDragReserve.canDrag).toBe(true);

        // Try to drop it on an empty tableau (clear one first)
        clearPile(game.tableaux[0]);
        const canDropTableau = (game as any).previewDrop_(firstReserveTop, game.tableaux[0]);
        expect(canDropTableau).toBe(false); // Illegal because first move is mandatory reserve -> foundation

        // Try to drop it on empty foundation
        const canDropFoundation = (game as any).previewDrop_(firstReserveTop, game.foundations[0]);
        expect(canDropFoundation).toBe(true);

        // Complete the first move
        Array.from((game as any).chooseBaseRank_(firstReserveTop, game.foundations[0]));

        // baseRank should now be set to that card's rank
        expect((game as any).baseRank_).toBe(firstReserveTop.rank);
        expect(game.foundations[0].length).toBe(1);
    });

    it('should build tableaus down by alternating color, with wrapping in both directions', () => {
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        Array.from(game.restart(12345));

        // Establish baseRank to allow normal gameplay
        const reserveTop = game.reserves[0].peek()!;
        Array.from((game as any).chooseBaseRank_(reserveTop, game.foundations[0]));

        // Clear tableaux[0] and waste
        clearPile(game.tableaux[0]);
        clearPile(game.waste);

        // Put black 10 on tableaux[0]
        const blackTen = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Ten);
        blackTen.faceUp = true;

        // Create red 9 on waste
        const redNine = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Nine);
        redNine.faceUp = true;

        // Normal build down: red 9 on black 10
        expect((game as any).isTableauxDrop_(redNine, game.tableaux[0])).toBe(true);

        // Try wrong color (black 9 on black 10)
        clearPile(game.waste);
        const blackNine = game.waste.createCard(Suit.Clubs, Colour.Black, Rank.Nine);
        blackNine.faceUp = true;
        expect((game as any).isTableauxDrop_(blackNine, game.tableaux[0])).toBe(false);

        // Test wrapping: Ace on King
        clearPile(game.tableaux[0]);
        const blackKing = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.King);
        blackKing.faceUp = true;

        clearPile(game.waste);
        const redAce = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
        redAce.faceUp = true;
        expect((game as any).isTableauxDrop_(redAce, game.tableaux[0])).toBe(true);

        // Test wrapping: King on Ace
        clearPile(game.tableaux[0]);
        const blackAce = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Ace);
        blackAce.faceUp = true;

        clearPile(game.waste);
        const redKing = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.King);
        redKing.faceUp = true;
        expect((game as any).isTableauxDrop_(redKing, game.tableaux[0])).toBe(true);
    });

    it('should build foundations up by suit with circular wrapping', () => {
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        Array.from(game.restart(12345));

        // Establish King as base rank
        const kingOfHearts = game.reserves[0].createCard(Suit.Hearts, Colour.Red, Rank.King);
        kingOfHearts.faceUp = true;
        Array.from((game as any).chooseBaseRank_(kingOfHearts, game.foundations[0]));

        // Top of foundation[0] is King of Hearts. Next card should be Ace of Hearts (up by suit with wrapping)
        clearPile(game.waste);
        const aceOfHearts = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
        aceOfHearts.faceUp = true;

        expect((game as any).isFoundationDrop_(aceOfHearts, game.foundations[0])).toBe(true);

        // Wrong suit Ace
        clearPile(game.waste);
        const aceOfSpades = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Ace);
        aceOfSpades.faceUp = true;
        expect((game as any).isFoundationDrop_(aceOfSpades, game.foundations[0])).toBe(false);
    });

    it('should respect empty tableaux fill rules depending on reserve emptiness', () => {
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        Array.from(game.restart(12345));

        // Establish baseRank
        const reserveTop = game.reserves[0].peek()!;
        Array.from((game as any).chooseBaseRank_(reserveTop, game.foundations[0]));

        // Clear tableaux[0]
        clearPile(game.tableaux[0]);

        // Reserves are NOT empty. Tableaux[0] can only be filled from a reserve top card.
        // Try filling from waste:
        clearPile(game.waste);
        const wasteCard = game.waste.createCard(Suit.Diamonds, Colour.Red, Rank.Queen);
        wasteCard.faceUp = true;
        expect((game as any).isTableauxDrop_(wasteCard, game.tableaux[0])).toBe(false);

        // Try filling from reserve:
        const reserveCard = game.reserves[1].peek()!;
        expect((game as any).isTableauxDrop_(reserveCard, game.tableaux[0])).toBe(true);

        // Clear all reserves to make them empty
        for (let i = 0; i < 4; i++) {
            clearPile(game.reserves[i]);
        }

        // Now reserves are empty, so tableaux[0] can be filled from waste
        expect((game as any).isTableauxDrop_(wasteCard, game.tableaux[0])).toBe(true);
    });

    it('should handle stock draw and one redeal/restock', () => {
        game.options.autoReveal = false;
        game.options.autoMoveToFoundation = 0;
        game.options.autoPlayStock = false;

        Array.from(game.restart(12345));

        // Establish baseRank
        const reserveTop = game.reserves[0].peek()!;
        Array.from((game as any).chooseBaseRank_(reserveTop, game.foundations[0]));

        // Draw card from stock to waste
        const stockLengthBefore = game.stock.length;
        Array.from((game as any).doDrawFromStock_());
        expect(game.stock.length).toBe(stockLengthBefore - 1);
        expect(game.waste.length).toBe(1);
        expect(game.waste.peek()?.faceUp).toBe(true);

        // Empty stock completely
        while (game.stock.length > 0) {
            game.waste.push(game.stock.peek()!);
        }

        expect(game.stock.length).toBe(0);

        // First restock/redeal: Click stock pile
        Array.from((game as any).pilePrimary_(game.stock));

        // Stock should be refilled from waste and face down
        expect(game.stock.length).toBeGreaterThan(0);
        expect(game.stock.peek()?.faceUp).toBe(false);
        expect(game.waste.length).toBe(0);

        // Empty stock completely again
        while (game.stock.length > 0) {
            game.waste.push(game.stock.peek()!);
        }

        // Try second restock/redeal - should be blocked
        Array.from((game as any).pilePrimary_(game.stock));
        expect(game.stock.length).toBe(0); // Remains empty because only 1 redeal allowed
    });

    it('should evaluate won state correctly', () => {
        Array.from(game.restart(12345));

        // Mock winning state: move all cards to foundation piles
        clearPile(game.stock);
        clearPile(game.waste);
        for (let i = 0; i < 4; i++) {
            clearPile(game.reserves[i]);
            clearPile(game.tableaux[i]);
        }

        // Push 13 cards to each foundation pile
        for (let i = 0; i < 4; i++) {
            for (let j = 1; j <= 13; j++) {
                game.foundations[i].createCard(Suit.Hearts, Colour.Red, Rank.Ace);
            }
        }

        expect((game as any).doGetWon_()).toBe(true);
    });
});
