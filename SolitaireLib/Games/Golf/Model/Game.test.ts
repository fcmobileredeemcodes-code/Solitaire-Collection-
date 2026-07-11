import { describe, it, expect, beforeEach } from "vitest";
import { Suit } from "~CardLib/Model/Suit";
import { Colour } from "~CardLib/Model/Colour";
import { Rank } from "~CardLib/Model/Rank";
import { Game } from "./Game";
import { GameOptions } from "./GameOptions";

const consume = (gen: Generator) => {
    let res = gen.next();
    while (!res.done) {
        res = gen.next();
    }
};

describe("Golf Game Model", () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it("should initialize correctly", () => {
        expect(game.tableaux.length).toBe(7);
        expect(game.waste).toBeDefined();
        expect(game.stock).toBeDefined();
        expect(game.won).toBe(false);
    });

    it("should have correct pile index mappings", () => {
        // Tableaux piles must be 0 to 6
        for (let i = 0; i < 7; ++i) {
            expect(game.piles[i]).toBe(game.tableaux[i]);
        }
        // Waste is pile index 7
        expect(game.piles[7]).toBe(game.waste);
        // Stock is pile index 8
        expect(game.piles[8]).toBe(game.stock);
    });

    it("should produce deterministic deal with a fixed seed", () => {
        const game1 = new Game(new GameOptions(new URLSearchParams()));
        consume(game1.restart(12345));

        const game2 = new Game(new GameOptions(new URLSearchParams()));
        consume(game2.restart(12345));

        // Expect stock to have same length (52 - 35 dealt to tableau - 1 dealt to waste = 16)
        expect(game1.stock.length).toBe(16);
        expect(game2.stock.length).toBe(16);

        for (let i = 0; i < game1.stock.length; ++i) {
            expect(game1.stock.at(i).suit).toBe(game2.stock.at(i).suit);
            expect(game1.stock.at(i).rank).toBe(game2.stock.at(i).rank);
        }

        // Expect waste to have 1 card
        expect(game1.waste.length).toBe(1);
        expect(game2.waste.length).toBe(1);
        expect(game1.waste.peek()?.rank).toBe(game2.waste.peek()?.rank);

        // Expect 7 tableaux with 5 cards each
        for (let i = 0; i < 7; ++i) {
            expect(game1.tableaux[i].length).toBe(5);
            expect(game2.tableaux[i].length).toBe(5);
            for (let j = 0; j < 5; ++j) {
                expect(game1.tableaux[i].at(j).rank).toBe(game2.tableaux[i].at(j).rank);
                expect(game1.tableaux[i].at(j).faceUp).toBe(true);
            }
        }
    });

    it("should handle drawing from stock correctly", () => {
        consume(game.restart(12345));

        const initialStockLen = game.stock.length; // 16
        const initialWasteLen = game.waste.length; // 1

        const topStock = game.stock.peek();
        expect(topStock).toBeDefined();

        // Perform primary action (click) on the top card of the stock
        consume(game.cardPrimary(topStock!));

        expect(game.stock.length).toBe(initialStockLen - 1);
        expect(game.waste.length).toBe(initialWasteLen + 1);
        expect(game.waste.peek()).toBe(topStock);
        expect(topStock?.faceUp).toBe(true);
    });

    it("should enforce Golf validation rules (+/- 1 rank, no wrap-around)", () => {
        consume(game.restart(1));

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];
        const t6 = game.tableaux[6];
        const waste = game.waste;

        // Clear tableaux and waste by transferring cards to t6 or other piles
        while (t0.length > 0) t6.push(t0.peek()!);
        while (t1.length > 0) t6.push(t1.peek()!);
        while (waste.length > 0) t6.push(waste.peek()!);

        expect(t0.length).toBe(0);
        expect(t1.length).toBe(0);
        expect(waste.length).toBe(0);

        // Create custom cards and push to game.cards
        const cardAce = t0.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
        const cardTwo = t0.createCard(Suit.Diamonds, Colour.Red, Rank.Two);
        const cardQueen = t0.createCard(Suit.Spades, Colour.Black, Rank.Queen);
        const cardKing = t0.createCard(Suit.Clubs, Colour.Black, Rank.King);
        const cardJack = t1.createCard(Suit.Hearts, Colour.Red, Rank.Jack);

        cardAce.faceUp = true;
        cardTwo.faceUp = true;
        cardQueen.faceUp = true;
        cardKing.faceUp = true;
        cardJack.faceUp = true;

        game.cards.push(cardAce, cardTwo, cardQueen, cardKing, cardJack);

        // Scenario 1: Waste is empty, any move is valid? (isValidMove_ handles empty waste as valid)
        t0.push(cardQueen);
        expect(game.previewDrop(cardQueen, waste)).toBe(true);

        // Scenario 2: Waste is Queen (12)
        waste.push(cardQueen);
        t0.push(cardKing); // remove cardQueen from t0 first
        t0.push(cardKing); // push cardKing to t0

        // King (13) is valid on Queen (12)
        // Clear t0 top card first
        while (t0.length > 0) t6.push(t0.peek()!);
        t0.push(cardKing);
        expect(game.previewDrop(cardKing, waste)).toBe(true);

        // Jack (11) is valid on Queen (12)
        t1.push(cardJack);
        expect(game.previewDrop(cardJack, waste)).toBe(true);

        // Two (2) is invalid on Queen (12)
        while (t0.length > 0) t6.push(t0.peek()!);
        t0.push(cardTwo);
        expect(game.previewDrop(cardTwo, waste)).toBe(false);

        // Scenario 3: Waste is King (13)
        while (waste.length > 0) t6.push(waste.peek()!);
        waste.push(cardKing);

        // Queen (12) is valid on King (13)
        while (t0.length > 0) t6.push(t0.peek()!);
        t0.push(cardQueen);
        expect(game.previewDrop(cardQueen, waste)).toBe(true);

        // Ace (1) is invalid on King (13) (No wrap-around!)
        while (t0.length > 0) t6.push(t0.peek()!);
        t0.push(cardAce);
        expect(game.previewDrop(cardAce, waste)).toBe(false);

        // Scenario 4: Waste is Ace (1)
        while (waste.length > 0) t6.push(waste.peek()!);
        waste.push(cardAce);

        // Two (2) is valid on Ace (1)
        while (t0.length > 0) t6.push(t0.peek()!);
        t0.push(cardTwo);
        expect(game.previewDrop(cardTwo, waste)).toBe(true);

        // King (13) is invalid on Ace (1) (No wrap-around!)
        while (t0.length > 0) t6.push(t0.peek()!);
        t0.push(cardKing);
        expect(game.previewDrop(cardKing, waste)).toBe(false);
    });

    it("should allow dragging only top card of tableaux", () => {
        consume(game.restart(12345));

        const t0 = game.tableaux[0];
        const cardBottom = t0.at(0);
        const cardTop = t0.peek();

        expect(cardBottom).toBeDefined();
        expect(cardTop).toBeDefined();

        // Top card is draggable
        expect(game.canDrag(cardTop!).canDrag).toBe(true);

        // Underneath card is NOT draggable
        if (t0.length > 1) {
            expect(game.canDrag(cardBottom!).canDrag).toBe(false);
        }
    });

    it("should handle card click move if valid, otherwise do nothing", () => {
        consume(game.restart(1));

        const t0 = game.tableaux[0];
        const t6 = game.tableaux[6];
        const waste = game.waste;

        // Clear tableaux and waste
        while (t0.length > 0) t6.push(t0.peek()!);
        while (waste.length > 0) t6.push(waste.peek()!);

        const cardQueen = t0.createCard(Suit.Spades, Colour.Black, Rank.Queen);
        const cardKing = t0.createCard(Suit.Clubs, Colour.Black, Rank.King);

        cardQueen.faceUp = true;
        cardKing.faceUp = true;

        game.cards.push(cardQueen, cardKing);

        // Setup: waste has Queen, tableau has King (on top of nothing else)
        waste.push(cardQueen);
        t0.push(cardKing);

        const initialWasteLen = waste.length;

        // Perform click on King (primary action)
        consume(game.cardPrimary(cardKing));

        // King should be moved to waste
        expect(t0.length).toBe(0);
        expect(waste.length).toBe(initialWasteLen + 1);
        expect(waste.peek()).toBe(cardKing);
    });

    it("should detect win condition correctly", () => {
        consume(game.restart(12345));

        expect(game.won).toBe(false);

        // Clear all tableaux
        for (const tableau of game.tableaux) {
            while (tableau.length > 0) {
                game.waste.push(tableau.peek()!);
            }
        }

        // Win state check (usually checked during actions, let's trigger check)
        // Perform a quick dummy draw to trigger commit/won check or set manually
        // We can check doGetWon_ directly
        expect((game as any).doGetWon_()).toBe(true);

        // Let's trigger checkWon_ by calling cardPrimary on a card or dropping
        const topStock = game.stock.peek();
        if (topStock) {
            consume(game.cardPrimary(topStock));
        }
        expect(game.won).toBe(true);
    });
});
