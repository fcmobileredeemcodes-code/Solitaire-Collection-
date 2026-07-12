import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";
import { Rank } from "~CardLib/Model/Rank";
import { Suit } from "~CardLib/Model/Suit";
import { Colour } from "~CardLib/Model/Colour";
import { Pile } from "~CardLib/Model/Pile";

describe("Terrace Game Model", () => {
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

    it("should initialize and deal correctly", () => {
        // Disable automatic behaviors during deal
        game.options.autoPlayStock = false;
        game.options.autoMoveToFoundation = 0;

        // Run the restart generator
        Array.from(game.restart(12345));

        // Piles length checks
        expect(game.tableaux.length).toBe(9);
        expect(game.foundations.length).toBe(8);
        expect(game.reserve.length).toBe(11);
        expect(game.stock.length).toBe(90); // 104 total - 11 (reserve) - 3 (tableau) = 90
        expect(game.waste.length).toBe(0);

        // All reserve cards should be face up
        for (let i = 0; i < game.reserve.length; i++) {
            expect(game.reserve.at(i).faceUp).toBe(true);
        }

        // Tableau [0..2] should have 1 card face up each
        for (let i = 0; i < 3; i++) {
            expect(game.tableaux[i].length).toBe(1);
            expect(game.tableaux[i].at(0).faceUp).toBe(true);
        }

        // Tableau [3..8] should be empty
        for (let i = 3; i < 9; i++) {
            expect(game.tableaux[i].length).toBe(0);
        }

        // Foundations empty
        for (let i = 0; i < 8; i++) {
            expect(game.foundations[i].length).toBe(0);
        }

        expect((game as any).baseRank_).toBe(Rank.None);
    });

    it("should allow choosing base rank and continue dealing the rest of the tableau", () => {
        game.options.autoPlayStock = false;
        game.options.autoMoveToFoundation = 0;

        Array.from(game.restart(12345));

        // Pick the card from tableaux[0]
        const chosenCard = game.tableaux[0].at(0);
        const expectedBaseRank = chosenCard.rank;

        // Move to foundations[0] using standard dropCard_
        Array.from(game.dropCard(chosenCard, game.foundations[0]));

        // Base rank should be set
        expect((game as any).baseRank_).toBe(expectedBaseRank);

        // First foundation should have the card
        expect(game.foundations[0].length).toBe(1);
        expect(game.foundations[0].at(0)).toBe(chosenCard);

        // Every tableau column should now have exactly 1 card face up
        for (let i = 0; i < 9; i++) {
            expect(game.tableaux[i].length).toBe(1);
            expect(game.tableaux[i].at(0).faceUp).toBe(true);
        }
    });

    it("should build foundations up in alternating colors with wrapping", () => {
        game.options.autoPlayStock = false;
        game.options.autoMoveToFoundation = 0;

        Array.from(game.restart(12345));

        // Choose a base rank manually
        (game as any).baseRank_ = Rank.Five;

        // Clear foundation and waste to set up test
        clearPile(game.foundations[0]);
        clearPile(game.waste);

        // Foundation starts empty, must start with base rank (5)
        const blackFive = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Five);
        blackFive.faceUp = true;
        expect((game as any).isFoundationDrop_(blackFive, game.foundations[0])).toBe(true);

        const blackSix = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Six);
        blackSix.faceUp = true;
        expect((game as any).isFoundationDrop_(blackSix, game.foundations[0])).toBe(false); // wrong rank

        // Push Black 5 to foundation
        game.foundations[0].push(blackFive);

        // Next card on foundation must be Red 6
        const redSix = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.Six);
        redSix.faceUp = true;
        expect((game as any).isFoundationDrop_(redSix, game.foundations[0])).toBe(true);

        const blackSix2 = game.waste.createCard(Suit.Clubs, Colour.Black, Rank.Six);
        blackSix2.faceUp = true;
        expect((game as any).isFoundationDrop_(blackSix2, game.foundations[0])).toBe(false); // same color

        // Push Red 6
        game.foundations[0].push(redSix);

        // Test King to Ace wrapping
        clearPile(game.foundations[0]);
        const blackKing = game.waste.createCard(Suit.Spades, Colour.Black, Rank.King);
        blackKing.faceUp = true;
        game.foundations[0].push(blackKing);

        // Next must be Red Ace
        const redAce = game.waste.createCard(Suit.Diamonds, Colour.Red, Rank.Ace);
        redAce.faceUp = true;
        expect((game as any).isFoundationDrop_(redAce, game.foundations[0])).toBe(true);
    });

    it("should build tableaus down in alternating colors with wrapping", () => {
        game.options.autoPlayStock = false;
        game.options.autoMoveToFoundation = 0;

        Array.from(game.restart(12345));
        (game as any).baseRank_ = Rank.Ace;

        clearPile(game.tableaux[0]);
        clearPile(game.waste);

        // Push Red Jack
        const redJack = game.tableaux[0].createCard(Suit.Hearts, Colour.Red, Rank.Jack);
        redJack.faceUp = true;

        // Next must be Black Ten
        const blackTen = game.waste.createCard(Suit.Spades, Colour.Black, Rank.Ten);
        blackTen.faceUp = true;
        expect((game as any).isTableauxDrop_(blackTen, game.tableaux[0])).toBe(true);

        // Red Ten should be rejected
        const redTen = game.waste.createCard(Suit.Diamonds, Colour.Red, Rank.Ten);
        redTen.faceUp = true;
        expect((game as any).isTableauxDrop_(redTen, game.tableaux[0])).toBe(false);

        // Test Ace to King wrapping
        clearPile(game.tableaux[0]);
        const blackAce = game.tableaux[0].createCard(Suit.Spades, Colour.Black, Rank.Ace);
        blackAce.faceUp = true;

        // Next must be Red King
        const redKing = game.waste.createCard(Suit.Hearts, Colour.Red, Rank.King);
        redKing.faceUp = true;
        expect((game as any).isTableauxDrop_(redKing, game.tableaux[0])).toBe(true);
    });

    it("should automatically and immediately refill empty tableaux from waste first, then stock", () => {
        game.options.autoPlayStock = false;
        game.options.autoMoveToFoundation = 0;

        Array.from(game.restart(12345));

        // Choose base rank
        const chosenCard = game.tableaux[0].at(0);
        Array.from(game.dropCard(chosenCard, game.foundations[0]));

        // Now all tableaux have 1 card.
        // Let's clear the card in tableaux[0] using standard moves or clearPile
        clearPile(game.tableaux[0]);

        // Place a card on waste
        const wasteCard = game.waste.createCard(Suit.Diamonds, Colour.Red, Rank.Ace);
        wasteCard.faceUp = true;

        // Trigger autoMoves_
        Array.from((game as any).doAutoMoves_());

        // Tableaux[0] should have been refilled with the waste card!
        expect(game.tableaux[0].length).toBe(1);
        expect(game.tableaux[0].at(0)).toBe(wasteCard);

        // Now clear tableaux[0] again, make waste empty, and verify it refills from stock
        clearPile(game.tableaux[0]);
        clearPile(game.waste);

        const topStock = game.stock.peek();
        expect(topStock).toBeDefined();

        Array.from((game as any).doAutoMoves_());

        // Tableaux[0] should have been refilled with the stock card!
        expect(game.tableaux[0].length).toBe(1);
        expect(game.tableaux[0].at(0)).toBe(topStock);
        expect(topStock?.faceUp).toBe(true);
    });

    it("should detect win when all foundations are complete", () => {
        expect((game as any).doGetWon_()).toBe(false);

        // Fill foundations with 104 cards
        for (let i = 0; i < game.cards.length; i++) {
            game.foundations[i % 8].push(game.cards[i]);
        }

        expect((game as any).doGetWon_()).toBe(true);

        (game as any).checkWon_();
        expect(game.won).toBe(true);
    });
});
