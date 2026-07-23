import { TrickTakingGameBase } from "~CardLib/Model/TrickTakingGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { ScoreTracker } from "~CardLib/Model/ScoreTracker";
import { IGame } from "./IGame";
import { Card } from "~CardLib/Model/Card";
import { Pile } from "~CardLib/Model/Pile";
import { IPlayer } from "~CardLib/Model/IPlayer";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { Rank } from "~CardLib/Model/Rank";
import prand from "pure-rand";

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    // Bidding phase states
    public isBiddingPhase = false;
    public waitingForHumanBid = false;
    public biddingPlayerIndex = 0;
    public bids: (number | null)[] = [null, null, null, null];

    // Spades Specific States
    public spadesBroken = false;
    public individualTricksWon: number[] = [0, 0, 0, 0];
    public bags: { TeamA: number; TeamB: number } = { TeamA: 0, TeamB: 0 };

    public override get winningScore(): number {
        return 500;
    }

    constructor(params: URLSearchParams) {
        super();
        this.options = new GameOptions(params);

        // Seating: 0: Human (South, TeamA), 1: West (AI, TeamB), 2: Partner (North, TeamA), 3: East (AI, TeamB)
        this.players = [
            { id: "player0", name: "You", isHuman: true, teamId: "TeamA" },
            { id: "player1", name: "AI West", isHuman: false, teamId: "TeamB" },
            { id: "player2", name: "AI Partner", isHuman: false, teamId: "TeamA" },
            { id: "player3", name: "AI East", isHuman: false, teamId: "TeamB" },
        ];

        this.scoreTracker = new ScoreTracker("team");
    }

    public override determineTrump_(round: number): Suit {
        return Suit.Spades;
    }

    protected override *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = [0, 0, 0, 0];
        this.sittingOutThisTrick = [false, false, false, false];

        // Clear played piles if any leftovers
        for (const pile of this.playedPiles) {
            while (pile.length > 0) {
                const card = pile.peek();
                if (card) {
                    this.deckPile.push(card);
                }
            }
        }

        // Gather all cards back to the deck
        for (const card of this.cards) {
            this.deckPile.push(card);
            card.doSetFaceUp(false);
        }

        // Shuffle deck
        this.deckPile.shuffle(rng);

        // Always deal exactly 13 cards to each player
        for (let r = 0; r < 13; ++r) {
            for (let i = 0; i < 4; ++i) {
                const card = this.deckPile.peek();
                if (card) {
                    this.handPiles[i].push(card);
                    card.doSetFaceUp(this.players[i].isHuman);
                }
                yield DelayHint.Quick;
            }
        }

        // Determine Trump (Always Spades)
        this.trumpSuit = this.determineTrump_(this.roundNumber);
        this.spadesBroken = false;
        this.individualTricksWon = [0, 0, 0, 0];

        // Sort human player's hand for better readability:
        for (let i = 0; i < 4; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Determine starter of the round:
        if (this.roundNumber === 1) {
            // first leader is random:
            this.roundStarterIndex = Math.floor(Math.random() * 4);
        } else {
            // player to the left of previous round's starter leads (clockwise)
            this.roundStarterIndex = (this.roundStarterIndex + 1) % 4;
        }

        this.currentLeaderIndex = this.roundStarterIndex;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.waitingForHumanPlay = false;

        // Bidding phase setup
        this.isBiddingPhase = true;
        this.waitingForHumanBid = false;
        this.bids = [null, null, null, null];
        this.biddingPlayerIndex = this.roundStarterIndex;

        yield* this.runBiddingPhase_();
    }

    public *runBiddingPhase_(): Generator<DelayHint, void> {
        while (this.bids.includes(null)) {
            const player = this.players[this.biddingPlayerIndex];
            if (player.isHuman) {
                this.waitingForHumanBid = true;
                return; // Pause generator, wait for presenter to submit the bid
            } else {
                yield DelayHint.OneByOne;
                const bidVal = this.evaluateAIBid_(this.biddingPlayerIndex);
                this.bids[this.biddingPlayerIndex] = bidVal;
                this.gameLog.push(`${player.name} bids ${bidVal === 0 ? "Nil" : bidVal}`);
                this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;
            }
        }

        // Bidding completed!
        this.isBiddingPhase = false;
        this.waitingForHumanBid = false;
        this.gameLog.push(`--- Bidding completed! ---`);
        for (let i = 0; i < 4; ++i) {
            this.gameLog.push(`${this.players[i].name} bid: ${this.bids[i] === 0 ? "Nil" : this.bids[i]}`);
        }

        // Initialize play turn loop
        this.activePlayerIndex = this.roundStarterIndex;
        this.currentLeaderIndex = this.roundStarterIndex;
        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    public *submitHumanBid_(bidVal: number): Generator<DelayHint, void> {
        if (!this.isBiddingPhase || !this.waitingForHumanBid) return;

        const humanIndex = this.players.findIndex(p => p.isHuman);
        this.bids[humanIndex] = bidVal;
        this.gameLog.push(`${this.players[humanIndex].name} bids ${bidVal === 0 ? "Nil" : bidVal}`);
        this.waitingForHumanBid = false;
        this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;

        yield* this.runBiddingPhase_();
    }

    public evaluateAIBid_(playerIdx: number): number {
        const hand = this.handPiles[playerIdx];

        // Nil heuristic
        const highCards = [...hand].filter(c => c.rank >= Rank.Jack);
        const spades = [...hand].filter(c => c.suit === Suit.Spades);
        const highSpades = spades.filter(c => c.rank >= 10);

        if (highCards.length === 0 && spades.length <= 3 && highSpades.length === 0) {
            return 0; // Nil bid
        }

        // Regular bid heuristic
        let estimatedTricks = 0;
        for (const card of hand) {
            if (card.suit === Suit.Spades) {
                if (card.rank === Rank.Ace) estimatedTricks += 1.0;
                else if (card.rank === Rank.King) estimatedTricks += 0.9;
                else if (card.rank === Rank.Queen) estimatedTricks += 0.8;
                else if (card.rank === Rank.Jack) estimatedTricks += 0.7;
                else if (card.rank >= 9) estimatedTricks += 0.5;
                else estimatedTricks += 0.3;
            } else {
                if (card.rank === Rank.Ace) {
                    estimatedTricks += 0.8;
                } else if (card.rank === Rank.King) {
                    estimatedTricks += 0.5;
                }
            }
        }

        return Math.max(1, Math.min(13, Math.round(estimatedTricks)));
    }

    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];

        if (this.currentTrick.length === 0) {
            // Leader
            // Cannot lead Spades unless Spades are broken OR hand consists entirely of Spades:
            const allSpades = [...hand].every(c => c.suit === Suit.Spades);
            if (this.spadesBroken || allSpades) {
                return [...hand];
            } else {
                const nonSpades = [...hand].filter(c => c.suit !== Suit.Spades);
                if (nonSpades.length > 0) {
                    return nonSpades;
                }
                return [...hand];
            }
        }

        // Following suit
        const leadSuit = this.currentTrick[0].card.suit;
        const matchingCards = [...hand].filter(c => c.suit === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
    }

    protected override *playCard_(card: Card, player: IPlayer): Generator<DelayHint, void> {
        yield* super.playCard_(card, player);

        if (card.suit === Suit.Spades) {
            if (!this.spadesBroken) {
                this.spadesBroken = true;
                this.gameLog.push("Spades have been broken!");
            }
        }
    }

    protected override *evaluateTrickWinner_(): Generator<DelayHint, void> {
        const expectedTrickSize = this.players.filter((_, idx) => !this.sittingOutThisTrick[idx]).length;
        if (this.currentTrick.length < expectedTrickSize || expectedTrickSize === 0) return;

        const leadSuit = this.currentTrick[0].card.suit;
        let winningPlay = this.currentTrick[0];

        for (let i = 1; i < this.currentTrick.length; ++i) {
            const play = this.currentTrick[i];
            if (this.compareCards_(play.card, winningPlay.card, leadSuit) > 0) {
                winningPlay = play;
            }
        }

        const winner = winningPlay.player;
        const winnerIndex = this.players.indexOf(winner);

        // Increment individual tricks won
        this.individualTricksWon[winnerIndex]++;

        this.scoreTracker.addTrick(winner);
        this.gameLog.push(`${winner.name} won the trick with ${this.getCardName_(winningPlay.card)}!`);

        yield DelayHint.Quick;
        for (const pile of this.playedPiles) {
            while (pile.length > 0) {
                const card = pile.peek();
                if (card) {
                    this.deckPile.push(card);
                    card.doSetFaceUp(false);
                }
            }
        }

        // Leader of next trick is winner of this one
        this.currentLeaderIndex = winnerIndex;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.currentTrick = [];
    }

    protected override chooseAIPlay_(player: IPlayer): Card {
        const playerIndex = this.players.indexOf(player);
        const hand = this.handPiles[playerIndex];
        const legalCards = this.getLegalCards_(hand);

        if (legalCards.length === 0) {
            throw new Error(`AI Player ${player.name} has no cards in hand!`);
        }

        const bid = this.bids[playerIndex] ?? 0;
        const isNilBid = bid === 0;

        // Find partner
        const partner = this.players.find(p => p !== player && p.teamId === player.teamId);
        const partnerIndex = partner ? this.players.indexOf(partner) : -1;
        const partnerBid = partnerIndex >= 0 ? (this.bids[partnerIndex] ?? 0) : 0;
        const partnerIsNil = partnerBid === 0;

        // If leading:
        if (this.currentTrick.length === 0) {
            if (isNilBid) {
                // Play lowest card to avoid winning
                return this.getLowestCard_(legalCards);
            }
            if (partnerIsNil) {
                // Partner is Nil, play highest card to take the lead and cover them
                return this.getHighestCard_(legalCards, Suit.None);
            }
            // Standard leading
            return this.getHighestCard_(legalCards, Suit.None);
        }

        // If NOT leading:
        const leadCard = this.currentTrick[0].card;
        const leadSuit = leadCard.suit;

        // Evaluate currently winning play
        let bestPlay = this.currentTrick[0];
        for (let i = 1; i < this.currentTrick.length; ++i) {
            const p = this.currentTrick[i];
            if (this.compareCards_(p.card, bestPlay.card, leadSuit) > 0) {
                bestPlay = p;
            }
        }

        const partnerIsWinning = (bestPlay.player === partner);

        // Group our legal cards into ones that would win vs ones that would lose (safe/duck)
        const winningCards: Card[] = [];
        const safeCards: Card[] = [];

        for (const card of legalCards) {
            if (this.compareCards_(card, bestPlay.card, leadSuit) > 0) {
                winningCards.push(card);
            } else {
                safeCards.push(card);
            }
        }

        if (isNilBid) {
            if (safeCards.length > 0) {
                // Play the highest safe card to throw away high cards safely
                return this.getHighestCard_(safeCards, leadSuit);
            } else {
                // Forced to win, play the lowest winning card
                return this.getLowestCard_(winningCards);
            }
        }

        if (partnerIsNil && bestPlay.player === partner) {
            // Partner is Nil and currently winning the trick (oh no!)
            // We must try to win to cover them!
            if (winningCards.length > 0) {
                return this.getHighestCard_(winningCards, leadSuit);
            }
        }

        if (partnerIsWinning) {
            // Partner is winning; play low card to save high cards
            return this.getLowestCard_(legalCards);
        } else {
            // Try to win! Play lowest card that can win
            if (winningCards.length > 0) {
                return this.getLowestCard_(winningCards);
            } else {
                return this.getLowestCard_(legalCards);
            }
        }
    }

    protected override evaluateRoundScores_(): void {
        const teamATricks = this.scoreTracker.getTricksByKey("TeamA");
        const teamBTricks = this.scoreTracker.getTricksByKey("TeamB");

        const teamABid = (this.bids[0] ?? 0) + (this.bids[2] ?? 0);
        const teamBBid = (this.bids[1] ?? 0) + (this.bids[3] ?? 0);

        let teamAScoreChange = 0;
        let teamBScoreChange = 0;

        // Team A (You and Partner)
        if (teamATricks >= teamABid) {
            teamAScoreChange += teamABid * 10;
            const extraTricks = teamATricks - teamABid;
            teamAScoreChange += extraTricks;
            this.bags.TeamA += extraTricks;
        } else {
            teamAScoreChange -= teamABid * 10;
        }

        // Team B (Opponents)
        if (teamBTricks >= teamBBid) {
            teamBScoreChange += teamBBid * 10;
            const extraTricks = teamBTricks - teamBBid;
            teamBScoreChange += extraTricks;
            this.bags.TeamB += extraTricks;
        } else {
            teamBScoreChange -= teamBBid * 10;
        }

        // Nil bidder evaluations
        // Player 0 (You - Team A)
        if (this.bids[0] === 0) {
            const tricksWon = this.individualTricksWon[0];
            if (tricksWon === 0) {
                teamAScoreChange += 100;
                this.gameLog.push(`You successfully made Nil! +100 pts`);
            } else {
                teamAScoreChange -= 100;
                this.gameLog.push(`You failed Nil (took ${tricksWon} tricks). -100 pts`);
            }
        }
        // Player 2 (Partner - Team A)
        if (this.bids[2] === 0) {
            const tricksWon = this.individualTricksWon[2];
            if (tricksWon === 0) {
                teamAScoreChange += 100;
                this.gameLog.push(`AI Partner successfully made Nil! +100 pts`);
            } else {
                teamAScoreChange -= 100;
                this.gameLog.push(`AI Partner failed Nil (took ${tricksWon} tricks). -100 pts`);
            }
        }
        // Player 1 (West - Team B)
        if (this.bids[1] === 0) {
            const tricksWon = this.individualTricksWon[1];
            if (tricksWon === 0) {
                teamBScoreChange += 100;
                this.gameLog.push(`AI West successfully made Nil! +100 pts`);
            } else {
                teamBScoreChange -= 100;
                this.gameLog.push(`AI West failed Nil (took ${tricksWon} tricks). -100 pts`);
            }
        }
        // Player 3 (East - Team B)
        if (this.bids[3] === 0) {
            const tricksWon = this.individualTricksWon[3];
            if (tricksWon === 0) {
                teamBScoreChange += 100;
                this.gameLog.push(`AI East successfully made Nil! +100 pts`);
            } else {
                teamBScoreChange -= 100;
                this.gameLog.push(`AI East failed Nil (took ${tricksWon} tricks). -100 pts`);
            }
        }

        // Bags penalties check
        if (this.bags.TeamA >= 10) {
            const penaltyMultiplier = Math.floor(this.bags.TeamA / 10);
            teamAScoreChange -= penaltyMultiplier * 100;
            this.bags.TeamA %= 10;
            this.gameLog.push(`Team A (You) reached 10 bags! -100 penalty.`);
        }
        if (this.bags.TeamB >= 10) {
            const penaltyMultiplier = Math.floor(this.bags.TeamB / 10);
            teamBScoreChange -= penaltyMultiplier * 100;
            this.bags.TeamB %= 10;
            this.gameLog.push(`Team B reached 10 bags! -100 penalty.`);
        }

        this.scoreTracker.addScoreByKey("TeamA", teamAScoreChange);
        this.scoreTracker.addScoreByKey("TeamB", teamBScoreChange);

        this.gameLog.push(`Round ended. Team A bid: ${teamABid}, won: ${teamATricks}. Team B bid: ${teamBBid}, won: ${teamBTricks}.`);
        this.gameLog.push(`Cumulative scores: Team A: ${this.scoreTracker.getScoreByKey("TeamA")} (Bags: ${this.bags.TeamA}), Team B: ${this.scoreTracker.getScoreByKey("TeamB")} (Bags: ${this.bags.TeamB})`);
    }

    protected override checkGameWon_(): boolean {
        const scoreA = this.scoreTracker.getScoreByKey("TeamA");
        const scoreB = this.scoreTracker.getScoreByKey("TeamB");

        if (scoreA >= 500 || scoreB >= 500) {
            if (scoreA !== scoreB) {
                const winningTeam = scoreA > scoreB ? "Team A (You & Partner)" : "Team B (Opponents)";
                this.gameLog.push(`🏆 ${winningTeam} won the game with ${Math.max(scoreA, scoreB)} points! 🏆`);
                return true;
            }
        }
        return false;
    }

    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (this.isBiddingPhase) return;
        yield* super.cardPrimary_(card);
    }

    public override serialize(): string {
        const baseJson = super.serialize();
        const state = JSON.parse(baseJson);
        state.isBiddingPhase = this.isBiddingPhase;
        state.waitingForHumanBid = this.waitingForHumanBid;
        state.biddingPlayerIndex = this.biddingPlayerIndex;
        state.bids = this.bids;
        state.spadesBroken = this.spadesBroken;
        state.individualTricksWon = this.individualTricksWon;
        state.bags = this.bags;
        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            if (!state || typeof state.baseJson !== "string") return false;

            const baseSuccess = super.deserialize(json);
            if (!baseSuccess) return false;

            this.isBiddingPhase = state.isBiddingPhase || false;
            this.waitingForHumanBid = state.waitingForHumanBid || false;
            this.biddingPlayerIndex = state.biddingPlayerIndex ?? 0;
            this.bids = state.bids || [null, null, null, null];
            this.spadesBroken = state.spadesBroken || false;
            this.individualTricksWon = state.individualTricksWon || [0, 0, 0, 0];
            this.bags = state.bags || { TeamA: 0, TeamB: 0 };

            if (this.isBiddingPhase) {
                this.turnLoopGenerator = this.runBiddingPhase_();
            } else {
                this.turnLoopGenerator = this.runTurnLoop_();
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize Spades state", error);
            return false;
        }
    }
}
