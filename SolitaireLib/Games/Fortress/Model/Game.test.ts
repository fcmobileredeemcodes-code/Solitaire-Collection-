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

describe('Fortress Game Model', () => {
    let game: Game;

    beforeEach(() => {
        const options = new GameOptions(new URLSearchParams());
        options.autoMoveToFoundation = 0; // Disable auto moves for predictable test behavior
        game = new Game(options);
    });

    it('should initialize correctly with correct pile counts', () => {
        expect(game.foundations.length).toBe(4);
        expect(game.tableaux.length).toBe(10);
        expect(game.won).toBe(false);
    });

    it('should setup game and deal cards fanned face-up on restart', () => {
        consume(game.restart(12345));

        // Foundations start empty
        for (const foundation of game.foundations) {
            expect(foundation.length).toBe(0);
        }

        // Tableau wing sizes: pile 0 and 5 have 6 cards, other 8 have 5 cards each
        expect(game.tableaux[0]?.length).toBe(6);
        expect(game.tableaux[5]?.length).toBe(6);

        let totalTableauCards = 0;
        for (let i = 0; i < 10; ++i) {
            const tab = game.tableaux[i]!;
            if (i !== 0 && i !== 5) {
                expect(tab.length).toBe(5);
            }
            totalTableauCards += tab.length;
        }
        expect(totalTableauCards).toBe(52);

        // Every card in play is face up
        for (const card of game.cards) {
            expect(card.faceUp).toBe(true);
        }
    });

    it('should allow building either UP or DOWN by suit on tableaux', () => {
        consume(game.restart(12));

        const c0 = game.tableaux[0]?.peek();
        const c1 = game.tableaux[1]?.peek();

        if (c0 && c1) {
            // Build down: 4 of Spades on 5 of Spades
            (c0 as any).suit = Suit.Spades;
            (c0 as any).rank = Rank.Four;

            (c1 as any).suit = Suit.Spades;
            (c1 as any).rank = Rank.Five;

            let canDrop = (game as any).previewDrop_(c0, game.tableaux[1]);
            expect(canDrop).toBe(true);

            // Build up: 6 of Spades on 5 of Spades
            (c0 as any).rank = Rank.Six;
            canDrop = (game as any).previewDrop_(c0, game.tableaux[1]);
            expect(canDrop).toBe(true);

            // Build with different suit: 6 of Hearts on 5 of Spades -> invalid
            (c0 as any).suit = Suit.Hearts;
            canDrop = (game as any).previewDrop_(c0, game.tableaux[1]);
            expect(canDrop).toBe(false);
        }
    });

    it('should allow placing any single card onto empty tableaux', () => {
        consume(game.restart(12));

        const tab0 = game.tableaux[0]!;
        while (tab0.length > 0) {
            game.tableaux[1]!.push(tab0.peek()!);
        }
        expect(tab0.length).toBe(0);

        const card = game.tableaux[1]!.peek()!;
        const canDrop = (game as any).previewDrop_(card, tab0);
        expect(canDrop).toBe(true);
    });

    it('should restrict dragging to only the top single card', () => {
        consume(game.restart(12));

        const tab0 = game.tableaux[0]!;
        expect(tab0.length).toBeGreaterThan(1);

        // Top card can be dragged
        const topCard = tab0.peek()!;
        let dragResult = (game as any).canDrag_(topCard);
        expect(dragResult.canDrag).toBe(true);
        expect(dragResult.extraCards.length).toBe(0);

        // Sub-top card cannot be dragged
        const subTopCard = tab0.at(tab0.length - 2)!;
        dragResult = (game as any).canDrag_(subTopCard);
        expect(dragResult.canDrag).toBe(false);
    });

    it('should build foundations up by suit starting with Ace', () => {
        consume(game.restart(12));

        const foundation0 = game.foundations[0]!;
        expect(foundation0.length).toBe(0);

        const cAce = game.tableaux[0]!.peek()!;
        (cAce as any).suit = Suit.Diamonds;
        (cAce as any).rank = Rank.Ace;

        // Ace should drop on empty foundation
        let canDrop = (game as any).previewDrop_(cAce, foundation0);
        expect(canDrop).toBe(true);

        // Two should not drop on empty foundation
        const cTwo = game.tableaux[1]!.peek()!;
        (cTwo as any).suit = Suit.Diamonds;
        (cTwo as any).rank = Rank.Two;
        canDrop = (game as any).previewDrop_(cTwo, foundation0);
        expect(canDrop).toBe(false);

        // Drop Ace of Diamonds
        foundation0.push(cAce);

        // Now Two of Diamonds should drop
        canDrop = (game as any).previewDrop_(cTwo, foundation0);
        expect(canDrop).toBe(true);

        // Two of Clubs should not drop on Diamonds Ace foundation
        (cTwo as any).suit = Suit.Clubs;
        canDrop = (game as any).previewDrop_(cTwo, foundation0);
        expect(canDrop).toBe(false);
    });

    it('should correctly evaluate won state and wonCards', () => {
        consume(game.restart(12));

        // Push all cards to foundations to mock win state
        const foundations = game.foundations;
        for (const card of game.cards) {
            foundations[0]!.push(card);
        }

        // Invoke checkWon_ explicitly as direct pile mutations bypass high-level ops
        (game as any).checkWon_();

        expect(game.won).toBe(true);
        expect(game.wonCards.length).toBe(52);
    });
});
