import prand from "pure-rand";
import { GameBase } from "./GameBase";
import { Card } from "./Card";
import { Pile } from "./Pile";
import { DelayHint } from "./DelayHint";
import { IPlayer } from "./IPlayer";
import { ScoreTracker } from "./ScoreTracker";
import { Suit } from "./Suit";
import { createStandard52Deck } from "./DeckUtils";
import { ICard } from "./ICard";
import { Rank } from "./Rank";

export abstract class TrickTakingGameBase extends GameBase {
    public players: IPlayer[] = [];
    public scoreTracker!: ScoreTracker;

    // Piles
    public handPiles: Pile[] = [];
    public playedPiles: Pile[] = [];
    protected deckPile!: Pile;

    // Turn control
    public activePlayerIndex = 0;
    public currentLeaderIndex = 0;
    public roundStarterIndex = 0;
    public trumpSuit: Suit = Suit.None;
    public roundNumber = 0;
    public skippedTricks: number[] = [];
    public sittingOutThisTrick: boolean[] = [];

    // Status
    public waitingForHumanPlay = false;
    public gameLog: string[] = [];
    public currentTrick: { player: IPlayer; card: Card }[] = [];

    public get winningScore(): number {
        return 7;
    }

    // Generator-based turn loop state
    protected turnLoopGenerator: Generator<DelayHint, void> | null = null;

    constructor(numPlayers = 4) {
        super();
        this.scoreTracker = new ScoreTracker("player");

        // Construct piles during instantiation to avoid any dry-run/dangling transaction hacks
        this.deckPile = new Pile(this);
        this.piles.push(this.deckPile);

        for (let i = 0; i < numPlayers; ++i) {
            const hand = new Pile(this);
            this.handPiles.push(hand);
            this.piles.push(hand);
        }

        for (let i = 0; i < numPlayers; ++i) {
            const played = new Pile(this);
            this.playedPiles.push(played);
            this.piles.push(played);
        }

        this.skippedTricks = Array(numPlayers).fill(0);
        this.sittingOutThisTrick = Array(numPlayers).fill(false);

        // Create standard deck cards
        this.cards = createStandard52Deck(this.deckPile);
    }

    public abstract determineTrump_(round: number): Suit;

    // Required by GameBase:
    public override get wonCards(): ICard[] {
        return [];
    }

    protected override doGetWon_(): boolean {
        return this.won;
    }

    protected override *restart_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.gameLog = [];
        this.roundNumber = 1;
        this.scoreTracker.resetAll();
        this.won = false;

        yield* this.startNewRound_(rng);
    }

    // Move to next round
    protected *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        const numPlayers = this.players.length || 4;
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = Array(numPlayers).fill(0);
        this.sittingOutThisTrick = Array(numPlayers).fill(false);

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

        // Determine Trump
        this.trumpSuit = this.determineTrump_(this.roundNumber);

        // Shuffle deck
        this.deckPile.shuffle(rng);

        // Deal 13 cards to each player
        for (let r = 0; r < 13; ++r) {
            for (let i = 0; i < numPlayers; ++i) {
                const card = this.deckPile.peek();
                if (card) {
                    this.handPiles[i].push(card);
                    // Turn human cards face up, AI face down:
                    card.doSetFaceUp(this.players[i].isHuman);
                }
                yield DelayHint.Quick;
            }
        }

        // Sort human player's hand for better readability:
        for (let i = 0; i < numPlayers; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Determine starter of the round:
        if (this.roundNumber === 1) {
            // first leader is random:
            this.roundStarterIndex = Math.floor(Math.random() * numPlayers);
        } else {
            // player to the left of previous round's starter leads (clockwise)
            this.roundStarterIndex = (this.roundStarterIndex + 1) % numPlayers;
        }

        this.currentLeaderIndex = this.roundStarterIndex;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.waitingForHumanPlay = false;

        // Initialize generator for loop
        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    // Check if the game is won, returns true if game should stop
    protected abstract checkGameWon_(): boolean;

    // Trick play sequence loop
    protected *runTurnLoop_(): Generator<DelayHint, void> {
        const numPlayers = this.players.length || 4;
        while (!this.won) {
            if (this.currentTrick.length === 0) {
                // Initialize trick skipped status!
                for (let i = 0; i < numPlayers; ++i) {
                    if (this.skippedTricks[i] > 0) {
                        this.sittingOutThisTrick[i] = true;
                        // Discard a random card from hand:
                        const hand = this.handPiles[i];
                        if (hand.length > 0) {
                            const discardIndex = Math.floor(Math.random() * hand.length);
                            const card = hand.at(discardIndex);
                            this.deckPile.push(card);
                            card.doSetFaceUp(false);
                            this.gameLog.push(`${this.players[i].name} discarded a card because of Lockup.`);
                        }
                    } else {
                        this.sittingOutThisTrick[i] = false;
                    }
                }
            }

            // Trick plays: expected trick size
            const expectedTrickSize = this.players.filter((_, idx) => !this.sittingOutThisTrick[idx]).length;
            if (expectedTrickSize === 0) {
                // All players are locked up! Decrement lockups and move on
                yield DelayHint.Settle;
                this.gameLog.push("All players are locked up! Skipping this trick.");
                for (let i = 0; i < numPlayers; ++i) {
                    if (this.sittingOutThisTrick[i]) {
                        this.skippedTricks[i]--;
                        if (this.skippedTricks[i] < 0) {
                            this.skippedTricks[i] = 0;
                        }
                    }
                }
                // Check if all cards have been played (or discarded because round ended)
                const roundEnded = this.handPiles.every(p => p.length === 0);
                if (roundEnded) {
                    this.evaluateRoundScores_();
                    if (this.checkGameWon_()) {
                        this.won = true;
                        return;
                    }
                    this.roundNumber++;
                    const rng = prand.mersenne(Date.now());
                    yield* this.startNewRound_(rng);
                    return;
                }
                continue;
            }

            while (this.currentTrick.length < expectedTrickSize) {
                if (this.sittingOutThisTrick[this.activePlayerIndex]) {
                    this.activePlayerIndex = (this.activePlayerIndex + 1) % numPlayers;
                    continue;
                }
                const currentPlayer = this.players[this.activePlayerIndex];
                if (currentPlayer.isHuman) {
                    this.waitingForHumanPlay = true;
                    return; // Pause generator, wait for cardPrimary_ to play the card and resume
                } else {
                    // AI turn
                    yield DelayHint.OneByOne;
                    const cardPlayed = this.chooseAIPlay_(currentPlayer);
                    yield* this.playCard_(cardPlayed, currentPlayer);
                }
            }

            // Trick completed! Evaluate winner after a short delay
            yield DelayHint.Settle;
            yield* this.evaluateTrickWinner_();

            // Check if all cards have been played (round ended)
            const roundEnded = this.handPiles.every(p => p.length === 0);
            if (roundEnded) {
                this.evaluateRoundScores_();
                if (this.checkGameWon_()) {
                    this.won = true;
                    return;
                }
                // Start next round!
                this.roundNumber++;
                const rng = prand.mersenne(Date.now());
                yield* this.startNewRound_(rng);
                return;
            }
        }
    }

    protected chooseAIPlay_(player: IPlayer): Card {
        const playerIndex = this.players.indexOf(player);
        const hand = this.handPiles[playerIndex];
        const legalCards = this.getLegalCards_(hand);

        if (legalCards.length === 0) {
            throw new Error(`AI Player ${player.name} has no cards in hand!`);
        }

        const leadCard = this.currentTrick[0]?.card;
        const leadSuit = leadCard ? leadCard.suit : Suit.None;

        // Find partner index
        const partner = this.players.find(p => p !== player && p.teamId === player.teamId);
        const partnerPlayedCard = this.currentTrick.find(t => t.player === partner)?.card;

        let partnerCurrentlyWinning = false;
        if (partnerPlayedCard && leadCard) {
            // Determine if partner's card is currently winning the trick so far
            let bestTrickPlay = this.currentTrick[0];
            for (let i = 1; i < this.currentTrick.length; ++i) {
                const p = this.currentTrick[i];
                if (this.compareCards_(p.card, bestTrickPlay.card, leadSuit) > 0) {
                    bestTrickPlay = p;
                }
            }
            if (bestTrickPlay.player === partner) {
                partnerCurrentlyWinning = true;
            }
        }

        if (partnerCurrentlyWinning) {
            // Partner is winning; play lowest card to save high cards
            return this.getLowestCard_(legalCards);
        } else {
            // Try to win! Play highest card
            return this.getHighestCard_(legalCards, leadSuit);
        }
    }

    protected getHighestCard_(cards: Card[], leadSuit: Suit): Card {
        let best = cards[0];
        for (let i = 1; i < cards.length; ++i) {
            const current = cards[i];
            if (this.compareCards_(current, best, leadSuit) > 0) {
                best = current;
            }
        }
        return best;
    }

    protected getLowestCard_(cards: Card[]): Card {
        let worst = cards[0];
        for (let i = 1; i < cards.length; ++i) {
            const current = cards[i];
            if (this.getCardValue_(current) < this.getCardValue_(worst)) {
                worst = current;
            }
        }
        return worst;
    }

    protected getCardValue_(card: Card): number {
        if (card.rank === Rank.Ace) return 14;
        if (card.rank === Rank.King) return 13;
        if (card.rank === Rank.Queen) return 12;
        if (card.rank === Rank.Jack) return 11;
        return card.rank;
    }

    protected compareCards_(a: Card, b: Card, leadSuit: Suit): number {
        const aIsTrump = a.suit === this.trumpSuit;
        const bIsTrump = b.suit === this.trumpSuit;

        if (aIsTrump && !bIsTrump) return 1;
        if (!aIsTrump && bIsTrump) return -1;

        if (aIsTrump && bIsTrump) {
            return this.getCardValue_(a) - this.getCardValue_(b);
        }

        // Neither is trump
        const aIsLead = a.suit === leadSuit;
        const bIsLead = b.suit === leadSuit;

        if (aIsLead && !bIsLead) return 1;
        if (!aIsLead && bIsLead) return -1;

        if (aIsLead && bIsLead) {
            return this.getCardValue_(a) - this.getCardValue_(b);
        }

        // Neither matches lead suit nor trump
        return this.getCardValue_(a) - this.getCardValue_(b);
    }

    public getLegalCards_(hand: Pile): Card[] {
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

    protected *playCard_(card: Card, player: IPlayer): Generator<DelayHint, void> {
        const numPlayers = this.players.length || 4;
        const playerIndex = this.players.indexOf(player);
        const playedPile = this.playedPiles[playerIndex];

        playedPile.push(card);
        card.doSetFaceUp(true);

        this.currentTrick.push({ player, card });
        this.gameLog.push(`${player.name} played ${this.getCardName_(card)}`);

        // Move active turn clockwise
        this.activePlayerIndex = (this.activePlayerIndex + 1) % numPlayers;
    }

    protected getCardName_(card: Card): string {
        const suitsMap = {
            [Suit.Spades]: "♠",
            [Suit.Hearts]: "♥",
            [Suit.Diamonds]: "♦",
            [Suit.Clubs]: "♣",
            [Suit.None]: "",
        };
        const ranksMap = {
            [Rank.Ace]: "A",
            [Rank.Jack]: "J",
            [Rank.Queen]: "Q",
            [Rank.King]: "K",
        };
        const rankStr = ranksMap[card.rank as keyof typeof ranksMap] || card.rank.toString();
        const suitStr = suitsMap[card.suit] || "";
        return `${rankStr}${suitStr}`;
    }

    protected *evaluateTrickWinner_(): Generator<DelayHint, void> {
        const numPlayers = this.players.length || 4;
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

        // Decrement skipped counters for players who sat out this trick:
        for (let i = 0; i < numPlayers; ++i) {
            if (this.sittingOutThisTrick[i]) {
                this.skippedTricks[i]--;
                if (this.skippedTricks[i] < 0) {
                    this.skippedTricks[i] = 0;
                }
            }
        }

        // Leader of next trick is winner of this one
        this.currentLeaderIndex = this.players.indexOf(winner);
        this.activePlayerIndex = this.currentLeaderIndex;
        this.currentTrick = [];
    }

    protected abstract evaluateRoundScores_(): void;

    // Overriding solitaire interactions to route human input cleanly:
    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (!this.waitingForHumanPlay) return;

        const humanPlayerIndex = this.players.findIndex(p => p.isHuman);
        if (humanPlayerIndex < 0) return;

        const humanPlayer = this.players[humanPlayerIndex];
        const hand = this.handPiles[humanPlayerIndex];

        if (card.pile !== hand) return;

        const legalCards = this.getLegalCards_(hand);
        if (!legalCards.includes(card)) {
            return;
        }

        yield* this.playCard_(card, humanPlayer);
        this.waitingForHumanPlay = false;

        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    protected override *cardSecondary_(card: Card): Generator<DelayHint, void> {
        yield* this.cardPrimary_(card);
    }

    protected override *pilePrimary_(pile: Pile): Generator<DelayHint, void> {}
    protected override *pileSecondary_(pile: Pile): Generator<DelayHint, void> {}

    protected override canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        return { canDrag: false, extraCards: [] };
    }

    protected override previewDrop_(card: Card, pile: Pile): boolean {
        return false;
    }

    protected override *dropCard_(card: Card, pile: Pile): Generator<DelayHint, void> {}

    public override serialize(): string {
        const baseJson = super.serialize();
        const state = {
            baseJson,
            roundNumber: this.roundNumber,
            activePlayerIndex: this.activePlayerIndex,
            currentLeaderIndex: this.currentLeaderIndex,
            roundStarterIndex: this.roundStarterIndex,
            trumpSuit: this.trumpSuit,
            waitingForHumanPlay: this.waitingForHumanPlay,
            gameLog: this.gameLog,
            skippedTricks: this.skippedTricks,
            sittingOutThisTrick: this.sittingOutThisTrick,
            scores: Array.from(this.players.map(p => ({
                id: p.id,
                score: this.scoreTracker.getScore(p),
                tricks: this.scoreTracker.getTricks(p)
            })))
        };
        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            if (!state || typeof state.baseJson !== "string") return false;

            const baseSuccess = super.deserialize(state.baseJson);
            if (!baseSuccess) return false;

            this.roundNumber = state.roundNumber;
            this.activePlayerIndex = state.activePlayerIndex;
            this.currentLeaderIndex = state.currentLeaderIndex;
            this.roundStarterIndex = state.roundStarterIndex;
            this.trumpSuit = state.trumpSuit;
            this.waitingForHumanPlay = state.waitingForHumanPlay;
            this.gameLog = state.gameLog || [];
            this.skippedTricks = state.skippedTricks || [0, 0, 0, 0];
            this.sittingOutThisTrick = state.sittingOutThisTrick || [false, false, false, false];

            if (state.scores) {
                this.scoreTracker.resetAll();
                for (const item of state.scores) {
                    const player = this.players.find(p => p.id === item.id);
                    if (player) {
                        this.scoreTracker.setScore(player, item.score);
                    }
                }
                for (const item of state.scores) {
                    const player = this.players.find(p => p.id === item.id);
                    if (player) {
                        for (let t = 0; t < item.tricks; ++t) {
                            this.scoreTracker.addTrick(player);
                        }
                    }
                }
            }

            const numPlayers = this.players.length || 4;
            this.currentTrick = [];
            for (let i = 0; i < numPlayers; ++i) {
                const player = this.players[i];
                const playedPile = this.playedPiles[i];
                if (playedPile && playedPile.length > 0) {
                    const card = playedPile.at(0);
                    this.currentTrick.push({ player, card });
                }
            }

            this.turnLoopGenerator = this.runTurnLoop_();

            return true;
        } catch (error) {
            console.error("Failed to deserialize trick taking game state", error);
            return false;
        }
    }
}
