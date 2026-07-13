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

    // Manni specific piles
    public manniPile: Pile;
    public trumpIndicatorPiles: Pile[] = []; // A pile for each of the four 2s to sit on the board

    // Exchange phase states
    public isExchangePhase = false;
    public currentExchangingPlayerIndex = -1;
    public exchangeCompleted = false;
    public cardsSelectedForExchange: Card[] = [];

    // Tracks how many cards each seat exchanged
    public exchangesCount: (number | null)[] = [null, null, null];

    public override get winningScore(): number {
        return 10;
    }

    constructor(params: URLSearchParams) {
        // Initialize with 3 players
        super(3);
        this.options = new GameOptions(params);

        this.players = [
            { id: "player0", name: "You", isHuman: true },
            { id: "player1", name: "AI West", isHuman: false },
            { id: "player2", name: "AI East", isHuman: false },
        ];

        this.scoreTracker = new ScoreTracker("player");

        // Set up the Manni pile (face-down middle pile)
        this.manniPile = new Pile(this);
        this.piles.push(this.manniPile);

        // Set up the trump indicator piles for the four 2s (Hearts, Spades, Diamonds, Clubs)
        for (let i = 0; i < 4; ++i) {
            const p = new Pile(this);
            this.trumpIndicatorPiles.push(p);
            this.piles.push(p);
        }

        // Standard 52 minus the four 2s
        const full52 = [...this.cards];
        this.cards = [];

        // Put the four 2s into the trumpIndicatorPiles directly
        const twos = full52.filter(c => c.rank === Rank.Two);
        const nonTwos = full52.filter(c => c.rank !== Rank.Two);

        this.cards = nonTwos;

        // Order of twos for trumpIndicatorPiles: Hearts, Spades, Diamonds, Clubs
        const orderOfSuits = [Suit.Hearts, Suit.Spades, Suit.Diamonds, Suit.Clubs];
        for (let i = 0; i < 4; ++i) {
            const suit = orderOfSuits[i];
            const twoCard = twos.find(c => c.suit === suit);
            if (twoCard) {
                // Placing in the indicator pile automatically removes it from the previous deckPile
                this.trumpIndicatorPiles[i].push(twoCard);
                // Also, keep it in game's master cards array so renderer/serializer sees it
                this.cards.push(twoCard);
            }
        }
    }

    public override determineTrump_(round: number): Suit {
        // Trump rotation: fixed sequence across rounds — Hearts, Spades, Diamonds, Clubs, then back to Hearts.
        const rotation = [Suit.Hearts, Suit.Spades, Suit.Diamonds, Suit.Clubs];
        const index = (round - 1) % 4;
        const currentTrump = rotation[index] ?? Suit.Hearts;

        // Flip the corresponding 2 face-up, and others face-down
        const orderOfSuits = [Suit.Hearts, Suit.Spades, Suit.Diamonds, Suit.Clubs];
        for (let i = 0; i < 4; ++i) {
            const suit = orderOfSuits[i];
            const twoCard = this.trumpIndicatorPiles[i].peek();
            if (twoCard) {
                twoCard.doSetFaceUp(suit === currentTrump);
            }
        }

        return currentTrump;
    }

    protected override *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = [0, 0, 0];
        this.sittingOutThisTrick = [false, false, false];

        // Clear played piles and Manni pile if any leftovers
        for (const pile of [...this.playedPiles, this.manniPile]) {
            while (pile.length > 0) {
                const card = pile.peek();
                if (card) {
                    this.deckPile.push(card);
                }
            }
        }

        // Gather all playable (non-2) cards back to the deck
        for (const card of this.cards) {
            if (card.rank !== Rank.Two) {
                this.deckPile.push(card);
                card.doSetFaceUp(false);
            }
        }

        // Determine Trump & flip the 2 indicator card
        this.trumpSuit = this.determineTrump_(this.roundNumber);

        // Shuffle deck
        this.deckPile.shuffle(rng);

        // Deal 12 cards to each player, in packets of 4 at a time
        for (let p = 0; p < 3; ++p) { // 3 packets
            for (let i = 0; i < 3; ++i) { // 3 players
                for (let c = 0; c < 4; ++c) { // 4 cards per packet
                    const card = this.deckPile.peek();
                    if (card) {
                        this.handPiles[i].push(card);
                        card.doSetFaceUp(this.players[i].isHuman);
                    }
                    yield DelayHint.Quick;
                }
            }
        }

        // Place the remaining 12 cards face-down in the Manni pile
        while (this.deckPile.length > 0) {
            const card = this.deckPile.peek();
            if (card) {
                this.manniPile.push(card);
                card.doSetFaceUp(false);
            }
        }

        // Sort human player's hand for better readability:
        for (let i = 0; i < 3; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Determine dealer/starter of the round:
        if (this.roundNumber === 1) {
            this.roundStarterIndex = Math.floor(Math.random() * 3);
        } else {
            this.roundStarterIndex = (this.roundStarterIndex + 1) % 3;
        }

        // Initialize exchange phase states
        this.isExchangePhase = true;
        this.exchangeCompleted = false;
        this.cardsSelectedForExchange = [];
        this.exchangesCount = [null, null, null];

        // The exchange phase starts with the player left of the dealer:
        // Round starter is dealer in our terminology or starter of play.
        // Left of dealer/starter is (roundStarterIndex + 1) % 3
        this.currentExchangingPlayerIndex = (this.roundStarterIndex + 1) % 3;

        // Run the exchange phase
        yield* this.runExchangePhase_();
    }

    public *runExchangePhase_(): Generator<DelayHint, void> {
        this.gameLog.push(`--- Exchange Phase (Round ${this.roundNumber}) ---`);

        // The order of exchange is:
        // 1st to act (left of dealer): up to 7 cards
        // 2nd to act (middle player): up to 5 cards
        // 3rd to act (dealer): whatever is left in the Manni (typically 4) if others declined or exchanged partially.
        // As soon as a player chooses to exchange, later players play their originally dealt hands.
        const order = [
            this.currentExchangingPlayerIndex,
            (this.currentExchangingPlayerIndex + 1) % 3,
            (this.currentExchangingPlayerIndex + 2) % 3
        ];

        const maxAllowed = [7, 5, 12]; // dealer can take up to what is left (up to 12)

        for (let step = 0; step < 3; ++step) {
            if (this.exchangeCompleted) {
                break;
            }

            const activeIdx = order[step];
            const activePlayer = this.players[activeIdx];
            const maxExchangeLimit = step === 2 ? this.manniPile.length : maxAllowed[step];

            if (activePlayer.isHuman) {
                this.currentExchangingPlayerIndex = activeIdx;
                this.waitingForHumanPlay = false; // We pause wait for exchange confirmation, not play card
                return; // Pause generator, wait for human input through presenter
            } else {
                yield DelayHint.OneByOne;
                const aiHand = this.handPiles[activeIdx];
                const aiExchangedCards = this.chooseAIExchange_(aiHand, maxExchangeLimit);

                if (aiExchangedCards.length > 0) {
                    this.executeExchange_(activeIdx, aiExchangedCards);
                    this.exchangesCount[activeIdx] = aiExchangedCards.length;
                    this.exchangeCompleted = true;
                } else {
                    this.exchangesCount[activeIdx] = 0;
                    this.gameLog.push(`${activePlayer.name} declined to exchange.`);
                }
            }
        }

        // Exchange phase done!
        this.isExchangePhase = false;
        this.currentExchangingPlayerIndex = -1;

        this.gameLog.push("--- Exchange Phase Completed ---");
        for (let i = 0; i < 3; ++i) {
            const count = this.exchangesCount[i];
            const player = this.players[i];
            if (count !== null) {
                if (count > 0) {
                    this.gameLog.push(`${player.name} exchanged ${count} cards with the Manni.`);
                } else {
                    this.gameLog.push(`${player.name} kept their hand.`);
                }
            }
        }

        // Human hand is always sorted
        for (let i = 0; i < 3; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Initialize play turn loop
        this.currentLeaderIndex = (this.roundStarterIndex + 1) % 3; // First trick led by player left of dealer
        this.activePlayerIndex = this.currentLeaderIndex;
        this.waitingForHumanPlay = false;

        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    public *submitHumanExchange_(cardsToExchange: Card[]): Generator<DelayHint, void> {
        if (!this.isExchangePhase) return;

        const humanIdx = this.players.findIndex(p => p.isHuman);
        if (this.currentExchangingPlayerIndex !== humanIdx) return;

        // Perform exchange if any cards were selected
        if (cardsToExchange.length > 0) {
            this.executeExchange_(humanIdx, cardsToExchange);
            this.exchangesCount[humanIdx] = cardsToExchange.length;
            this.exchangeCompleted = true;
        } else {
            this.exchangesCount[humanIdx] = 0;
            this.gameLog.push(`You declined to exchange.`);
        }

        // Advance exchange phase
        this.exchangeCompleted = this.exchangeCompleted || false;
        // Move exchange turn to next AI
        const currentOrderIdx = [
            this.currentExchangingPlayerIndex,
            (this.currentExchangingPlayerIndex + 1) % 3,
            (this.currentExchangingPlayerIndex + 2) % 3
        ].indexOf(this.currentExchangingPlayerIndex);

        if (currentOrderIdx === 0) {
            // First to act was human; next is second player
            this.currentExchangingPlayerIndex = (humanIdx + 1) % 3;
        } else if (currentOrderIdx === 1) {
            // Second to act was human; next is dealer
            this.currentExchangingPlayerIndex = (humanIdx + 1) % 3;
        } else {
            // Dealer was human; all steps done
            this.exchangeCompleted = true;
        }

        yield* this.runExchangePhase_();
    }

    private executeExchange_(playerIdx: number, cardsToExchange: Card[]) {
        const hand = this.handPiles[playerIdx];
        const isHuman = this.players[playerIdx].isHuman;
        const numToSwap = cardsToExchange.length;

        // Take cards from manni first, and push directly to hand.
        // Each time we push to hand, the card is removed from manniPile, so peek() will return the next card.
        for (let i = 0; i < numToSwap; ++i) {
            const card = this.manniPile.peek();
            if (card) {
                hand.push(card);
                card.doSetFaceUp(isHuman);
            }
        }

        // Put hand cards into Manni pile (this automatically removes them from player's hand pile)
        for (const card of cardsToExchange) {
            this.manniPile.push(card);
            card.doSetFaceUp(false);
        }

        this.gameLog.push(`${this.players[playerIdx].name} exchanged ${numToSwap} cards with the Manni.`);
    }

    private chooseAIExchange_(hand: Pile, maxExchangeLimit: number): Card[] {
        // AI heuristic: exchange up to maxExchangeLimit lowest off-trump cards (rank <= 9 and not trump)
        // If we have none, or all are trump / high, AI declines (exchanges 0 cards).
        const offTrumpLow = [...hand].filter(c => c.suit !== this.trumpSuit && this.getCardValue_(c) <= 9);

        if (offTrumpLow.length === 0) {
            return [];
        }

        // Sort ascending by value so we exchange the absolute lowest
        offTrumpLow.sort((a, b) => this.getCardValue_(a) - this.getCardValue_(b));

        const cardsToExchange = offTrumpLow.slice(0, maxExchangeLimit);
        return cardsToExchange;
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

        const leadCard = this.currentTrick[0]?.card;
        const leadSuit = leadCard ? leadCard.suit : Suit.None;

        // Basic heuristic: play to win if holding a strong card, otherwise play low
        if (leadCard) {
            // Find current winning play
            let bestPlay = this.currentTrick[0];
            for (let i = 1; i < this.currentTrick.length; ++i) {
                const play = this.currentTrick[i];
                if (this.compareCards_(play.card, bestPlay.card, leadSuit) > 0) {
                    bestPlay = play;
                }
            }

            // Split into winning vs losing cards
            const winningCards: Card[] = [];
            const losingCards: Card[] = [];

            for (const card of legalCards) {
                if (this.compareCards_(card, bestPlay.card, leadSuit) > 0) {
                    winningCards.push(card);
                } else {
                    losingCards.push(card);
                }
            }

            if (winningCards.length > 0) {
                // Play our highest winning card to secure the trick
                return this.getHighestCard_(winningCards, leadSuit);
            } else {
                // Can't win, throw away lowest card
                return this.getLowestCard_(legalCards);
            }
        } else {
            // Leading: Play our highest overall card to win, or lowest if hand is weak.
            // Let's play highest card overall to try to win tricks.
            return this.getHighestCard_(legalCards, Suit.None);
        }
    }

    protected override evaluateRoundScores_(): void {
        const roundLogs: string[] = [];
        for (const player of this.players) {
            const tricksWon = this.scoreTracker.getTricks(player);
            // each player scores 1 point per trick above 4 taken in a round (taking 4 or fewer scores nothing)
            const pts = Math.max(0, tricksWon - 4);
            this.scoreTracker.addScore(player, pts);
            roundLogs.push(`${player.name}: won ${tricksWon} tricks -> scored ${pts} pts`);
        }
        this.gameLog.push(`Round ended. ${roundLogs.join(", ")}`);
        for (const player of this.players) {
            this.gameLog.push(`${player.name} total score: ${this.scoreTracker.getScore(player)}`);
        }
    }

    protected override checkGameWon_(): boolean {
        const scores = this.players.map(p => ({
            player: p,
            score: this.scoreTracker.getScore(p)
        }));

        const reached10 = scores.some(s => s.score >= this.winningScore);
        if (!reached10) {
            return false;
        }

        // Find max score
        const maxScore = Math.max(...scores.map(s => s.score));
        const winners = scores.filter(s => s.score === maxScore);

        if (winners.length === 1) {
            const winner = winners[0].player;
            this.gameLog.push(`🏆 ${winner.name} won the game with ${maxScore} points! 🏆`);
            return true;
        }

        // Tie-break: continue playing until there's a unique leader
        return false;
    }

    // Custom serializer to save/load all Manni states
    public override serialize(): string {
        const baseJson = super.serialize();
        const state = JSON.parse(baseJson);

        state.isExchangePhase = this.isExchangePhase;
        state.currentExchangingPlayerIndex = this.currentExchangingPlayerIndex;
        state.exchangeCompleted = this.exchangeCompleted;
        state.exchangesCount = this.exchangesCount;
        state.cardsSelectedForExchange = this.cardsSelectedForExchange.map(c => ({ suit: c.suit, rank: c.rank }));

        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            if (!state) return false;

            const baseSuccess = super.deserialize(json);
            if (!baseSuccess) return false;

            this.isExchangePhase = state.isExchangePhase ?? false;
            this.currentExchangingPlayerIndex = state.currentExchangingPlayerIndex ?? -1;
            this.exchangeCompleted = state.exchangeCompleted ?? false;
            this.exchangesCount = state.exchangesCount ?? [null, null, null];

            this.cardsSelectedForExchange = [];
            if (state.cardsSelectedForExchange) {
                for (const item of state.cardsSelectedForExchange) {
                    const card = this.cards.find(c => c.suit === item.suit && c.rank === item.rank);
                    if (card) {
                        this.cardsSelectedForExchange.push(card);
                    }
                }
            }

            // Put indicator cards in the correct indicator piles based on state / Trump
            const orderOfSuits = [Suit.Hearts, Suit.Spades, Suit.Diamonds, Suit.Clubs];
            for (let i = 0; i < 4; ++i) {
                const suit = orderOfSuits[i];
                const twoCard = this.cards.find(c => c.rank === Rank.Two && c.suit === suit);
                if (twoCard && twoCard.pile !== this.trumpIndicatorPiles[i]) {
                    this.trumpIndicatorPiles[i].push(twoCard);
                }
                if (twoCard) {
                    twoCard.doSetFaceUp(suit === this.trumpSuit);
                }
            }

            if (this.isExchangePhase) {
                this.turnLoopGenerator = this.runExchangePhase_();
            } else {
                this.turnLoopGenerator = this.runTurnLoop_();
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize Manni state", error);
            return false;
        }
    }

    // Override to ensure human interactions route properly during exchange phase
    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (this.isExchangePhase) {
            const humanIdx = this.players.findIndex(p => p.isHuman);
            if (this.currentExchangingPlayerIndex !== humanIdx) return;

            const hand = this.handPiles[humanIdx];
            if (card.pile !== hand) return;

            const maxAllowed = [7, 5, this.manniPile.length];
            const currentOrderIdx = [
                this.currentExchangingPlayerIndex,
                (this.currentExchangingPlayerIndex + 1) % 3,
                (this.currentExchangingPlayerIndex + 2) % 3
            ].indexOf(this.currentExchangingPlayerIndex);
            const maxExchangeLimit = maxAllowed[currentOrderIdx] || 7;

            const idx = this.cardsSelectedForExchange.indexOf(card);
            if (idx >= 0) {
                this.cardsSelectedForExchange.splice(idx, 1);
            } else {
                if (this.cardsSelectedForExchange.length < maxExchangeLimit) {
                    this.cardsSelectedForExchange.push(card);
                }
            }
            return;
        }

        yield* super.cardPrimary_(card);
    }
}
