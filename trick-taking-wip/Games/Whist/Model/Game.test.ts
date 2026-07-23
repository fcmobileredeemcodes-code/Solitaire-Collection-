import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { Suit } from '~CardLib/Model/Suit';
import { Rank } from '~CardLib/Model/Rank';

describe('Whist Game Model', () => {
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

    it('should deal 13 cards to each player on restart', () => {
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Each player starts with 13 cards; some may have played depending on who starts
        expect(game.handPiles[0].length + game.playedPiles[0].length).toBe(13);
        expect(game.handPiles[1].length + game.playedPiles[1].length).toBe(13);
        expect(game.handPiles[2].length + game.playedPiles[2].length).toBe(13);
        expect(game.handPiles[3].length + game.playedPiles[3].length).toBe(13);

        // Human hand should be face up
        expect(game.handPiles[0].at(0).faceUp).toBe(true);
    });

    it('should rotate Trump suit correctly across 5 rounds', () => {
        expect(game.determineTrump_(1)).toBe(Suit.Hearts);
        expect(game.determineTrump_(2)).toBe(Suit.Spades);
        expect(game.determineTrump_(3)).toBe(Suit.Diamonds);
        expect(game.determineTrump_(4)).toBe(Suit.Clubs);
        expect(game.determineTrump_(5)).toBe(Suit.None);
        expect(game.determineTrump_(6)).toBe(Suit.Hearts);
    });

    it('should correctly validate legal plays (follow-suit constraint)', () => {
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        const southHand = game.handPiles[0];
        const spadeCard = [...southHand].find(c => c.suit === Suit.Spades);
        const heartCard = [...southHand].find(c => c.suit === Suit.Hearts);

        if (spadeCard && heartCard) {
            // Start a clean trick by clearing existing played cards
            game.currentTrick = [];

            const leadPlayer = game.players[1];
            // West leads Spades
            const dummySpades = game.playedPiles[1].createCard(Suit.Spades, 0, Rank.Ten);
            game.currentTrick.push({ player: leadPlayer, card: dummySpades });

            // If South has Spades, playing Spades is legal, playing Hearts is illegal
            const legalCards = game.getLegalCards_(southHand);
            expect(legalCards.includes(spadeCard)).toBe(true);
            expect(legalCards.includes(heartCard)).toBe(false);
        }
    });

    it('should determine the trick winner correctly with trump overrides', () => {
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Set Trump to Hearts
        game.trumpSuit = Suit.Hearts;

        // Player 0 plays Ace of Spades (Led suit)
        const c0 = game.handPiles[0].createCard(Suit.Spades, 0, Rank.Ace);
        // Player 1 plays Ten of Spades
        const c1 = game.handPiles[1].createCard(Suit.Spades, 0, Rank.Ten);
        // Player 2 plays Two of Hearts (Trump!)
        const c2 = game.handPiles[2].createCard(Suit.Hearts, 0, Rank.Two);
        // Player 3 plays Three of Hearts (Higher Trump!)
        const c3 = game.handPiles[3].createCard(Suit.Hearts, 0, Rank.Three);

        // c3 (Three of Hearts) > c2 (Two of Hearts) > c0 (Ace of Spades) > c1 (Ten of Spades)
        expect((game as any).compareCards_(c0, c1, Suit.Spades)).toBeGreaterThan(0);
        expect((game as any).compareCards_(c2, c0, Suit.Spades)).toBeGreaterThan(0);
        expect((game as any).compareCards_(c3, c2, Suit.Spades)).toBeGreaterThan(0);
    });

    it('should correctly progress the turn loop after the human plays a card without stalling', () => {
        // Run a clean game start
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Check if game is waiting for human play.
        // Since we may start with an AI player, let's step the generator if it isn't waiting yet
        if (!game.waitingForHumanPlay) {
            // Wait, game should be waiting because startNewRound_ ran the turn loop up to human play.
        }

        expect(game.waitingForHumanPlay).toBe(true);

        const southHand = game.handPiles[0];
        const legalCards = game.getLegalCards_(southHand);
        expect(legalCards.length).toBeGreaterThan(0);

        const cardToPlay = legalCards[0];

        // Human plays the card (calling cardPrimary via generator)
        const playGen = game.cardPrimary(cardToPlay);
        let playRes = playGen.next();
        while (!playRes.done) {
            playRes = playGen.next();
        }

        // After human plays, waitingForHumanPlay should become false or true again (if we are at the next human turn, which could happen if AIs play their turns super fast)
        // More importantly, the activePlayerIndex should have progressed, and game log should contain plays.
        const humanPlayedLog = game.gameLog.find(log => log.includes("You played"));
        expect(humanPlayedLog).toBeDefined();

        // Check that at least one AI player has also played, meaning the turn loop did not stall
        const westPlayedLog = game.gameLog.find(log => log.includes("AI West played"));
        const eastPlayedLog = game.gameLog.find(log => log.includes("AI East played"));
        const partnerPlayedLog = game.gameLog.find(log => log.includes("AI Partner played"));

        // At least one of the subsequent AI players should have played depending on the trick status
        const someAIPlayed = !!(westPlayedLog || eastPlayedLog || partnerPlayedLog);
        expect(someAIPlayed).toBe(true);
    });

    it('should accumulate score per-team and trigger game-win at 7 points', () => {
        game.scoreTracker.resetAll();

        for (let i = 0; i < 8; ++i) {
            game.scoreTracker.addTrick(game.players[0]); // Team A tricks = 8
        }
        for (let i = 0; i < 5; ++i) {
            game.scoreTracker.addTrick(game.players[1]); // Team B tricks = 5
        }

        (game as any).evaluateRoundScores_();

        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(2);
        expect(game.scoreTracker.getScoreByKey("TeamB")).toBe(0);
        expect(game.won).toBe(false);

        game.scoreTracker.addScoreByKey("TeamA", 5); // Total score A = 7
        const wonGame = (game as any).checkGameWon_();
        expect(wonGame).toBe(true);
    });
});
