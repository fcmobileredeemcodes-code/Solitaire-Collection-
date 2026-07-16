import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game, getEffectiveSuit, getTrumpValue } from './Game';
import { Suit } from '~CardLib/Model/Suit';
import { Rank } from '~CardLib/Model/Rank';

describe('Euchre Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it('should initialize with 4 players, 2 teams and 24 cards', () => {
        expect(game.players.length).toBe(4);
        expect(game.players[0].name).toBe('You');
        expect(game.players[0].teamId).toBe('TeamA');
        expect(game.players[1].teamId).toBe('TeamB');
        expect(game.players[2].teamId).toBe('TeamA');
        expect(game.players[3].teamId).toBe('TeamB');
        expect(game.scoreTracker.mode).toBe('team');
        expect(game.cards.length).toBe(24);

        // Verify no 2-8 cards exist in the deck
        for (const card of game.cards) {
            expect(card.rank).not.toBe(Rank.Two);
            expect(card.rank).not.toBe(Rank.Three);
            expect(card.rank).not.toBe(Rank.Four);
            expect(card.rank).not.toBe(Rank.Five);
            expect(card.rank).not.toBe(Rank.Six);
            expect(card.rank).not.toBe(Rank.Seven);
            expect(card.rank).not.toBe(Rank.Eight);
        }
    });

    it('should identify Right Bower and Left Bower with correct effective suits and values', () => {
        // Set Trump to Spades
        game.trumpSuit = Suit.Spades;

        // Jack of Spades is Right Bower
        const rightBower = game.cards.find(c => c.suit === Suit.Spades && c.rank === Rank.Jack)!;
        expect(getEffectiveSuit(rightBower, Suit.Spades)).toBe(Suit.Spades);
        expect(getTrumpValue(rightBower, Suit.Spades)).toBe(100);

        // Jack of Clubs (same color suit of Spades) is Left Bower
        const leftBower = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Jack)!;
        expect(getEffectiveSuit(leftBower, Suit.Spades)).toBe(Suit.Spades);
        expect(getTrumpValue(leftBower, Suit.Spades)).toBe(99);

        // Jack of Hearts (different color) is NOT Left Bower
        const otherJack = game.cards.find(c => c.suit === Suit.Hearts && c.rank === Rank.Jack)!;
        expect(getEffectiveSuit(otherJack, Suit.Spades)).toBe(Suit.Hearts);
        expect(getTrumpValue(otherJack, Suit.Spades)).toBe(0);
    });

    it('should enforce follow-suit rules with Left Bower as trump', () => {
        game.trumpSuit = Suit.Spades;

        const hand = game.handPiles[0];
        // Clear hand
        while (hand.length > 0) {
            hand.pop();
        }

        const leftBower = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Jack)!;
        const clubNine = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Nine)!;

        hand.push(leftBower);
        hand.push(clubNine);

        // 1. If a Club is led, Left Bower does NOT count as Club because it is Trump!
        // We must follow suit with Club Nine, and cannot play Left Bower unless we have no other clubs (but we do!)
        const leadClub = game.cards.find(c => c.suit === Suit.Clubs && c.rank === Rank.Ace)!;
        game.currentTrick = [{ player: game.players[1], card: leadClub }];

        let legal = game.getLegalCards_(hand);
        expect(legal.includes(clubNine)).toBe(true);
        expect(legal.includes(leftBower)).toBe(false); // Left Bower is Spades now!

        // 2. If a Spade is led, Left Bower counts as Trump/Spade!
        // Since we have a Spade (Left Bower), we must play it! We cannot play clubNine.
        const leadSpade = game.cards.find(c => c.suit === Suit.Spades && c.rank === Rank.Ace)!;
        game.currentTrick = [{ player: game.players[1], card: leadSpade }];

        legal = game.getLegalCards_(hand);
        expect(legal.includes(leftBower)).toBe(true);
        expect(legal.includes(clubNine)).toBe(false);
    });

    it('should enforce stick the dealer rule during Round 2 bidding', () => {
        // Mock evaluateAIBid_ so AI players always pass, ensuring bidding reaches human
        game.evaluateAIBid_ = () => ({ action: 'pass' });

        // Start game properly
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // We are now waiting for human bid (Round 1)
        expect(game.isBiddingPhase).toBe(true);
        expect(game.biddingRound).toBe(1);

        // Make dealer the human (index 0)
        game.dealerIndex = 0;
        // Bidding starts at index 1 (left of dealer)
        game.biddingPlayerIndex = 1;
        game.waitingForHumanBid = false;

        // Force everyone to pass in Round 1
        // West passes
        let bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}
        // North passes
        bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}
        // East passes
        bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}

        // Now human dealer's turn in Round 1
        expect(game.biddingPlayerIndex).toBe(0);
        expect(game.biddingRound).toBe(1);

        // Human passes
        bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}

        // Everyone passed in Round 1! We should now be in Round 2
        expect(game.biddingRound).toBe(2);
        // Starts at index 1
        expect(game.biddingPlayerIndex).toBe(1);

        // West passes Round 2
        bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}
        // North passes Round 2
        bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}
        // East passes Round 2
        bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}

        // Now human dealer's turn in Round 2
        expect(game.biddingPlayerIndex).toBe(0);

        // Stick the dealer! If human passes, it must force name-suit and start play
        bidGen = game.processBid_({ action: 'pass' });
        while (!bidGen.next().done) {}

        // Trump suit must be named, and play must have started
        expect(game.trumpSuit).not.toBe(Suit.None);
        expect(game.isBiddingPhase).toBe(false);
    });

    it('should handle partner sitting out when going alone', () => {
        // Mock evaluateAIBid_ so AI players always pass, ensuring bidding reaches human
        game.evaluateAIBid_ = () => ({ action: 'pass' });

        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Make dealer index 3 (East) so bidding starts at 0 (South/Human)
        game.dealerIndex = 3;
        game.biddingPlayerIndex = 0;
        game.waitingForHumanBid = true;

        // South goes alone
        const aloneGen = game.processBid_({ action: 'alone' });
        let r = aloneGen.next();
        while (!r.done) {
            r = aloneGen.next();
        }

        // South is maker and going alone
        expect(game.makerPlayerIndex).toBe(0);
        expect(game.alonePlayerIndex).toBe(0);

        // Partner (index 2) must sit out
        expect(game.sittingOutThisTrick[2]).toBe(true);
        expect(game.handPiles[2].length).toBe(0); // cards discarded
    });

    it('should score standard maker team victory (1 point)', () => {
        game.scoreTracker.resetAll();
        game.makerPlayerIndex = 0; // TeamA is maker
        game.alonePlayerIndex = -1; // Not alone

        // Team A wins 3 tricks, Team B wins 2 tricks
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[2]);

        game.scoreTracker.addTrick(game.players[1]);
        game.scoreTracker.addTrick(game.players[3]);

        (game as any).evaluateRoundScores_();

        expect(game.scoreTracker.getScoreByKey('TeamA')).toBe(1);
        expect(game.scoreTracker.getScoreByKey('TeamB')).toBe(0);
    });

    it('should score standard maker sweep / march (2 points)', () => {
        game.scoreTracker.resetAll();
        game.makerPlayerIndex = 0; // TeamA is maker
        game.alonePlayerIndex = -1;

        // Team A wins all 5 tricks
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[2]);
        game.scoreTracker.addTrick(game.players[2]);
        game.scoreTracker.addTrick(game.players[0]);

        (game as any).evaluateRoundScores_();

        expect(game.scoreTracker.getScoreByKey('TeamA')).toBe(2);
        expect(game.scoreTracker.getScoreByKey('TeamB')).toBe(0);
    });

    it('should score alone maker sweep (4 points)', () => {
        game.scoreTracker.resetAll();
        game.makerPlayerIndex = 0; // TeamA is maker
        game.alonePlayerIndex = 0; // South went alone

        // Team A wins all 5 tricks
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);

        (game as any).evaluateRoundScores_();

        expect(game.scoreTracker.getScoreByKey('TeamA')).toBe(4);
        expect(game.scoreTracker.getScoreByKey('TeamB')).toBe(0);
    });

    it('should score euchre points for defending team (2 points)', () => {
        game.scoreTracker.resetAll();
        game.makerPlayerIndex = 0; // TeamA is maker
        game.alonePlayerIndex = -1;

        // Defender Team B wins 3 tricks, Maker Team A wins 2 tricks
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[2]);

        game.scoreTracker.addTrick(game.players[1]);
        game.scoreTracker.addTrick(game.players[3]);
        game.scoreTracker.addTrick(game.players[1]);

        (game as any).evaluateRoundScores_();

        expect(game.scoreTracker.getScoreByKey('TeamA')).toBe(0);
        expect(game.scoreTracker.getScoreByKey('TeamB')).toBe(2); // Defenders get 2 points for euchre
    });
});
