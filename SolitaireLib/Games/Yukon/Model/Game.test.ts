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

describe("Yukon Game Model", () => {
    let game: Game;

    beforeEach(() => {
        const options = new GameOptions(new URLSearchParams());
        options.autoReveal = false;
        options.autoMoveToFoundation = 0;
        game = new Game(options);
    });

    it("should initialize correctly", () => {
        expect(game.tableaux.length).toBe(7);
        expect(game.foundations.length).toBe(4);
        expect(game.won).toBe(false);
    });

    it("should deal cards correctly to the 7 tableaux piles", () => {
        consume(game.restart(12345));

        // Check each tableau length:
        // Column 0: 1 card
        // Column 1: 6 cards (1 face down, 5 face up)
        // Column 2: 7 cards (2 face down, 5 face up)
        // Column 3: 8 cards (3 face down, 5 face up)
        // Column 4: 9 cards (4 face down, 5 face up)
        // Column 5: 10 cards (5 face down, 5 face up)
        // Column 6: 11 cards (6 face down, 5 face up)
        expect(game.tableaux[0].length).toBe(1);
        expect(game.tableaux[1].length).toBe(6);
        expect(game.tableaux[2].length).toBe(7);
        expect(game.tableaux[3].length).toBe(8);
        expect(game.tableaux[4].length).toBe(9);
        expect(game.tableaux[5].length).toBe(10);
        expect(game.tableaux[6].length).toBe(11);

        // Check face down/up counts
        for (let i = 0; i < 7; ++i) {
            const pile = game.tableaux[i];
            const faceDownCount = i;
            const faceUpCount = i === 0 ? 1 : 5;

            for (let j = 0; j < faceDownCount; ++j) {
                expect(pile.at(j).faceUp).toBe(false);
            }
            for (let j = faceDownCount; j < faceDownCount + faceUpCount; ++j) {
                expect(pile.at(j).faceUp).toBe(true);
            }
        }
    });

    it("should reject illegal drops on tableaux and foundations", () => {
        consume(game.restart(1));

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];
        const t6 = game.tableaux[6];

        // Clear t0 and t1 completely
        while (t0.length > 0) t6.push(t0.peek()!);
        while (t1.length > 0) t6.push(t1.peek()!);

        expect(t0.length).toBe(0);
        expect(t1.length).toBe(0);

        // Create custom cards to test drop rules safely
        const redKing = t1.createCard(Suit.Hearts, Colour.Red, Rank.King);
        const blackQueen = t1.createCard(Suit.Spades, Colour.Black, Rank.Queen);
        const redQueen = t1.createCard(Suit.Diamonds, Colour.Red, Rank.Queen);
        const blackJack = t1.createCard(Suit.Spades, Colour.Black, Rank.Jack);

        redKing.faceUp = true;
        blackQueen.faceUp = true;
        redQueen.faceUp = true;
        blackJack.faceUp = true;

        game.cards.push(redKing, blackQueen, redQueen, blackJack);

        // King can be dropped on empty tableau
        expect(game.previewDrop(redKing, t0)).toBe(true);

        // Queen cannot be dropped on empty tableau
        expect(game.previewDrop(redQueen, t0)).toBe(false);

        // Queen of opposite color (black) can be dropped on Red King
        t0.push(redKing);
        t1.push(blackQueen);
        expect(game.previewDrop(blackQueen, t0)).toBe(true);

        // Queen of same color (red) cannot be dropped on Red King
        t1.push(redQueen);
        expect(game.previewDrop(redQueen, t0)).toBe(false);

        // Jack of same color (black) cannot be dropped on black Queen
        t0.push(blackQueen);
        t1.push(blackJack);
        expect(game.previewDrop(blackJack, t0)).toBe(false);
    });

    it("should allow Group Movement regardless of sequence", () => {
        consume(game.restart(1));

        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];
        const t6 = game.tableaux[6];

        // Clear t0 and t1 for determinism
        while (t0.length > 0) t6.push(t0.peek()!);
        while (t1.length > 0) t6.push(t1.peek()!);

        expect(t0.length).toBe(0);
        expect(t1.length).toBe(0);

        // Create a Red King at the bottom of t0
        const redKing = t0.createCard(Suit.Hearts, Colour.Red, Rank.King);
        redKing.faceUp = true;
        t0.push(redKing);

        // Create a non-sequential group in t1: Black Queen, then Red Queen (non-sequential since Q on Q), then Red Jack (non-sequential since red on red)
        const blackQueen = t1.createCard(Suit.Spades, Colour.Black, Rank.Queen);
        const redQueen = t1.createCard(Suit.Diamonds, Colour.Red, Rank.Queen);
        const redJack = t1.createCard(Suit.Hearts, Colour.Red, Rank.Jack);

        blackQueen.faceUp = true;
        redQueen.faceUp = true;
        redJack.faceUp = true;

        game.cards.push(redKing, blackQueen, redQueen, redJack);

        t1.push(blackQueen);
        t1.push(redQueen);
        t1.push(redJack);

        // Dragging the Black Queen (bottom of the group in t1) onto the Red King (top of t0)
        // This is valid because Black Queen is of opposite color to Red King, and Queen builds on King,
        // even though redQueen and redJack are not sequentially valid underneath blackQueen!
        expect(game.previewDrop(blackQueen, t0)).toBe(true);

        // If we drop it, the entire group [blackQueen, redQueen, redJack] should move together
        const dragResult = game.canDrag(blackQueen);
        expect(dragResult.canDrag).toBe(true);
        expect(dragResult.extraCards).toEqual([redQueen, redJack]);

        // Execute drop
        consume(game.dropCard(blackQueen, t0));

        expect(t0.length).toBe(4); // redKing, blackQueen, redQueen, redJack
        expect(t1.length).toBe(0);
        expect(t0.peek()).toBe(redJack);
    });

    it("should allow dropping Aces on empty foundations, and building up in suit", () => {
        consume(game.restart(1));

        const f0 = game.foundations[0];
        const t0 = game.tableaux[0];
        const t1 = game.tableaux[1];
        const t2 = game.tableaux[2];
        const t6 = game.tableaux[6];

        // Clear t0, t1, t2 completely
        while (t0.length > 0) t6.push(t0.peek()!);
        while (t1.length > 0) t6.push(t1.peek()!);
        while (t2.length > 0) t6.push(t2.peek()!);

        // Create custom cards in separate tableaux so they are all single top cards of their piles
        const aceOfHearts = t1.createCard(Suit.Hearts, Colour.Red, Rank.Ace);
        const twoOfHearts = t0.createCard(Suit.Hearts, Colour.Red, Rank.Two);
        const aceOfSpades = t2.createCard(Suit.Spades, Colour.Black, Rank.Ace);

        game.cards.push(aceOfHearts, twoOfHearts, aceOfSpades);
        t1.push(aceOfHearts);
        t0.push(twoOfHearts);
        t2.push(aceOfSpades);

        aceOfHearts.faceUp = true;
        twoOfHearts.faceUp = true;
        aceOfSpades.faceUp = true;

        // Ace can drop on empty foundation
        expect(game.previewDrop(aceOfHearts, f0)).toBe(true);

        // Two cannot drop on empty foundation
        expect(game.previewDrop(twoOfHearts, f0)).toBe(false);

        // Put Ace in foundation
        f0.push(aceOfHearts);

        // Two of same suit can drop on Ace
        expect(game.previewDrop(twoOfHearts, f0)).toBe(true);

        // Ace of another suit cannot drop on Hearts foundation
        expect(game.previewDrop(aceOfSpades, f0)).toBe(false);
    });
});
