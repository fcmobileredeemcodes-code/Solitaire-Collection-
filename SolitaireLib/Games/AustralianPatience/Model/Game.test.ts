import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";
import { Rank } from "~CardLib/Model/Rank";
import { Suit } from "~CardLib/Model/Suit";
import { Card } from "~CardLib/Model/Card";

function consume(generator: Generator<any, any, any>) {
    let result = generator.next();
    while (!result.done) {
        result = generator.next();
    }
}

describe("Australian Patience Game Model", () => {
    let game: Game;

    beforeEach(() => {
        // Disable auto-move so tests have full manual control over moves and initial counts
        game = new Game(new GameOptions(new URLSearchParams("autoMoveToFoundation=0")));
    });

    it("should initialize correctly", () => {
        expect(game.stock).toBeDefined();
        expect(game.waste).toBeDefined();
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(7);
        expect(game.cards.length).toBe(52);
    });

    it("should restart and deal correctly", () => {
        consume(game.restart(12345));

        // 7 columns of exactly 4 cards each = 28 cards dealt to tableaux
        let tableauCount = 0;
        for (const tableau of game.tableaux) {
            expect(tableau.length).toBe(4);
            tableauCount += tableau.length;
            // All cards in tableaux must be face up
            for (const card of tableau) {
                expect(card.faceUp).toBe(true);
            }
        }
        expect(tableauCount).toBe(28);

        // Remaining 24 cards form the stock
        expect(game.stock.length).toBe(24);
        for (const card of game.stock) {
            expect(card.faceUp).toBe(false);
        }

        // Foundations must start empty
        for (const foundation of game.foundations) {
            expect(foundation.length).toBe(0);
        }

        // Waste starts empty
        expect(game.waste.length).toBe(0);
    });

    it("should allow drawing from the stock", () => {
        consume(game.restart(12345));

        expect(game.stock.length).toBe(24);
        expect(game.waste.length).toBe(0);

        const topStock = game.stock.peek();
        expect(topStock).toBeDefined();

        // Clicking on the top stock card triggers drawing a card to the waste
        consume(game.cardPrimary(topStock!));

        expect(game.stock.length).toBe(23);
        expect(game.waste.length).toBe(1);
        expect(game.waste.peek()).toBe(topStock);
        expect(topStock!.faceUp).toBe(true);
    });

    it("should support tableaux building down strictly by suit", () => {
        consume(game.restart(12345));

        const tableau0 = game.tableaux[0];
        const tableau1 = game.tableaux[1];

        // Clear them first to control the setup (pushing them to stock to clear safely)
        while (tableau0.length > 0) game.stock.push(tableau0.peek()!);
        while (tableau1.length > 0) game.stock.push(tableau1.peek()!);

        // 7 of Hearts and 6 of Hearts (valid: build down by suit)
        const heart7 = game.cards.find(c => c.rank === Rank.Seven && c.suit === Suit.Hearts)!;
        const heart6 = game.cards.find(c => c.rank === Rank.Six && c.suit === Suit.Hearts)!;
        // 6 of Diamonds (invalid: different suit)
        const diamond6 = game.cards.find(c => c.rank === Rank.Six && c.suit === Suit.Diamonds)!;

        // Place Heart 7 onto Tableau 0
        heart7.faceUp = true;
        tableau0.push(heart7);

        // Place Heart 6 as the top card of Tableau 1
        heart6.faceUp = true;
        tableau1.push(heart6);

        // Test previewDrop on Heart 7
        // Moving Heart 6 onto Heart 7 (should be true)
        expect(game.previewDrop(heart6, tableau0)).toBe(true);

        // Moving Diamond 6 (not covering heart6)
        diamond6.faceUp = true;
        // Since diamond6 is in stock and we haven't moved it, let's put it on tableau1 instead of heart6
        if (tableau1.length > 0) game.stock.push(tableau1.peek()!); // remove heart6
        tableau1.push(diamond6);
        expect(game.previewDrop(diamond6, tableau0)).toBe(false);

        // Now do valid drop
        while (tableau1.length > 0) game.stock.push(tableau1.peek()!);
        tableau1.push(heart6);
        consume(game.dropCard(heart6, tableau0));
        expect(tableau0.peek()).toBe(heart6);
        expect(heart6.pile).toBe(tableau0);
    });

    it("should allow empty tableau columns to be filled only by Kings (or sequences starting with Kings)", () => {
        consume(game.restart(12345));

        const tableau0 = game.tableaux[0];
        while (tableau0.length > 0) game.stock.push(tableau0.peek()!); // Empty it

        const king = game.cards.find(c => c.rank === Rank.King)!;
        const queen = game.cards.find(c => c.rank === Rank.Queen)!;

        // Push only one at a time to waste so they are the top card (draggable)
        game.waste.push(queen);
        queen.faceUp = true;
        expect(game.previewDrop(queen, tableau0)).toBe(false);

        if (game.waste.length > 0) game.stock.push(game.waste.peek()!); // remove queen
        game.waste.push(king);
        king.faceUp = true;
        expect(game.previewDrop(king, tableau0)).toBe(true);
    });

    it("should allow any face-up card in a column to drag together with all covering cards", () => {
        consume(game.restart(12345));

        const tableau0 = game.tableaux[0];
        const tableau1 = game.tableaux[1];

        while (tableau0.length > 0) game.stock.push(tableau0.peek()!);
        while (tableau1.length > 0) game.stock.push(tableau1.peek()!);

        // Create a column with unrelated cards on top: Heart 7 -> Club 5 -> Spade Jack
        const heart7 = game.cards.find(c => c.rank === Rank.Seven && c.suit === Suit.Hearts)!;
        const club5 = game.cards.find(c => c.rank === Rank.Five && c.suit === Suit.Clubs)!;
        const spadeJ = game.cards.find(c => c.rank === Rank.Jack && c.suit === Suit.Spades)!;

        heart7.faceUp = true;
        club5.faceUp = true;
        spadeJ.faceUp = true;

        tableau0.push(heart7);
        tableau0.push(club5);
        tableau0.push(spadeJ);

        // Target pile has Heart 8
        const heart8 = game.cards.find(c => c.rank === Rank.Eight && c.suit === Suit.Hearts)!;
        heart8.faceUp = true;
        tableau1.push(heart8);

        // Drag heart7. Should drag heart7, club5, spadeJ.
        const dragInfo = game.canDrag(heart7);
        expect(dragInfo.canDrag).toBe(true);
        expect(dragInfo.extraCards.length).toBe(2);
        expect(dragInfo.extraCards[0]).toBe(club5);
        expect(dragInfo.extraCards[1]).toBe(spadeJ);

        // Heart 7 can be dropped onto Heart 8
        expect(game.previewDrop(heart7, tableau1)).toBe(true);

        // Perform the drop
        consume(game.dropCard(heart7, tableau1));

        expect(tableau1.length).toBe(4);
        expect(tableau1.at(0)).toBe(heart8);
        expect(tableau1.at(1)).toBe(heart7);
        expect(tableau1.at(2)).toBe(club5);
        expect(tableau1.at(3)).toBe(spadeJ);
    });

    it("should build foundation Ace to King by suit", () => {
        consume(game.restart(12345));

        const foundation = game.foundations[0];
        const tableau0 = game.tableaux[0];
        const tableau1 = game.tableaux[1];

        while (tableau0.length > 0) game.stock.push(tableau0.peek()!);
        while (tableau1.length > 0) game.stock.push(tableau1.peek()!);

        const ace = game.cards.find(c => c.rank === Rank.Ace && c.suit === Suit.Hearts)!;
        const heart2 = game.cards.find(c => c.rank === Rank.Two && c.suit === Suit.Hearts)!;
        const spade2 = game.cards.find(c => c.rank === Rank.Two && c.suit === Suit.Spades)!;

        ace.faceUp = true;
        heart2.faceUp = true;
        spade2.faceUp = true;

        tableau0.push(ace);

        // Ace can be dropped to empty foundation
        expect(game.previewDrop(ace, foundation)).toBe(true);
        consume(game.dropCard(ace, foundation));

        // Now test Heart 2 (uncovered) vs Spade 2 (uncovered) on top of the Ace
        tableau1.push(heart2);
        expect(game.previewDrop(heart2, foundation)).toBe(true);

        if (tableau1.length > 0) game.stock.push(tableau1.peek()!);
        tableau1.push(spade2);
        expect(game.previewDrop(spade2, foundation)).toBe(false);

        if (tableau1.length > 0) game.stock.push(tableau1.peek()!);
        tableau1.push(heart2);
        consume(game.dropCard(heart2, foundation));
        expect(foundation.peek()).toBe(heart2);
    });

    it("should win the game when all foundations are full", () => {
        expect(game.won).toBe(false);

        // Mock a win state by filling foundations with 13 cards each
        for (let f = 0; f < 4; ++f) {
            const foundation = game.foundations[f];
            const suit = f + 1; // 1 to 4 are suits
            for (let r = 1; r <= 13; ++r) {
                const card = game.cards.find(c => c.suit === suit && (game as any).getCardValue_(c) === r)!;
                foundation.push(card);
            }
        }

        // Call checkWon_ to evaluate win state as per instruction guidelines
        (game as any).checkWon_();

        expect(game.won).toBe(true);
    });
});
