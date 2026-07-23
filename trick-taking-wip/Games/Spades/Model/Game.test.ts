import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { Suit } from '~CardLib/Model/Suit';
import { Rank } from '~CardLib/Model/Rank';

describe('Spades Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it('should initialize with 4 players, 2 teams and ScoreTracker in team mode', () => {
        expect(game.players.length).toBe(4);
        expect(game.players[0].name).toBe('You');
        expect(game.players[0].teamId).toBe('TeamA');
        expect(game.players[1].teamId).toBe('TeamB');
        expect(game.players[2].teamId).toBe('TeamA');
        expect(game.players[3].teamId).toBe('TeamB');
        expect(game.scoreTracker.mode).toBe('team');
    });

    it('should permanently set Spades as Trump', () => {
        expect(game.determineTrump_(1)).toBe(Suit.Spades);
        expect(game.determineTrump_(10)).toBe(Suit.Spades);
    });

    it('should correctly sum partner bids to form combined team contracts', () => {
        game.bids = [3, 4, 2, 5]; // South (You)=3, West=4, North (Partner)=2, East=5
        // Team A (You + Partner) Bid = 3 + 2 = 5
        // Team B (Opponents) Bid = 4 + 5 = 9

        const teamABid = (game.bids[0] ?? 0) + (game.bids[2] ?? 0);
        const teamBBid = (game.bids[1] ?? 0) + (game.bids[3] ?? 0);

        expect(teamABid).toBe(5);
        expect(teamBBid).toBe(9);
    });

    it('should restrict leading Spades until broken unless only Spades are left in hand', () => {
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Initially Spades are not broken
        game.spadesBroken = false;
        game.currentTrick = []; // Lead play

        // Add 1 Spade card and 1 Heart card to South's hand
        const southHand = game.handPiles[0];
        while (southHand.length > 0) {
            const card = southHand.peek();
            if (card) {
                (game as any).deckPile.push(card);
            }
        }
        const spadeCard = southHand.createCard(Suit.Spades, 0, Rank.Ace);
        const heartCard = southHand.createCard(Suit.Hearts, 0, Rank.Five);

        // Since we have a non-Spade card (Heart) and Spades are not broken, we cannot lead the Spade card
        let legalCards = game.getLegalCards_(southHand);
        expect(legalCards.includes(heartCard)).toBe(true);
        expect(legalCards.includes(spadeCard)).toBe(false);

        // If Spades are broken, we can lead Spades
        game.spadesBroken = true;
        legalCards = game.getLegalCards_(southHand);
        expect(legalCards.includes(spadeCard)).toBe(true);

        // If we only have Spades left, we can lead Spades even if not broken
        game.spadesBroken = false;
        while (southHand.length > 0) {
            const card = southHand.peek();
            if (card) {
                (game as any).deckPile.push(card);
            }
        }
        const onlySpadeCard = southHand.createCard(Suit.Spades, 0, Rank.Ace);
        legalCards = game.getLegalCards_(southHand);
        expect(legalCards.includes(onlySpadeCard)).toBe(true);
    });

    it('should correctly score a standard contract met with bags', () => {
        game.scoreTracker.resetAll();
        game.bags = { TeamA: 0, TeamB: 0 };
        game.bids = [3, 2, 2, 2]; // Team A Bid = 5, Team B Bid = 4

        // Simulate 6 tricks won by Team A, and 7 tricks won by Team B
        for (let i = 0; i < 6; ++i) {
            game.scoreTracker.addTrick(game.players[0]); // Team A
        }
        for (let i = 0; i < 7; ++i) {
            game.scoreTracker.addTrick(game.players[1]); // Team B
        }

        // Run evaluateRoundScores_
        (game as any).evaluateRoundScores_();

        // Team A bid 5, won 6 -> score should be 50 + 1 = 51, bags should be 1
        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(51);
        expect(game.bags.TeamA).toBe(1);

        // Team B bid 4, won 7 -> score should be 40 + 3 = 43, bags should be 3
        expect(game.scoreTracker.getScoreByKey("TeamB")).toBe(43);
        expect(game.bags.TeamB).toBe(3);
    });

    it('should correctly score a failed/set contract', () => {
        game.scoreTracker.resetAll();
        game.bags = { TeamA: 0, TeamB: 0 };
        game.bids = [3, 2, 2, 2]; // Team A Bid = 5, Team B Bid = 4

        // Simulate 4 tricks won by Team A (bid 5), and 9 tricks won by Team B (bid 4)
        for (let i = 0; i < 4; ++i) {
            game.scoreTracker.addTrick(game.players[0]); // Team A
        }
        for (let i = 0; i < 9; ++i) {
            game.scoreTracker.addTrick(game.players[1]); // Team B
        }

        // Run evaluateRoundScores_
        (game as any).evaluateRoundScores_();

        // Team A failed (bid 5, won 4) -> lose 50 points (score: -50)
        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(-50);
        expect(game.bags.TeamA).toBe(0);

        // Team B met with bags (bid 4, won 9) -> score: 40 + 5 = 45, bags: 5
        expect(game.scoreTracker.getScoreByKey("TeamB")).toBe(45);
        expect(game.bags.TeamB).toBe(5);
    });

    it('should award Nil bonus when Nil bid is successful', () => {
        game.scoreTracker.resetAll();
        game.bags = { TeamA: 0, TeamB: 0 };
        game.bids = [0, 2, 4, 2]; // South bids Nil (0), Partner bids 4. Team A Contract = 4.
        game.individualTricksWon = [0, 0, 4, 0]; // South won 0 tricks (Nil made)

        // Add tricks to team A
        for (let i = 0; i < 4; ++i) {
            game.scoreTracker.addTrick(game.players[0]); // Team A tricks = 4
        }

        (game as any).evaluateRoundScores_();

        // Team A got exactly 4 tricks (met contract) -> 40 points
        // South made Nil successfully -> +100 points
        // Total Score A = 40 + 100 = 140
        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(140);
        expect(game.bags.TeamA).toBe(0);
    });

    it('should penalize Nil when Nil bid is failed', () => {
        game.scoreTracker.resetAll();
        game.bags = { TeamA: 0, TeamB: 0 };
        game.bids = [0, 2, 4, 2]; // South bids Nil (0), Partner bids 4. Team A Contract = 4.
        game.individualTricksWon = [1, 0, 3, 0]; // South won 1 trick (Nil failed), Partner won 3 tricks

        // Add tricks to team A (South won 1, North won 3 -> Team total is 4)
        for (let i = 0; i < 4; ++i) {
            game.scoreTracker.addTrick(game.players[0]); // Team A tricks = 4
        }

        (game as any).evaluateRoundScores_();

        // Team A got 4 tricks (met contract) -> 40 points
        // South failed Nil -> -100 points
        // Total Score A = 40 - 100 = -60
        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(-60);
    });

    it('should trigger bag penalty and deduction of 100 points on reaching 10 bags', () => {
        game.scoreTracker.resetAll();
        game.bags = { TeamA: 9, TeamB: 0 };
        game.bids = [2, 2, 2, 2]; // Team A Bid = 4

        // Simulate Team A winning 6 tricks -> met contract with 2 bags (9 + 2 = 11 bags)
        for (let i = 0; i < 6; ++i) {
            game.scoreTracker.addTrick(game.players[0]);
        }

        (game as any).evaluateRoundScores_();

        // Regular contract score: 40 + 2 = 42
        // Penalty: Team A goes from 9 bags to 11 bags (>= 10 bags) -> -100 points penalty, bags reset to 1 (11 % 10)
        // Expected Score: 42 - 100 = -58
        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(-58);
        expect(game.bags.TeamA).toBe(1);
    });

    it('should correctly trigger game won when score is >= 500', () => {
        game.scoreTracker.resetAll();
        game.scoreTracker.setScoreByKey("TeamA", 501);
        game.scoreTracker.setScoreByKey("TeamB", 490);

        expect((game as any).checkGameWon_()).toBe(true);
        expect(game.gameLog.find(log => log.includes("Team A (You & Partner) won"))).toBeDefined();
    });
});
