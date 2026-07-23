import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { Suit } from '~CardLib/Model/Suit';
import { Rank } from '~CardLib/Model/Rank';
import { BridgeBid } from './IGame';

describe('Bridge Game Model', () => {
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

    it('should correctly compare bids based on level and strain', () => {
        const bid1: BridgeBid = { level: 1, suit: Suit.Clubs, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 0 };
        const bid2: BridgeBid = { level: 1, suit: Suit.Diamonds, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 1 };
        const bid3: BridgeBid = { level: 1, suit: "no-trump", isPass: false, isDouble: false, isRedouble: false, bidderIndex: 2 };
        const bid4: BridgeBid = { level: 2, suit: Suit.Clubs, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 3 };

        expect(game.compareBids(bid2, bid1)).toBeGreaterThan(0);
        expect(game.compareBids(bid3, bid2)).toBeGreaterThan(0);
        expect(game.compareBids(bid4, bid3)).toBeGreaterThan(0);
        expect(game.compareBids(bid1, bid4)).toBeLessThan(0);
    });

    it('should calculate HCP correctly', () => {
        const hand = game.handPiles[0];
        while (hand.length > 0) {
            const card = hand.peek();
            if (card) {
                (game as any).deckPile.push(card);
            }
        }

        // Add 13 cards to make a balanced hand with 16 HCP (4 Aces)
        // Spades: Ace, 2, 3, 4 (4 cards)
        hand.createCard(Suit.Spades, 0, Rank.Ace);
        hand.createCard(Suit.Spades, 0, Rank.Two);
        hand.createCard(Suit.Spades, 0, Rank.Three);
        hand.createCard(Suit.Spades, 0, Rank.Four);
        // Hearts: Ace, 2, 3 (3 cards)
        hand.createCard(Suit.Hearts, 0, Rank.Ace);
        hand.createCard(Suit.Hearts, 0, Rank.Two);
        hand.createCard(Suit.Hearts, 0, Rank.Three);
        // Diamonds: Ace, 2, 3 (3 cards)
        hand.createCard(Suit.Diamonds, 0, Rank.Ace);
        hand.createCard(Suit.Diamonds, 0, Rank.Two);
        hand.createCard(Suit.Diamonds, 0, Rank.Three);
        // Clubs: Ace, 2, 3 (3 cards)
        hand.createCard(Suit.Clubs, 0, Rank.Ace);
        hand.createCard(Suit.Clubs, 0, Rank.Two);
        hand.createCard(Suit.Clubs, 0, Rank.Three);

        // Call evaluateAIBid_ to check HCP calculation
        const bid = game.evaluateAIBid_(0);
        // HCP should be 16 (4 * 4). Balanced hand. Should open 1NT!
        expect(bid.suit).toBe('no-trump');
        expect(bid.level).toBe(1);
    });

    it('should determine declarer based on the FIRST partner to name the strain', () => {
        // Initialize game round first so players/decks are set up and bids won't be cleared
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Auction:
        // South bids 1 Hearts (Team A)
        // West passes
        // North bids 2 Hearts (Team A) -> contract strain is Hearts
        // East passes, South passes, West passes -> Hearts is contract
        // Since South (You, index 0) named Hearts FIRST, South must be declarer, not North (index 2)
        game.bids = [
            { level: 1, suit: Suit.Hearts, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 0 }, // South
            { level: 0, suit: Suit.None, isPass: true, isDouble: false, isRedouble: false, bidderIndex: 1 }, // West
            { level: 2, suit: Suit.Hearts, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 2 }, // North
            { level: 0, suit: Suit.None, isPass: true, isDouble: false, isRedouble: false, bidderIndex: 3 }, // East
            { level: 0, suit: Suit.None, isPass: true, isDouble: false, isRedouble: false, bidderIndex: 0 }, // South
            { level: 0, suit: Suit.None, isPass: true, isDouble: false, isRedouble: false, bidderIndex: 1 }  // West
        ];

        // Run play phase start manually to verify declarer and dummy identification
        const playGen = game.startPlayPhase_();
        res = playGen.next();
        while (!res.done) {
            res = playGen.next();
        }

        expect(game.declarerIndex).toBe(0); // South (You)
        expect(game.dummyIndex).toBe(2); // North (Partner)
    });

    it('should reveal dummy hand face-up on the opening lead', () => {
        // Initialize round
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        game.declarerIndex = 0;
        game.dummyIndex = 2;
        game.dummyRevealed = false;
        game.contract = { level: 4, suit: Suit.Spades, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 0 };

        // Make dummy hand cards face down
        const dummyHand = game.handPiles[2];
        while (dummyHand.length > 0) {
            const card = dummyHand.peek();
            if (card) {
                (game as any).deckPile.push(card);
            }
        }
        const dummyCard = dummyHand.createCard(Suit.Spades, 0, Rank.Five);
        dummyCard.doSetFaceUp(false);

        // West plays opening lead (index 1 is West, left of South)
        const westHand = game.handPiles[1];
        while (westHand.length > 0) {
            const card = westHand.peek();
            if (card) {
                (game as any).deckPile.push(card);
            }
        }
        const leadCard = westHand.createCard(Suit.Spades, 0, Rank.Ace);

        const playGen = (game as any).playCard_(leadCard, game.players[1]);
        res = playGen.next();
        while (!res.done) {
            res = playGen.next();
        }

        // After opening lead, dummy hand should be revealed
        expect(game.dummyRevealed).toBe(true);
        expect(dummyCard.faceUp).toBe(true);
    });

    it('should correctly score an undoubled contract below and above the line', () => {
        // Contract: 3 Hearts by Team A, not vulnerable, made 10 tricks (1 overtrick)
        game.contract = { level: 3, suit: Suit.Hearts, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 0 };
        game.declarerIndex = 0;
        game.isDoubled = false;
        game.isRedoubled = false;
        game.gamesWon = { TeamA: 0, TeamB: 0 };
        game.belowTheLineScore = { TeamA: 0, TeamB: 0 };
        game.aboveTheLineScore = { TeamA: 0, TeamB: 0 };

        // South wins 10 tricks (team score since ScoreTracker is in team mode)
        game.scoreTracker.resetAll();
        for (let i = 0; i < 10; ++i) {
            game.scoreTracker.addTrick(game.players[0]);
        }

        (game as any).evaluateRoundScores_();

        // 3 Hearts bid & made: 3 * 30 = 90 trick points below the line
        expect(game.belowTheLineScore.TeamA).toBe(90);
        // 1 overtrick in Hearts: 1 * 30 = 30 points above the line
        expect(game.aboveTheLineScore.TeamA).toBe(30);
    });

    it('should correctly score a doubled contract with double trick points and overtricks', () => {
        // Contract: 2 Diamonds doubled by Team A, vulnerable (gamesWon TeamA = 1), made 9 tricks (1 overtrick)
        game.contract = { level: 2, suit: Suit.Diamonds, isPass: false, isDouble: true, isRedouble: false, bidderIndex: 0 };
        game.declarerIndex = 0;
        game.isDoubled = true;
        game.isRedoubled = false;
        game.gamesWon = { TeamA: 1, TeamB: 0 };
        game.belowTheLineScore = { TeamA: 0, TeamB: 0 };
        game.aboveTheLineScore = { TeamA: 0, TeamB: 0 };

        // 9 tricks won by Team A
        game.scoreTracker.resetAll();
        for (let i = 0; i < 9; ++i) {
            game.scoreTracker.addTrick(game.players[0]);
        }

        (game as any).evaluateRoundScores_();

        // 2 Diamonds doubled: base 2 * 20 = 40. Doubled = 40 * 2 = 80 points below the line
        expect(game.belowTheLineScore.TeamA).toBe(80);
        // 1 overtrick doubled & vulnerable: 200 points above the line. Plus insult bonus: 50. Total above: 250
        expect(game.aboveTheLineScore.TeamA).toBe(250);
    });

    it('should correctly score undertrick penalties for vulnerable and doubled failure', () => {
        // Contract: 4 Spades doubled by Team A, vulnerable (gamesWon TeamA = 1), made 7 tricks (3 undertricks)
        game.contract = { level: 4, suit: Suit.Spades, isPass: false, isDouble: true, isRedouble: false, bidderIndex: 0 };
        game.declarerIndex = 0;
        game.isDoubled = true;
        game.isRedoubled = false;
        game.gamesWon = { TeamA: 1, TeamB: 0 };
        game.belowTheLineScore = { TeamA: 0, TeamB: 0 };
        game.aboveTheLineScore = { TeamA: 0, TeamB: 0 };

        // 7 tricks won by Team A
        game.scoreTracker.resetAll();
        for (let i = 0; i < 7; ++i) {
            game.scoreTracker.addTrick(game.players[0]);
        }

        (game as any).evaluateRoundScores_();

        // 3 undertricks, vulnerable, doubled:
        // 1st undertrick: 200
        // 2nd undertrick: 300
        // 3rd undertrick: 300
        // Total penalty: 800 above the line for defenders (Team B)
        expect(game.aboveTheLineScore.TeamB).toBe(800);
        expect(game.belowTheLineScore.TeamA).toBe(0);
    });

    it('should award honors bonus correctly for 4 of 5 trump honors in one hand', () => {
        game.contract = { level: 2, suit: Suit.Spades, isPass: false, isDouble: false, isRedouble: false, bidderIndex: 0 };
        game.declarerIndex = 0;
        game.gamesWon = { TeamA: 0, TeamB: 0 };
        game.belowTheLineScore = { TeamA: 0, TeamB: 0 };
        game.aboveTheLineScore = { TeamA: 0, TeamB: 0 };

        // Set South original hand to hold 4 of the 5 Spades honors (Ace, King, Queen, Jack)
        const originalHand = game.handPiles[0];
        while (originalHand.length > 0) {
            const card = originalHand.peek();
            if (card) {
                (game as any).deckPile.push(card);
            }
        }
        originalHand.createCard(Suit.Spades, 0, Rank.Ace);
        originalHand.createCard(Suit.Spades, 0, Rank.King);
        originalHand.createCard(Suit.Spades, 0, Rank.Queen);
        originalHand.createCard(Suit.Spades, 0, Rank.Jack);
        originalHand.createCard(Suit.Hearts, 0, Rank.Two); // Non-honor

        (game as any).originalHands[0] = [...originalHand];

        // 8 tricks won by Team A (contract made exactly, no overtricks)
        game.scoreTracker.resetAll();
        for (let i = 0; i < 8; ++i) {
            game.scoreTracker.addTrick(game.players[0]);
        }

        (game as any).evaluateRoundScores_();

        // Trick points: 2 * 30 = 60 below the line
        expect(game.belowTheLineScore.TeamA).toBe(60);
        // Honors bonus: 100 points above the line
        expect(game.aboveTheLineScore.TeamA).toBe(100);
    });
});
