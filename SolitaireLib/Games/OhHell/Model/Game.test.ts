import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { Suit } from '~CardLib/Model/Suit';
import { Rank } from '~CardLib/Model/Rank';

describe('OhHell Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it('should initialize with 4 players, individual mode, and score tracker in player mode', () => {
        expect(game.players.length).toBe(4);
        expect(game.players[0].name).toBe('You');
        expect(game.players[0].isHuman).toBe(true);
        expect(game.players[1].isHuman).toBe(false);
        expect(game.scoreTracker.mode).toBe('player');
    });

    it('should deal correct number of cards per round (10 down to 1)', () => {
        // Round 1
        game.roundNumber = 1;
        const gen1 = game.restart(12345);
        let res1 = gen1.next();
        while (!res1.done) {
            res1 = gen1.next();
        }

        expect(game.handPiles[0].length).toBe(10);
        expect(game.handPiles[1].length).toBe(10);
        expect(game.handPiles[2].length).toBe(10);
        expect(game.handPiles[3].length).toBe(10);

        // Human hand should be fanned face up, AIs face down
        expect(game.handPiles[0].at(0).faceUp).toBe(true);
        expect(game.handPiles[1].at(0).faceUp).toBe(false);
    });

    it('should correctly set trump suit from revealed deck card', () => {
        const gen = game.restart(12345);
        let res = gen.next();
        while (!res.done) {
            res = gen.next();
        }

        expect(game.revealedTrumpCard).toBeDefined();
        if (game.revealedTrumpCard) {
            expect(game.revealedTrumpCard.faceUp).toBe(true);
            expect(game.trumpSuit).toBe(game.revealedTrumpCard.suit);
        }
    });

    it('should run sequential bidding phase correctly', () => {
        const gen = game.restart(12345);
        let res = gen.next();
        // Since first leader/bidding starter is random, it might stop at human bidding right away
        // or go through a few AI bids. Let's consume the generator until it is waiting for human bid
        while (!res.done && !game.waitingForHumanBid) {
            res = gen.next();
        }

        expect(game.isBiddingPhase).toBe(true);
        expect(game.waitingForHumanBid).toBe(true);

        const humanIdx = game.players.findIndex(p => p.isHuman);
        expect(game.biddingPlayerIndex).toBe(humanIdx);

        // Human bids 3
        const submitGen = game.submitHumanBid_(3);
        let sRes = submitGen.next();
        while (!sRes.done) {
            sRes = submitGen.next();
        }

        // Bidding should have completed, meaning all players have bids, isBiddingPhase is false, waitingForHumanPlay is true
        expect(game.isBiddingPhase).toBe(false);
        expect(game.waitingForHumanBid).toBe(false);
        expect(game.bids[humanIdx]).toBe(3);
        expect(game.bids.every(b => b !== null)).toBe(true);
        expect(game.waitingForHumanPlay).toBe(true);
    });

    it('should evaluate AI bid accurately with evaluateAIBid_', () => {
        game.trumpSuit = Suit.Hearts;
        game.roundNumber = 1; // handSize = 10

        // Create high cards
        game.handPiles[1].createCard(Suit.Hearts, 0, Rank.Ace); // Trump Ace -> +1.0
        game.handPiles[1].createCard(Suit.Hearts, 0, Rank.Two); // Trump low -> +0.4
        game.handPiles[1].createCard(Suit.Spades, 0, Rank.Ace); // Plain Ace -> +0.8
        game.handPiles[1].createCard(Suit.Diamonds, 0, Rank.Five); // Nothing

        const bid = game.evaluateAIBid_(1);
        // 1.0 + 0.4 + 0.8 = 2.2 -> round to 2
        expect(bid).toBe(2);
    });

    it('should implement AI choosePlay correctly', () => {
        game.trumpSuit = Suit.Hearts;
        game.roundNumber = 1;

        // Player 1 has Ace of Spades and Two of Spades
        const hSpade = game.handPiles[1].createCard(Suit.Spades, 0, Rank.Ace);
        const lSpade = game.handPiles[1].createCard(Suit.Spades, 0, Rank.Two);

        // If we are leading and need tricks
        game.bids[1] = 2;
        game.scoreTracker.resetAll(); // tricks won = 0
        game.currentTrick = [];

        let chosen = (game as any).chooseAIPlay_(game.players[1]);
        expect(chosen).toBe(hSpade); // Play high to win

        // If we are leading and do NOT need tricks (met bid)
        game.bids[1] = 0;
        chosen = (game as any).chooseAIPlay_(game.players[1]);
        expect(chosen).toBe(lSpade); // Play low to avoid winning
    });

    it('should score exactly 10 + bid for hitting exact bid, and 0 otherwise', () => {
        game.scoreTracker.resetAll();

        // Player 0 (human) bid 3, won 3 -> scores 13
        game.bids[0] = 3;
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);
        game.scoreTracker.addTrick(game.players[0]);

        // Player 1 bid 2, won 1 -> scores 0
        game.bids[1] = 2;
        game.scoreTracker.addTrick(game.players[1]);

        (game as any).evaluateRoundScores_();

        expect(game.scoreTracker.getScore(game.players[0])).toBe(13);
        expect(game.scoreTracker.getScore(game.players[1])).toBe(0);
    });

    it('should correctly trigger game-win after 10 rounds', () => {
        game.roundNumber = 9;
        expect((game as any).checkGameWon_()).toBe(false);

        game.roundNumber = 10;
        expect((game as any).checkGameWon_()).toBe(true);
    });
});
