import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./Game";
import { Suit } from "~CardLib/Model/Suit";
import { Rank } from "~CardLib/Model/Rank";
import prand from "pure-rand";

describe("Pinochle Game Model", () => {
    let game: Game;

    beforeEach(() => {
        game = new Game(new URLSearchParams());
    });

    it("should initialize with 48 cards and partnership setup", () => {
        expect(game.cards.length).toBe(48);
        expect(game.players.length).toBe(4);
        expect(game.players[0]!.teamId).toBe("TeamA");
        expect(game.players[1]!.teamId).toBe("TeamB");
        expect(game.players[2]!.teamId).toBe("TeamA");
        expect(game.players[3]!.teamId).toBe("TeamB");
        expect(game.scoreTracker.mode).toBe("team");
        expect(game.winningScore).toBe(1500);

        // Check cards composition: two copies of each of [9, 10, J, Q, K, A] in all 4 suits
        const suits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
        const ranks = [Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace];

        for (const suit of suits) {
            for (const rank of ranks) {
                const matches = game.cards.filter(c => c.suit === suit && c.rank === rank);
                expect(matches.length).toBe(2);
            }
        }
    });

    it("should enforce the non-standard ranking A > 10 > K > Q > J > 9", () => {
        // Compare values
        const valAce = (game as any).getCardValue_({ rank: Rank.Ace });
        const valTen = (game as any).getCardValue_({ rank: Rank.Ten });
        const valKing = (game as any).getCardValue_({ rank: Rank.King });
        const valQueen = (game as any).getCardValue_({ rank: Rank.Queen });
        const valJack = (game as any).getCardValue_({ rank: Rank.Jack });
        const valNine = (game as any).getCardValue_({ rank: Rank.Nine });

        expect(valAce).toBeGreaterThan(valTen);
        expect(valTen).toBeGreaterThan(valKing);
        expect(valKing).toBeGreaterThan(valQueen);
        expect(valQueen).toBeGreaterThan(valJack);
        expect(valJack).toBeGreaterThan(valNine);
    });

    it("should handle packet-based dealing correctly", () => {
        const startGen = (game as any).startNewRound_(prand.mersenne(12345));
        while (!startGen.next().done) {}

        // Each player must have exactly 12 cards
        for (let i = 0; i < 4; ++i) {
            expect(game.handPiles[i]!.length).toBe(12);
        }
    });

    it("should calculate Class C around/abound melds correctly", () => {
        const hand = game.handPiles[0]!;
        while (hand.length > 0) {
            hand.at(0).insert(0, (game as any).deckPile);
        }

        // Add 1 Ace of each suit -> Aces Around
        const cardAS = (game as any).cards.find((c: any) => c.suit === Suit.Spades && c.rank === Rank.Ace);
        const cardAH = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Ace);
        const cardAD = (game as any).cards.find((c: any) => c.suit === Suit.Diamonds && c.rank === Rank.Ace);
        const cardAC = (game as any).cards.find((c: any) => c.suit === Suit.Clubs && c.rank === Rank.Ace);

        hand.push(cardAS);
        hand.push(cardAH);
        hand.push(cardAD);
        hand.push(cardAC);

        let melds = game.calculateMeldsForHand_(hand, Suit.Spades);
        expect(melds.some(m => m.name === "Aces Around" && m.points === 100)).toBe(true);

        // Add second Ace of each suit -> Aces Abound
        const cardAS2 = (game as any).cards.find((c: any) => c.suit === Suit.Spades && c.rank === Rank.Ace && c !== cardAS);
        const cardAH2 = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Ace && c !== cardAH);
        const cardAD2 = (game as any).cards.find((c: any) => c.suit === Suit.Diamonds && c.rank === Rank.Ace && c !== cardAD);
        const cardAC2 = (game as any).cards.find((c: any) => c.suit === Suit.Clubs && c.rank === Rank.Ace && c !== cardAC);

        hand.push(cardAS2);
        hand.push(cardAH2);
        hand.push(cardAD2);
        hand.push(cardAC2);

        melds = game.calculateMeldsForHand_(hand, Suit.Spades);
        expect(melds.some(m => m.name === "Aces Abound" && m.points === 1000)).toBe(true);
        expect(melds.some(m => m.name === "Aces Around")).toBe(false); // Abound replaces Around
    });

    it("should calculate Pinochle and Double Pinochle melds correctly", () => {
        const hand = game.handPiles[0]!;
        while (hand.length > 0) {
            hand.at(0).insert(0, (game as any).deckPile);
        }

        const jD1 = (game as any).cards.find((c: any) => c.suit === Suit.Diamonds && c.rank === Rank.Jack);
        const qS1 = (game as any).cards.find((c: any) => c.suit === Suit.Spades && c.rank === Rank.Queen);

        hand.push(jD1);
        hand.push(qS1);

        let melds = game.calculateMeldsForHand_(hand, Suit.Hearts);
        expect(melds.some(m => m.name === "Pinochle" && m.points === 40)).toBe(true);

        const jD2 = (game as any).cards.find((c: any) => c.suit === Suit.Diamonds && c.rank === Rank.Jack && c !== jD1);
        const qS2 = (game as any).cards.find((c: any) => c.suit === Suit.Spades && c.rank === Rank.Queen && c !== qS1);

        hand.push(jD2);
        hand.push(qS2);

        melds = game.calculateMeldsForHand_(hand, Suit.Hearts);
        expect(melds.some(m => m.name === "Double Pinochle" && m.points === 300)).toBe(true);
        expect(melds.some(m => m.name === "Pinochle")).toBe(false); // Double Pinochle replaces single
    });

    it("should calculate Run and Marriage melds correctly", () => {
        const hand = game.handPiles[0]!;
        while (hand.length > 0) {
            hand.at(0).insert(0, (game as any).deckPile);
        }

        // Trump is Hearts. Let's form a Run: A, 10, K, Q, J of Hearts
        const cardH_A = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Ace);
        const cardH_10 = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Ten);
        const cardH_K = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.King);
        const cardH_Q = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Queen);
        const cardH_J = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Jack);

        hand.push(cardH_A);
        hand.push(cardH_10);
        hand.push(cardH_K);
        hand.push(cardH_Q);
        hand.push(cardH_J);

        let melds = game.calculateMeldsForHand_(hand, Suit.Hearts);
        expect(melds.some(m => m.name === "Run" && m.points === 150)).toBe(true);
        expect(melds.some(m => m.name === "Royal Marriage")).toBe(false); // Run consumes the marriage

        // Add another K & Q of Hearts. Now we should have a Run + a Royal Marriage
        const cardH_K2 = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.King && c !== cardH_K);
        const cardH_Q2 = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Queen && c !== cardH_Q);

        hand.push(cardH_K2);
        hand.push(cardH_Q2);

        melds = game.calculateMeldsForHand_(hand, Suit.Hearts);
        expect(melds.some(m => m.name === "Run" && m.points === 150)).toBe(true);
        expect(melds.some(m => m.name === "Royal Marriage" && m.points === 40)).toBe(true);
    });

    it("should allow melds to stack across categories if cards belong to different types", () => {
        const hand = game.handPiles[0]!;
        while (hand.length > 0) {
            hand.at(0).insert(0, (game as any).deckPile);
        }

        // Q♠ is part of Spades Marriage, Pinochle, and Queens Around
        const qS = (game as any).cards.find((c: any) => c.suit === Suit.Spades && c.rank === Rank.Queen);
        const kS = (game as any).cards.find((c: any) => c.suit === Suit.Spades && c.rank === Rank.King);
        const jD = (game as any).cards.find((c: any) => c.suit === Suit.Diamonds && c.rank === Rank.Jack);

        const qH = (game as any).cards.find((c: any) => c.suit === Suit.Hearts && c.rank === Rank.Queen);
        const qD = (game as any).cards.find((c: any) => c.suit === Suit.Diamonds && c.rank === Rank.Queen);
        const qC = (game as any).cards.find((c: any) => c.suit === Suit.Clubs && c.rank === Rank.Queen);

        hand.push(qS);
        hand.push(kS); // Marriage Spades
        hand.push(jD); // Pinochle (qS + jD)

        hand.push(qH);
        hand.push(qD);
        hand.push(qC); // Queens Around (qS, qH, qD, qC)

        const melds = game.calculateMeldsForHand_(hand, Suit.Hearts);
        expect(melds.some(m => m.name === "Common Marriage" && m.points === 20)).toBe(true);
        expect(melds.some(m => m.name === "Pinochle" && m.points === 40)).toBe(true);
        expect(melds.some(m => m.name === "Queens Around" && m.points === 60)).toBe(true);
    });

    it("should enforce auction bidding logic correctly", () => {
        game.dealerIndex = 3;
        const restart = game.restart(12345);
        while (!restart.next().done) {}

        expect(game.isBiddingPhase).toBe(true);
        expect(game.biddingPlayerIndex).toBe(0); // Left of dealer (3) is 0

        // Submit bids
        // Minimum opening bid is 20
        const bidGen = game.submitHumanBid_("bid", 25);
        while (!bidGen.next().done) {}
        expect(game.currentHighestBid).toBeGreaterThanOrEqual(25);
    });

    it("should forfeit meld points if a team wins zero tricks", () => {
        game.roundMeldPoints = { TeamA: 100, TeamB: 50 };
        game.roundTrickPoints = { TeamA: 40, TeamB: 0 };
        game.tricksWonInRound = { TeamA: 3, TeamB: 0 }; // Team B won 0 tricks

        // Team A won the auction
        game.auctionWinnerIndex = 0; // Team A
        game.finalBid = 20;

        game.evaluateRoundScores_();

        // Team B should score 0 because they won 0 tricks (melds forfeited)
        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(140); // meld 100 + tricks 40
        expect(game.scoreTracker.getScoreByKey("TeamB")).toBe(0); // Forfeited meld and trick
    });

    it("should zero out bidding team's score if they don't reach their bid", () => {
        game.roundMeldPoints = { TeamA: 40, TeamB: 50 };
        game.roundTrickPoints = { TeamA: 30, TeamB: 30 };
        game.tricksWonInRound = { TeamA: 4, TeamB: 4 };

        // Team A won auction with bid of 80
        game.auctionWinnerIndex = 0; // Team A
        game.finalBid = 80;

        game.evaluateRoundScores_();

        // Team A combined (40 + 30 = 70) is less than 80. They should score 0!
        // Team B (50 + 30 = 80) is not the bidding team, they get their full 80.
        expect(game.scoreTracker.getScoreByKey("TeamA")).toBe(0);
        expect(game.scoreTracker.getScoreByKey("TeamB")).toBe(80);
    });

    it("should determine game winner with bidding team winning tie-breaker", () => {
        // Both team score at/above 1500
        game.scoreTracker.addScoreByKey("TeamA", 1520);
        game.scoreTracker.addScoreByKey("TeamB", 1540);

        game.auctionWinnerIndex = 0; // Team A won auction

        const won = (game as any).checkGameWon_();
        expect(won).toBe(true);
        expect(game.gameLog[game.gameLog.length - 1]).toContain("Team A"); // Bidding team wins ties!
    });
});
