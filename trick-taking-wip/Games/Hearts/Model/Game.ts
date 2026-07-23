import { TrickTakingGameBase } from "~CardLib/Model/TrickTakingGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { ScoreTracker } from "~CardLib/Model/ScoreTracker";
import { IGame } from "./IGame";
import { Card } from "~CardLib/Model/Card";
import { DelayHint } from "~CardLib/Model/DelayHint";
import prand from "pure-rand";
import { Rank } from "~CardLib/Model/Rank";
import { IPlayer } from "~CardLib/Model/IPlayer";
import { Pile } from "~CardLib/Model/Pile";

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    // Passing Phase States
    public isPassingPhase = false;
    public humanPassedCards: Card[] = [];

    // Hearts Specific States
    public heartsBroken = false;
    public roundPoints: number[] = [0, 0, 0, 0];

    public override get winningScore(): number {
        return 100;
    }

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
        return Suit.None;
    }

    protected override *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = [0, 0, 0, 0];
        this.sittingOutThisTrick = [false, false, false, false];

        // Hearts broken state and round points resets at the start of every round:
        this.heartsBroken = false;
        this.roundPoints = [0, 0, 0, 0];

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

        // Determine Trump (Always None)
        this.trumpSuit = this.determineTrump_(this.roundNumber);

        // Shuffle deck
        this.deckPile.shuffle(rng);

        // Deal 13 cards to each player
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

        // Sort human player's hand for better readability:
        for (let i = 0; i < 4; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Determine starter of the round:
        if (this.roundNumber === 1) {
            this.roundStarterIndex = Math.floor(Math.random() * 4);
        } else {
            this.roundStarterIndex = (this.roundStarterIndex + 1) % 4;
        }

        this.currentLeaderIndex = this.roundStarterIndex;
        this.activePlayerIndex = this.currentLeaderIndex;

        // Pre-round passing rotation check: left, right, across, no pass
        const passRotation = (this.roundNumber - 1) % 4;
        if (passRotation !== 3) {
            this.isPassingPhase = true;
            this.humanPassedCards = [];
            this.waitingForHumanPlay = false; // We will pause turnLoop until human confirms passes
            this.gameLog.push(`--- Round ${this.roundNumber}: Pass 3 cards to your ${["Left", "Right", "Across"][passRotation]} ---`);
        } else {
            this.isPassingPhase = false;
            this.humanPassedCards = [];
            this.gameLog.push(`--- Round ${this.roundNumber}: No passing round ---`);

            // Initialize generator for loop immediately
            this.waitingForHumanPlay = false;
            this.turnLoopGenerator = this.runTurnLoop_();
            yield* this.turnLoopGenerator;
        }
    }

    public *confirmPass_(): Generator<DelayHint, void> {
        if (!this.isPassingPhase || this.humanPassedCards.length !== 3) return;

        const passRotation = (this.roundNumber - 1) % 4;

        // Gather passes for everyone simultaneously
        const passes: Card[][] = [[], [], [], []];
        passes[0] = [...this.humanPassedCards];

        for (let i = 1; i < 4; ++i) {
            passes[i] = this.chooseAIPasses_(i);
        }

        // Destination indices
        const destIndices = [0, 1, 2, 3];
        if (passRotation === 0) {
            // Left
            destIndices[0] = 1;
            destIndices[1] = 2;
            destIndices[2] = 3;
            destIndices[3] = 0;
        } else if (passRotation === 1) {
            // Right
            destIndices[0] = 3;
            destIndices[1] = 0;
            destIndices[2] = 1;
            destIndices[3] = 2;
        } else if (passRotation === 2) {
            // Across
            destIndices[0] = 2;
            destIndices[1] = 3;
            destIndices[2] = 0;
            destIndices[3] = 1;
        }

        // Move cards
        for (let src = 0; src < 4; ++src) {
            const dest = destIndices[src];
            const cardsToMove = passes[src];
            for (const card of cardsToMove) {
                this.handPiles[dest].push(card);
                card.doSetFaceUp(this.players[dest].isHuman);
            }
        }

        const dirNames = ["Left", "Right", "Across"];
        const dirName = dirNames[passRotation] || "";
        this.gameLog.push(`--- Pre-round Passing completed (${dirName}) ---`);
        this.gameLog.push(`You passed: ${passes[0].map(c => this.getCardName_(c)).join(", ")}`);

        // Sort human hand
        for (let i = 0; i < 4; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        this.isPassingPhase = false;
        this.humanPassedCards = [];

        // Now run play turn loop!
        this.waitingForHumanPlay = false;
        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    private chooseAIPasses_(playerIdx: number): Card[] {
        const hand = this.handPiles[playerIdx];
        const cards = [...hand];
        const passes: Card[] = [];

        // 1. Queen of Spades if held
        const qSpades = cards.find(c => c.suit === Suit.Spades && c.rank === Rank.Queen);
        if (qSpades) {
            passes.push(qSpades);
        }

        // 2. Highest Hearts
        const hearts = cards.filter(c => c.suit === Suit.Hearts && !passes.includes(c));
        hearts.sort((a, b) => this.getCardValue_(b) - this.getCardValue_(a));
        for (const c of hearts) {
            if (passes.length >= 3) break;
            passes.push(c);
        }

        // 3. Highest other cards
        const others = cards.filter(c => !passes.includes(c));
        others.sort((a, b) => this.getCardValue_(b) - this.getCardValue_(a));
        for (const c of others) {
            if (passes.length >= 3) break;
            passes.push(c);
        }

        return passes;
    }

    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (this.isPassingPhase) {
            const humanIndex = this.players.findIndex(p => p.isHuman);
            const hand = this.handPiles[humanIndex];
            if (card.pile !== hand) return;

            const idx = this.humanPassedCards.indexOf(card);
            if (idx >= 0) {
                this.humanPassedCards.splice(idx, 1);
            } else {
                if (this.humanPassedCards.length < 3) {
                    this.humanPassedCards.push(card);
                }
            }
            return;
        }

        yield* super.cardPrimary_(card);
    }

    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];

        if (this.currentTrick.length === 0) {
            // Leader
            // Cannot lead Hearts unless Hearts are broken OR hand consists entirely of Hearts:
            const allHearts = [...hand].every(c => c.suit === Suit.Hearts);
            if (this.heartsBroken || allHearts) {
                return [...hand];
            } else {
                const nonHearts = [...hand].filter(c => c.suit !== Suit.Hearts);
                if (nonHearts.length > 0) {
                    return nonHearts;
                }
                return [...hand];
            }
        }

        // Follow suit
        const leadSuit = this.currentTrick[0].card.suit;
        const matchingCards = [...hand].filter(c => c.suit === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
    }

    protected override *playCard_(card: Card, player: IPlayer): Generator<DelayHint, void> {
        yield* super.playCard_(card, player);

        // Check if hearts are broken
        if (this.currentTrick.length > 1) {
            const leadSuit = this.currentTrick[0].card.suit;
            if (card.suit === Suit.Hearts && leadSuit !== Suit.Hearts) {
                if (!this.heartsBroken) {
                    this.heartsBroken = true;
                    this.gameLog.push("Hearts have been broken!");
                }
            }
        }
    }

    protected override chooseAIPlay_(player: IPlayer): Card {
        const playerIndex = this.players.indexOf(player);
        const hand = this.handPiles[playerIndex];
        const legalCards = this.getLegalCards_(hand);

        if (legalCards.length === 0) {
            throw new Error(`AI Player ${player.name} has no cards in hand!`);
        }

        // Hard constraints: follow-suit-if-able, can't lead Hearts until broken,
        // which are already fully enforced by getLegalCards_!

        // If leading:
        if (this.currentTrick.length === 0) {
            // Lead a safe low card
            return this.getLowestCard_(legalCards);
        }

        // If NOT leading:
        const leadCard = this.currentTrick[0].card;
        const leadSuit = leadCard.suit;

        // Evaluate current winning play
        let bestPlay = this.currentTrick[0];
        for (let i = 1; i < this.currentTrick.length; ++i) {
            const p = this.currentTrick[i];
            if (this.compareCards_(p.card, bestPlay.card, leadSuit) > 0) {
                bestPlay = p;
            }
        }

        // Group legal cards into cards that would beat the best play so far vs cards that would not beat it
        const winningCards: Card[] = [];
        const safeCards: Card[] = [];

        for (const card of legalCards) {
            if (this.compareCards_(card, bestPlay.card, leadSuit) > 0) {
                winningCards.push(card);
            } else {
                safeCards.push(card);
            }
        }

        // If we have safe cards:
        if (safeCards.length > 0) {
            const canFollow = legalCards.some(c => c.suit === leadSuit);
            if (!canFollow) {
                // Discard/unload high point cards:
                // 1. Queen of Spades
                const qSpades = safeCards.find(c => c.suit === Suit.Spades && c.rank === Rank.Queen);
                if (qSpades) return qSpades;

                // 2. Ace or King of Spades
                const highSpades = safeCards.filter(c => c.suit === Suit.Spades && (c.rank === Rank.Ace || c.rank === Rank.King));
                if (highSpades.length > 0) {
                    return this.getHighestCard_(highSpades, Suit.None);
                }

                // 3. Highest Hearts
                const hearts = safeCards.filter(c => c.suit === Suit.Hearts);
                if (hearts.length > 0) {
                    return this.getHighestCard_(hearts, Suit.None);
                }

                // 4. Highest card overall
                return this.getHighestCard_(safeCards, Suit.None);
            } else {
                // Must follow suit: play highest safe card
                return this.getHighestCard_(safeCards, leadSuit);
            }
        } else {
            // Forced to win the trick: prefer unloading Q of Spades or high Hearts if we have them
            const qSpades = winningCards.find(c => c.suit === Suit.Spades && c.rank === Rank.Queen);
            if (qSpades) return qSpades;

            const highHearts = winningCards.filter(c => c.suit === Suit.Hearts);
            if (highHearts.length > 0) {
                return this.getHighestCard_(highHearts, leadSuit);
            }

            return this.getHighestCard_(winningCards, leadSuit);
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

        // Add trick to ScoreTracker
        this.scoreTracker.addTrick(winner);

        // Count points in the current trick
        let points = 0;
        for (const play of this.currentTrick) {
            const card = play.card;
            if (card.suit === Suit.Hearts) {
                points += 1;
            } else if (card.suit === Suit.Spades && card.rank === Rank.Queen) {
                points += 13;
            }
        }

        this.roundPoints[winnerIndex] += points;
        this.gameLog.push(`${winner.name} won the trick with ${this.getCardName_(winningPlay.card)}! (${points} point card pts)`);

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

    protected override evaluateRoundScores_(): void {
        const roundLogs: string[] = [];

        // Check for Shooting the Moon (all 26 points)
        let shooterIndex = -1;
        for (let i = 0; i < 4; ++i) {
            if (this.roundPoints[i] === 26) {
                shooterIndex = i;
                break;
            }
        }

        if (shooterIndex >= 0) {
            const shooter = this.players[shooterIndex];
            this.gameLog.push(`🌕 ${shooter.name} SHOT THE MOON! 🌕`);
            for (let i = 0; i < 4; ++i) {
                const player = this.players[i];
                if (i === shooterIndex) {
                    this.scoreTracker.addScore(player, 0);
                    roundLogs.push(`${player.name}: scored 0 pts`);
                } else {
                    this.scoreTracker.addScore(player, 26);
                    roundLogs.push(`${player.name}: scored +26 pts`);
                }
            }
        } else {
            for (let i = 0; i < 4; ++i) {
                const player = this.players[i];
                const pts = this.roundPoints[i];
                this.scoreTracker.addScore(player, pts);
                roundLogs.push(`${player.name}: scored ${pts} pts`);
            }
        }

        this.gameLog.push(`Round ${this.roundNumber} ended. ${roundLogs.join(", ")}`);
        for (const player of this.players) {
            this.gameLog.push(`${player.name} total score: ${this.scoreTracker.getScore(player)}`);
        }
    }

    protected override checkGameWon_(): boolean {
        const scores = this.players.map(p => ({
            player: p,
            score: this.scoreTracker.getScore(p)
        }));

        const anyReached100 = scores.some(s => s.score >= 100);
        if (!anyReached100) {
            return false;
        }

        const minScore = Math.min(...scores.map(s => s.score));
        const winners = scores.filter(s => s.score === minScore);

        const winner = winners[0].player;
        this.gameLog.push(`🏆 ${winner.name} won the game with only ${minScore} points! 🏆`);
        return true;
    }

    public override serialize(): string {
        const baseJson = super.serialize();
        const state = JSON.parse(baseJson);
        state.isPassingPhase = this.isPassingPhase;
        state.heartsBroken = this.heartsBroken;
        state.roundPoints = this.roundPoints;
        state.humanPassedCards = this.humanPassedCards.map(c => ({ suit: c.suit, rank: c.rank }));
        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const baseSuccess = super.deserialize(json);
            if (!baseSuccess) return false;

            const state = JSON.parse(json);
            this.isPassingPhase = state.isPassingPhase || false;
            this.heartsBroken = state.heartsBroken || false;
            this.roundPoints = state.roundPoints || [0, 0, 0, 0];

            this.humanPassedCards = [];
            if (state.humanPassedCards) {
                for (const item of state.humanPassedCards) {
                    const card = this.cards.find(c => c.suit === item.suit && c.rank === item.rank);
                    if (card) {
                        this.humanPassedCards.push(card);
                    }
                }
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize Hearts state", error);
            return false;
        }
    }
}
