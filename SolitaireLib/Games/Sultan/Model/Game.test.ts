import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { GameOptions } from './GameOptions';
import { Rank } from '~CardLib/Model/Rank';
import { Suit } from '~CardLib/Model/Suit';
import * as Debug from "~CardLib/Debug";

describe('Sultan Game Model', () => {
    let game: Game;

    // Helper to fully consume generator returned by game actions
    function consume(gen: Generator<any, any, any>) {
        while (!gen.next().done) {}
    }

    beforeEach(() => {
        game = new Game(new GameOptions(new URLSearchParams()));
    });

    it('should initialize correctly', () => {
        expect(game.stock).toBeDefined();
        expect(game.waste).toBeDefined();
        expect(game.sultan).toBeDefined();
        expect(game.foundations.length).toBe(8);
        expect(game.reserves.length).toBe(8);
        expect(game.cards.length).toBe(104);
    });

    it('should layout starting grid correctly after restart', () => {
        consume(game.restart(12345));

        // Center card (Sultan) should be a King of Hearts
        expect(game.sultan.length).toBe(1);
        expect(game.sultan.peek()!.rank).toBe(Rank.King);
        expect(game.sultan.peek()!.suit).toBe(Suit.Hearts);

        // Foundation 6 (Bottom-Center) should be Ace of Hearts
        const f6 = game.foundations[6] ?? Debug.error();
        expect(f6.length).toBe(1);
        expect(f6.peek()!.rank).toBe(Rank.Ace);
        expect(f6.peek()!.suit).toBe(Suit.Hearts);

        // Other foundations should be Kings
        const kingFoundations = [0, 1, 2, 3, 4, 5, 7];
        for (const index of kingFoundations) {
            const f = game.foundations[index] ?? Debug.error();
            expect(f.length).toBe(1);
            expect(f.peek()!.rank).toBe(Rank.King);
        }

        // 8 reserves should be dealt 1 card each
        for (let i = 0; i < 8; ++i) {
            const r = game.reserves[i] ?? Debug.error();
            expect(r.length).toBe(1);
            expect(r.peek()!.faceUp).toBe(true);
        }
    });

    it('should build foundations in suit from King to Ace to Queen', () => {
        consume(game.restart(111));

        // Let's find Foundation 0 (King of Spades)
        const f0 = game.foundations[0] ?? Debug.error();
        expect(f0.peek()!.rank).toBe(Rank.King);
        expect(f0.peek()!.suit).toBe(Suit.Spades);

        // Find Ace of Spades card
        const spadeAce = game.cards.find(c => c.rank === Rank.Ace && c.suit === Suit.Spades && c.pile !== f0);
        expect(spadeAce).toBeDefined();

        // Check drop
        const canDrop = (game as any).previewDrop_(spadeAce!, f0);
        expect(canDrop).toBe(true);

        // Drop Ace onto King
        consume(game.dropCard(spadeAce!, f0));
        expect(f0.peek()!.rank).toBe(Rank.Ace);

        // Find Two of Spades card
        const spadeTwo = game.cards.find(c => c.rank === Rank.Two && c.suit === Suit.Spades && c.pile !== f0);
        expect(spadeTwo).toBeDefined();

        // Drop Two onto Ace
        consume(game.dropCard(spadeTwo!, f0));
        expect(f0.peek()!.rank).toBe(Rank.Two);
    });

    it('should build foundation 6 in suit from Ace of Hearts to Queen of Hearts', () => {
        consume(game.restart(222));

        const f6 = game.foundations[6] ?? Debug.error();
        expect(f6.peek()!.rank).toBe(Rank.Ace);
        expect(f6.peek()!.suit).toBe(Suit.Hearts);

        // Find Two of Hearts card
        const heartTwo = game.cards.find(c => c.rank === Rank.Two && c.suit === Suit.Hearts && c.pile !== f6 && c.pile !== game.sultan);
        expect(heartTwo).toBeDefined();

        // Check drop
        const canDrop = (game as any).previewDrop_(heartTwo!, f6);
        expect(canDrop).toBe(true);

        // Drop Two onto Ace
        consume(game.dropCard(heartTwo!, f6));
        expect(f6.peek()!.rank).toBe(Rank.Two);
    });

    it('should immediately refill empty reserve slot from waste, or stock if waste is empty', () => {
        // Disable automatic moves to observe reserve refill in isolation
        game.options.autoMoveToFoundation = 0;
        consume(game.restart(333));

        // Get reserve 0's top card
        const r0 = game.reserves[0] ?? Debug.error();
        const cardInReserve = r0.peek()!;

        // Find a foundation that we can legally play this card onto
        let targetFoundation = game.foundations.find(f => (game as any).previewDrop_(cardInReserve, f));
        if (!targetFoundation) {
            // Force a drop just to empty the reserve slot and trigger a refill
            // Find a valid card in reserves and play it
            for (let i = 0; i < 8; i++) {
                const ri = game.reserves[i] ?? Debug.error();
                const card = ri.peek()!;
                targetFoundation = game.foundations.find(f => (game as any).previewDrop_(card, f));
                if (targetFoundation) {
                    // Play it!
                    const stockLengthBefore = game.stock.length;
                    consume(game.dropCard(card, targetFoundation));
                    // The slot should have been played and refilled immediately!
                    expect(ri.length).toBe(1);
                    expect(game.stock.length).toBe(stockLengthBefore - 1);
                    break;
                }
            }
        } else {
            const stockLengthBefore = game.stock.length;
            consume(game.dropCard(cardInReserve, targetFoundation));
            expect(r0.length).toBe(1);
            expect(game.stock.length).toBe(stockLengthBefore - 1);
        }
    });

    it('should register game won state correctly when all active foundations are fully built', () => {
        consume(game.restart(444));
        expect(game.won).toBe(false);

        // Let's manually build up foundations to win the game
        // Clear stock and waste and reserves first to make it a clean mock
        for (const reserve of game.reserves) {
            const r = reserve ?? Debug.error();
            while (r.length > 0) {
                game.stock.push(r.peek()!);
            }
        }
        while (game.waste.length > 0) {
            game.stock.push(game.waste.peek()!);
        }

        // We have 8 active foundations.
        const foundationTargets: { suit: Suit; baseRank: Rank }[] = [
            { suit: Suit.Spades, baseRank: Rank.King },
            { suit: Suit.Diamonds, baseRank: Rank.King },
            { suit: Suit.Clubs, baseRank: Rank.King },
            { suit: Suit.Spades, baseRank: Rank.King },
            { suit: Suit.Clubs, baseRank: Rank.King },
            { suit: Suit.Diamonds, baseRank: Rank.King },
            { suit: Suit.Hearts, baseRank: Rank.Ace },
            { suit: Suit.Hearts, baseRank: Rank.King },
        ];

        // Create a list of required cards for each foundation
        for (let i = 0; i < 8; i++) {
            const target = foundationTargets[i] ?? Debug.error();
            const pile = game.foundations[i] ?? Debug.error();
            // Clear except base
            const baseCard = pile.at(0);
            (pile as any).cards_ = [baseCard];

            // Build ranks list from base to Queen
            const ranksList: Rank[] = [];
            if (target.baseRank === Rank.King) {
                // Sequence is Ace -> Two -> ... -> Queen
                ranksList.push(Rank.Ace, Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen);
            } else {
                // Sequence is Two -> Three -> ... -> Queen
                ranksList.push(Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen);
            }

            for (const rank of ranksList) {
                // Find a matching card in game.stock
                let foundCard: any = undefined;
                for (let k = 0; k < game.stock.length; k++) {
                    const c = game.stock.at(k);
                    if (c.rank === rank && c.suit === target.suit && c !== baseCard && c !== game.sultan.peek()) {
                        foundCard = c;
                        break;
                    }
                }
                expect(foundCard).toBeDefined();
                pile.push(foundCard);
            }
        }

        // Verify pile lengths: 7 piles with 13 cards, 1 pile with 12 cards
        for (let i = 0; i < 8; i++) {
            const expectedLength = (i === 6) ? 12 : 13;
            const f = game.foundations[i] ?? Debug.error();
            expect(f.length).toBe(expectedLength);
        }

        // Explicitly trigger check won after mock direct pile mutations (as per memory rule)
        (game as any).checkWon_();

        expect(game.won).toBe(true);
    });
});
