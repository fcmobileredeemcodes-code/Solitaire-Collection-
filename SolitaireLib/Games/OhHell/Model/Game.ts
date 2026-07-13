import { TrickTakingGameBase } from "~CardLib/Model/TrickTakingGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { Card } from "~CardLib/Model/Card";
import { Pile } from "~CardLib/Model/Pile";
import { IPlayer } from "~CardLib/Model/IPlayer";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { ScoreTracker } from "~CardLib/Model/ScoreTracker";
import { IGame } from "./IGame";
import { Rank } from "~CardLib/Model/Rank";
import prand from "pure-rand";

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    // Bidding phase states
    public isBiddingPhase = false;
    public waitingForHumanBid = false;
    public biddingPlayerIndex = 0;
    public bids: (number | null)[] = [null, null, null, null];
    public revealedTrumpCard: Card | null = null;

    constructor(params: URLSearchParams) {
        super();
        this.options = new GameOptions(params);

        // 4 players, no partnerships - every player scores individually
        this.players = [
            { id: "player0", name: "You", isHuman: true },
            { id: "player1", name: "AI West", isHuman: false },
            { id: "player2", name: "AI North", isHuman: false },
            { id: "player3", name: "AI East", isHuman: false },
        ];

        this.scoreTracker = new ScoreTracker("player");
    }

    public override determineTrump_(round: number): Suit {
        // Peek the next card in the remaining deck
        const nextCard = this.deckPile.peek();
        if (nextCard) {
            this.revealedTrumpCard = nextCard;
            nextCard.doSetFaceUp(true); // Turn the trump card face up to reveal it
            return nextCard.suit;
        }
        this.revealedTrumpCard = null;
        return Suit.None;
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

        // Deal cards based on round number (10 down to 1)
        const cardsToDeal = 11 - this.roundNumber;

        for (let r = 0; r < cardsToDeal; ++r) {
            for (let i = 0; i < 4; ++i) {
                const card = this.deckPile.peek();
                if (card) {
                    this.handPiles[i].push(card);
                    // Turn human cards face up, AI face down:
                    card.doSetFaceUp(this.players[i].isHuman);
                }
                yield DelayHint.Quick;
            }
        }

        // Determine Trump suit from the top card of the remaining deck
        this.trumpSuit = this.determineTrump_(this.roundNumber);

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

        // Initialize bidding states
        this.isBiddingPhase = true;
        this.waitingForHumanBid = false;
        this.bids = [null, null, null, null];
        this.biddingPlayerIndex = this.roundStarterIndex;

        // Run the bidding phase!
        yield* this.runBiddingPhase_();
    }

    public *runBiddingPhase_(): Generator<DelayHint, void> {
        while (this.bids.includes(null)) {
            const player = this.players[this.biddingPlayerIndex];
            if (player.isHuman) {
                this.waitingForHumanBid = true;
                return; // Pause generator, wait for presenter/UI to submit human bid
            } else {
                yield DelayHint.OneByOne;
                const bidVal = this.evaluateAIBid_(this.biddingPlayerIndex);
                this.bids[this.biddingPlayerIndex] = bidVal;
                this.gameLog.push(`${player.name} bids ${bidVal}`);
                this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;
            }
        }

        // Bidding completed!
        this.isBiddingPhase = false;
        this.waitingForHumanBid = false;
        this.gameLog.push(`--- Bidding completed! ---`);
        for (let i = 0; i < 4; ++i) {
            this.gameLog.push(`${this.players[i].name} bid: ${this.bids[i]}`);
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
        this.gameLog.push(`${this.players[humanIndex].name} bids ${bidVal}`);
        this.waitingForHumanBid = false;
        this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;

        // Resume the bidding phase generator
        yield* this.runBiddingPhase_();
    }

    public evaluateAIBid_(playerIdx: number): number {
        const hand = this.handPiles[playerIdx];
        const handSize = 11 - this.roundNumber;
        let estimatedTricks = 0;

        for (const card of hand) {
            const isTrump = card.suit === this.trumpSuit;
            if (isTrump) {
                if (card.rank === Rank.Ace || card.rank === Rank.King || card.rank === Rank.Queen || card.rank === Rank.Jack) {
                    estimatedTricks += 1.0;
                } else if (card.rank >= 8) {
                    estimatedTricks += 0.7;
                } else {
                    estimatedTricks += 0.4;
                }
            } else {
                if (card.rank === Rank.Ace) {
                    estimatedTricks += 0.8;
                } else if (card.rank === Rank.King) {
                    estimatedTricks += 0.5;
                }
            }
        }

        return Math.min(handSize, Math.max(0, Math.round(estimatedTricks)));
    }

    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];
        if (this.currentTrick.length === 0) {
            return [...hand];
        }

        const leadSuit = this.currentTrick[0].card.suit;
        const matchingCards = [...hand].filter(c => c.suit === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
    }

    protected override chooseAIPlay_(player: IPlayer): Card {
        const playerIndex = this.players.indexOf(player);
        const hand = this.handPiles[playerIndex];
        const legalCards = this.getLegalCards_(hand);

        if (legalCards.length === 0) {
            throw new Error(`AI Player ${player.name} has no cards in hand!`);
        }

        const bid = this.bids[playerIndex] ?? 0;
        const won = this.scoreTracker.getTricks(player);
        const stillNeedsTricks = won < bid;

        // If we are leading
        if (this.currentTrick.length === 0) {
            if (stillNeedsTricks) {
                // Play highest card to win
                return this.getHighestCard_(legalCards, Suit.None);
            } else {
                // Play lowest card to avoid winning
                return this.getLowestCard_(legalCards);
            }
        }

        // If we are following
        const leadCard = this.currentTrick[0].card;
        const leadSuit = leadCard.suit;

        // Determine currently winning play
        let winningPlay = this.currentTrick[0];
        for (let i = 1; i < this.currentTrick.length; ++i) {
            const play = this.currentTrick[i];
            if (this.compareCards_(play.card, winningPlay.card, leadSuit) > 0) {
                winningPlay = play;
            }
        }

        // Split into winning vs losing cards
        const winningCards: Card[] = [];
        const losingCards: Card[] = [];

        for (const card of legalCards) {
            if (this.compareCards_(card, winningPlay.card, leadSuit) > 0) {
                winningCards.push(card);
            } else {
                losingCards.push(card);
            }
        }

        if (stillNeedsTricks) {
            if (winningCards.length > 0) {
                // Play highest winning card
                return this.getHighestCard_(winningCards, leadSuit);
            } else {
                // Play lowest card overall (since we can't win)
                return this.getLowestCard_(legalCards);
            }
        } else {
            if (losingCards.length > 0) {
                // Play highest losing card (sluff high cards safely)
                return this.getHighestCard_(losingCards, leadSuit);
            } else {
                // Forced to win! Play lowest winning card
                return this.getLowestCard_(winningCards);
            }
        }
    }

    protected override evaluateRoundScores_(): void {
        const roundLogs: string[] = [];
        for (let i = 0; i < 4; ++i) {
            const player = this.players[i];
            const bid = this.bids[i] ?? 0;
            const tricksWon = this.scoreTracker.getTricks(player);

            let points = 0;
            if (tricksWon === bid) {
                points = 10 + bid;
            }

            this.scoreTracker.addScore(player, points);
            roundLogs.push(`${player.name}: bid ${bid}, won ${tricksWon} -> scored ${points} pts`);
        }
        this.gameLog.push(`Round ${this.roundNumber} ended. ${roundLogs.join(", ")}`);
        for (const player of this.players) {
            this.gameLog.push(`${player.name} cumulative score: ${this.scoreTracker.getScore(player)}`);
        }
    }

    protected override checkGameWon_(): boolean {
        if (this.roundNumber >= 10) {
            const scores = this.players.map(p => ({
                player: p,
                score: this.scoreTracker.getScore(p)
            }));
            const maxScore = Math.max(...scores.map(s => s.score));
            const winners = scores.filter(s => s.score === maxScore).map(s => s.player.name);

            this.gameLog.push(`🏆 Game Over! Winner(s): ${winners.join(", ")} with ${maxScore} points! 🏆`);
            return true;
        }
        return false;
    }

    // Overriding solitaire interactions to route human input cleanly
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
        state.revealedTrumpCard = this.revealedTrumpCard ? { suit: this.revealedTrumpCard.suit, rank: this.revealedTrumpCard.rank } : null;
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

            if (state.revealedTrumpCard) {
                this.revealedTrumpCard = this.cards.find(c => c.suit === state.revealedTrumpCard.suit && c.rank === state.revealedTrumpCard.rank) || null;
                if (this.revealedTrumpCard) {
                    this.revealedTrumpCard.doSetFaceUp(true);
                }
            } else {
                this.revealedTrumpCard = null;
            }

            if (this.isBiddingPhase) {
                this.turnLoopGenerator = this.runBiddingPhase_();
            } else {
                this.turnLoopGenerator = this.runTurnLoop_();
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize OhHell state", error);
            return false;
        }
    }
}
