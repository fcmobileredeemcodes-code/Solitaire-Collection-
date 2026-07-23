import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './Game';
import { Suit } from '~CardLib/Model/Suit';
import { Rank } from '~CardLib/Model/Rank';

describe('Lockup Game Model', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it('should initialize with 4 players, individual scores, and no partnerships', () => {
        expect(game.players.length).toBe(4);
        expect(game.players[0].name).toBe('You');
        expect(game.players[0].teamId).toBeUndefined();
        expect(game.players[1].teamId).toBeUndefined();
        expect(game.players[2].teamId).toBeUndefined();
        expect(game.players[3].teamId).toBeUndefined();
        expect(game.scoreTracker.mode).toBe('player');
        expect(game.winningScore).toBe(20);
    });

    it('should permanently have no trump suit', () => {
        expect(game.determineTrump_(1)).toBe(Suit.None);
        expect(game.determineTrump_(5)).toBe(Suit.None);
        expect(game.trumpSuit).toBe(Suit.None);
    });

    it('should restrict leading with Clubs unless only Clubs in hand', () => {
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        const hand = game.handPiles[0];

        // Setup hand with clubs and non-clubs by moving all cards out first, then adding specific ones
        while (hand.length > 0) {
            (game as any).deckPile.push(hand.peek());
        }

        const clubCard = hand.createCard(Suit.Clubs, 0, Rank.Ace);
        const spadeCard = hand.createCard(Suit.Spades, 0, Rank.Ace);

        game.currentTrick = []; // leading
        let legalCards = game.getLegalCards_(hand);
        expect(legalCards.includes(spadeCard)).toBe(true);
        expect(legalCards.includes(clubCard)).toBe(false);

        // Setup hand with ONLY clubs
        while (hand.length > 0) {
            (game as any).deckPile.push(hand.peek());
        }
        const clubCardOnly = hand.createCard(Suit.Clubs, 0, Rank.Ace);
        legalCards = game.getLegalCards_(hand);
        expect(legalCards.includes(clubCardOnly)).toBe(true);
    });

    it('should correctly trigger lockup when a player wins a trick containing Clubs', () => {
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Setup played cards: Winner plays Ace of Spades, someone plays Clubs, etc.
        const player0 = game.players[0];
        const player1 = game.players[1];
        const player2 = game.players[2];
        const player3 = game.players[3];

        game.currentTrick = [
            { player: player0, card: game.handPiles[0].createCard(Suit.Spades, 0, Rank.Ace) },
            { player: player1, card: game.handPiles[1].createCard(Suit.Clubs, 0, Rank.Ten) },
            { player: player2, card: game.handPiles[2].createCard(Suit.Clubs, 0, Rank.Jack) },
            { player: player3, card: game.handPiles[3].createCard(Suit.Spades, 0, Rank.Ten) },
        ];

        // Evaluate trick winner
        const evalGen = (game as any).evaluateTrickWinner_();
        let evalRes = evalGen.next();
        while (!evalRes.done) {
            evalRes = evalGen.next();
        }

        // Winner (Player 0) should have won 1 trick, but gets 2 lockup tricks because there were 2 Clubs
        expect(game.scoreTracker.getTricks(player0)).toBe(1);
        expect(game.skippedTricks[0]).toBe(2);
    });

    it('should skip locked up players and discard a random card during turn loop', () => {
        const restartGen = game.restart(12345);
        let res = restartGen.next();
        while (!res.done) {
            res = restartGen.next();
        }

        // Set player 1 in lockup for 2 tricks
        game.skippedTricks[1] = 2;
        const initialHand1Length = game.handPiles[1].length;

        // Clear current trick to start a fresh turn loop trigger
        game.currentTrick = [];

        // Run the turn loop generator one step or more to trigger sitting out logic at start of trick
        const loopGen = (game as any).runTurnLoop_();
        loopGen.next(); // Trigger start of trick, which sits out player 1 and discards a card

        expect(game.sittingOutThisTrick[1]).toBe(true);
        expect(game.handPiles[1].length).toBe(initialHand1Length - 1);
    });
});
