import { describe, it, expect, beforeEach } from 'vitest';
import { Game, getSkatBidValues } from './Game';
import { Suit } from '~CardLib/Model/Suit';
import { Rank } from '~CardLib/Model/Rank';

describe('Skat Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it('should initialize with 3 players, 32 cards, and 120 total card-points', () => {
        expect(game.players.length).toBe(3);
        expect(game.players[0].name).toBe('You');
        expect(game.players[1].name).toBe('AI West');
        expect(game.players[2].name).toBe('AI East');
        expect(game.cards.length).toBe(32);

        // Verify card points count to exactly 120
        let totalPts = 0;
        for (const card of game.cards) {
            totalPts += game.getCardPoints_(card);
            // Verify no 2-6 cards exist
            expect(card.rank).not.toBe(Rank.Two);
            expect(card.rank).not.toBe(Rank.Three);
            expect(card.rank).not.toBe(Rank.Four);
            expect(card.rank).not.toBe(Rank.Five);
            expect(card.rank).not.toBe(Rank.Six);
        }
        expect(totalPts).toBe(120);
    });

    it('should follow the 3-3-4 pattern dealing 10 cards to each player and 2 cards to Skat', () => {
        game.dealerIndex = 1;
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        expect(game.handPiles[0].length).toBe(10);
        expect(game.handPiles[1].length).toBe(10);
        expect(game.handPiles[2].length).toBe(10);
        expect(game.skatPile.length).toBe(2);
    });

    it('should establish correct pairwise asymmetric bidding sequence', () => {
        game.dealerIndex = 1;
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Bidding should be active
        expect(game.isBiddingPhase).toBe(true);
        expect(game.biddingStage).toBe(0); // Middlehand vs Forehand first

        const forehandIdx = (game.dealerIndex + 1) % 3;
        const middlehandIdx = (game.dealerIndex + 2) % 3;
        const rearhandIdx = game.dealerIndex;

        expect(game.passiveBidderIndex).toBe(forehandIdx);
        expect(game.activeBidderIndex).toBe(middlehandIdx);
    });

    it('should correctly prioritize Jacks in Suit and Grand games', () => {
        game.contractType = 'Suit';
        game.chosenTrumpSuit = Suit.Hearts;

        const clubJack = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Jack)!;
        const spadeJack = game.cards.find(c => c.suit === Suit.Spades && c.rank === Rank.Jack)!;
        const heartJack = game.cards.find(c => c.suit === Suit.Hearts && c.rank === Rank.Jack)!;
        const diamondJack = game.cards.find(c => c.suit === Suit.Diamonds && c.rank === Rank.Jack)!;
        const heartAce = game.cards.find(c => c.suit === Suit.Hearts && c.rank === Rank.Ace)!;

        // Verify Jack as trump priority Clubs > Spades > Hearts > Diamonds
        expect(game.isCardTrump_(clubJack)).toBe(true);
        expect(game.isCardTrump_(spadeJack)).toBe(true);
        expect(game.isCardTrump_(heartJack)).toBe(true);
        expect(game.isCardTrump_(diamondJack)).toBe(true);

        expect(game.getTrumpRankValue_(clubJack)).toBeGreaterThan(game.getTrumpRankValue_(spadeJack));
        expect(game.getTrumpRankValue_(spadeJack)).toBeGreaterThan(game.getTrumpRankValue_(heartJack));
        expect(game.getTrumpRankValue_(heartJack)).toBeGreaterThan(game.getTrumpRankValue_(diamondJack));
        expect(game.getTrumpRankValue_(diamondJack)).toBeGreaterThan(game.getTrumpRankValue_(heartAce));
    });

    it('should handle natural card rankings and no-jack-privilege in Null games', () => {
        game.contractType = 'Null';

        const heartJack = game.cards.find(c => c.suit === Suit.Hearts && c.rank === Rank.Jack)!;
        const heartTen = game.cards.find(c => c.suit === Suit.Hearts && c.rank === Rank.Ten)!;
        const heartNine = game.cards.find(c => c.suit === Suit.Hearts && c.rank === Rank.Nine)!;

        expect(game.isCardTrump_(heartJack)).toBe(false);

        // In Null, ranking is A > K > Q > J > 10 > 9 > 8 > 7
        // So J ranks higher than 10, 10 ranks higher than 9
        expect(game.getNonTrumpRankValue_(heartJack)).toBeGreaterThan(game.getNonTrumpRankValue_(heartTen));
        expect(game.getNonTrumpRankValue_(heartTen)).toBeGreaterThan(game.getNonTrumpRankValue_(heartNine));
    });

    it('should compute exact matador counts (with and without top trumps)', () => {
        game.declarerIndex = 0;
        game.contractType = 'Suit';
        game.chosenTrumpSuit = Suit.Clubs;

        // Clear South hand and Skat
        const hand = game.handPiles[0];
        while (hand.length > 0) { game.deckPile.push(hand.peek()!); }
        while (game.skatPile.length > 0) { game.deckPile.push(game.skatPile.peek()!); }

        const clubJack = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Jack)!;
        const spadeJack = game.cards.find(c => c.suit === Suit.Spades && c.rank === Rank.Jack)!;
        const heartJack = game.cards.find(c => c.suit === Suit.Hearts && c.rank === Rank.Jack)!;

        // South has Club Jack and Spade Jack -> "With 2"
        hand.push(clubJack);
        hand.push(spadeJack);

        let matadors = game.calculateMatadors_();
        expect(matadors.count).toBe(2);
        expect(matadors.withMatadors).toBe(true);

        // Clear and check "Without"
        while (hand.length > 0) { game.deckPile.push(hand.peek()!); }

        // South has Heart Jack but NOT Club Jack or Spade Jack -> "Without 2"
        hand.push(heartJack);

        matadors = game.calculateMatadors_();
        expect(matadors.count).toBe(2);
        expect(matadors.withMatadors).toBe(false);
    });

    it('should calculate scoring multipliers and asymmetric double loss penalties', () => {
        game.declarerIndex = 0;
        game.contractType = 'Suit';
        game.chosenTrumpSuit = Suit.Clubs; // Base value 12
        game.currentBid = 18;

        const hand = game.handPiles[0];
        while (hand.length > 0) { game.deckPile.push(hand.peek()!); }
        while (game.skatPile.length > 0) { game.deckPile.push(game.skatPile.peek()!); }

        // 1. South plays a normal skat game. South has Club Jack -> "with 1".
        const clubJack = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Jack)!;
        hand.push(clubJack);

        // South gets 70 card points and 5 tricks won (not Schwarz/0)
        game.roundCardPoints[0] = 70;
        game.roundTricksCount[0] = 5;
        game.scoreTracker.setScore(game.players[0], 100);

        // Evaluate victory: game multiplier is Matadors(1) + 1 = 2. Game value = 12 * 2 = 24.
        game.evaluateRoundScores_();
        expect(game.scoreTracker.getScore(game.players[0])).toBe(124); // 100 + 24

        // 2. Now South loses. Score goes down by DOUBLE the game value.
        game.scoreTracker.setScore(game.players[0], 100);
        game.roundCardPoints[0] = 50; // Failed! (Less than 61)
        game.roundTricksCount[0] = 4; // Not Schwarz

        game.evaluateRoundScores_();
        // Lost value = 24. Penalized by double = 48.
        expect(game.scoreTracker.getScore(game.players[0])).toBe(52); // 100 - 48
    });

    it('should implement the overbidding check and raise loss value to lowest multiple >= bid', () => {
        game.declarerIndex = 0;
        game.contractType = 'Suit';
        game.chosenTrumpSuit = Suit.Diamonds; // Base value 9
        game.currentBid = 30; // Bid is 30

        const hand = game.handPiles[0];
        while (hand.length > 0) { game.deckPile.push(hand.peek()!); }
        while (game.skatPile.length > 0) { game.deckPile.push(game.skatPile.peek()!); }

        // South has Club Jack -> "with 1". Base multiplier = 2.
        // Actually played game value would be 9 * 2 = 18.
        // But bid was 30! This is an overbid.
        const clubJack = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Jack)!;
        hand.push(clubJack);

        // South got 65 card points (met 61 points target, but overbid, so it is a loss)
        game.roundCardPoints[0] = 65;
        game.roundTricksCount[0] = 5; // Not Schwarz
        game.scoreTracker.setScore(game.players[0], 100);

        game.evaluateRoundScores_();

        // Overbid calculation: lowest multiple of 9 >= 30 is 36 (4 * 9).
        // Penalty is double = 72.
        expect(game.scoreTracker.getScore(game.players[0])).toBe(28); // 100 - 72
    });

    it('should score Null games flat fixed value correctly regardless of matadors', () => {
        game.declarerIndex = 0;
        game.contractType = 'Null';
        game.isHandGame = true; // Null Hand is 35 points
        game.currentBid = 18;

        const hand = game.handPiles[0];
        while (hand.length > 0) { game.deckPile.push(hand.peek()!); }
        while (game.skatPile.length > 0) { game.deckPile.push(game.skatPile.peek()!); }

        // South has Club Jack, but it should not affect flat Null score
        const clubJack = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Jack)!;
        hand.push(clubJack);

        // South took 0 tricks -> Clean victory
        game.roundTricksCount[0] = 0;
        game.scoreTracker.setScore(game.players[0], 100);

        game.evaluateRoundScores_();
        expect(game.scoreTracker.getScore(game.players[0])).toBe(135); // 100 + 35 flat
    });
});
