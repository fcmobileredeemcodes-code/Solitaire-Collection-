import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';

const consume = (gen: Generator) => {
    let res = gen.next();
    while (!res.done) {
        res = gen.next();
    }
};

describe('Beleaguered Castle Game Model', () => {
    let game: Game;

    beforeEach(() => {
        const options = new GameOptions(new URLSearchParams());
        options.autoMoveToFoundation = 0; // Disable auto moves for predictable test behavior
        game = new Game(options);
    });

    it('should initialize correctly', () => {
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(8);
        expect(game.won).toBe(false);
    });

    it('should setup game and deal cards on restart', () => {
        consume(game.restart(12345));

        // All 4 foundations should start with an Ace
        expect(game.foundations[0]?.length).toBe(1);
        expect(game.foundations[0]?.peek()?.rank).toBe(Rank.Ace);
        expect(game.foundations[0]?.peek()?.suit).toBe(Suit.Clubs);

        expect(game.foundations[1]?.length).toBe(1);
        expect(game.foundations[1]?.peek()?.rank).toBe(Rank.Ace);
        expect(game.foundations[1]?.peek()?.suit).toBe(Suit.Diamonds);

        expect(game.foundations[2]?.length).toBe(1);
        expect(game.foundations[2]?.peek()?.rank).toBe(Rank.Ace);
        expect(game.foundations[2]?.peek()?.suit).toBe(Suit.Hearts);

        expect(game.foundations[3]?.length).toBe(1);
        expect(game.foundations[3]?.peek()?.rank).toBe(Rank.Ace);
        expect(game.foundations[3]?.peek()?.suit).toBe(Suit.Spades);

        // 8 tableaux of 6 cards each = 48 cards
        let totalTableauCards = 0;
        for (const tab of game.tableaux) {
            expect(tab.length).toBe(6);
            totalTableauCards += tab.length;
        }
        expect(totalTableauCards).toBe(48);

        // Every card in play should be face up
        for (const card of game.cards) {
            expect(card.faceUp).toBe(true);
        }
    });

    it('should produce deterministic deal with a fixed seed', () => {
        const options = new GameOptions(new URLSearchParams());
        options.autoMoveToFoundation = 0;
        const game1 = new Game(options);
        consume(game1.restart(999));

        const game2 = new Game(options);
        consume(game2.restart(999));

        // Check if tableau cards are in the same order
        for (let j = 0; j < 8; j++) {
            const pile1 = game1.tableaux[j]!;
            const pile2 = game2.tableaux[j]!;
            expect(pile1.length).toBe(pile2.length);
            for (let i = 0; i < pile1.length; i++) {
                expect(pile1.at(i).suit).toBe(pile2.at(i).suit);
                expect(pile1.at(i).rank).toBe(pile2.at(i).rank);
            }
        }
    });

    it('should allow building down on tableaux regardless of suit or color', () => {
        consume(game.restart(12));

        // Find a tableau card and check we can place it on a card of any suit/color that is 1 rank higher
        const topCard0 = game.tableaux[0]?.peek();
        const topCard1 = game.tableaux[1]?.peek();

        if (topCard0 && topCard1) {
            // Let's modify ranks manually to test the exact drop logic rules
            // Place topCard0 (say, 5) onto topCard1 (say, 6)
            (topCard0 as any).rank = Rank.Five;
            (topCard1 as any).rank = Rank.Six;

            const canDrop = (game as any).previewDrop_(topCard0, game.tableaux[1]);
            expect(canDrop).toBe(true);
        }
    });

    it('should reject non-consecutive ranks on tableaux', () => {
        consume(game.restart(12));

        const topCard0 = game.tableaux[0]?.peek();
        const topCard1 = game.tableaux[1]?.peek();

        if (topCard0 && topCard1) {
            // Place 5 onto 8
            (topCard0 as any).rank = Rank.Five;
            (topCard1 as any).rank = Rank.Eight;

            const canDrop = (game as any).previewDrop_(topCard0, game.tableaux[1]);
            expect(canDrop).toBe(false);
        }
    });

    it('should allow placing any single card onto an empty tableau pile', () => {
        consume(game.restart(12));

        // Manually clear tableau 0
        const tab0 = game.tableaux[0]!;
        while (tab0.length > 0) {
            // Wait, we can move cards to another pile to empty tab0
            const c = tab0.peek()!;
            game.tableaux[1]!.push(c);
        }
        expect(tab0.length).toBe(0);

        // Now pick a top card from another tableau and ensure it can be dropped to tab0
        const c = game.tableaux[1]!.peek()!;
        const canDrop = (game as any).previewDrop_(c, tab0);
        expect(canDrop).toBe(true);
    });

    it('should build foundations up by suit starting with Ace', () => {
        consume(game.restart(42));

        // Find foundation 0 (Clubs Ace is pre-placed)
        const foundationClubs = game.foundations[0]!;
        expect(foundationClubs.peek()?.suit).toBe(Suit.Clubs);
        expect(foundationClubs.peek()?.rank).toBe(Rank.Ace);

        // Try to drop 2 of Clubs -> should be valid
        const c2Clubs = game.tableaux[0]!.peek()!; // find or modify a top card to be 2 of Clubs
        (c2Clubs as any).suit = Suit.Clubs;
        (c2Clubs as any).rank = Rank.Two;

        const canDrop2 = (game as any).previewDrop_(c2Clubs, foundationClubs);
        expect(canDrop2).toBe(true);

        // Try to drop 2 of Diamonds onto Clubs foundation -> should be invalid
        const c2Diamonds = game.tableaux[1]!.peek()!;
        (c2Diamonds as any).suit = Suit.Diamonds;
        (c2Diamonds as any).rank = Rank.Two;

        const canDropWrongSuit = (game as any).previewDrop_(c2Diamonds, foundationClubs);
        expect(canDropWrongSuit).toBe(false);
    });
});
