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
import { Colour } from "~CardLib/Model/Colour";
import prand from "pure-rand";

export type SkatContractType = "Suit" | "Grand" | "Null";
export type SkatAnnouncement = "None" | "Schneider" | "Schwarz" | "Ouvert";

export function getSkatBidValues(): number[] {
    const values = new Set<number>();
    // Multiples of 9, 10, 11, 12, 24 from multiplier >= 2
    for (const base of [9, 10, 11, 12, 24]) {
        for (let mult = 2; mult <= 20; ++mult) {
            values.add(base * mult);
        }
    }
    // Null games
    values.add(23);
    values.add(35);
    values.add(46);
    values.add(59);

    return Array.from(values).sort((a, b) => a - b);
}

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    // 3 Players: 0: Human (You), 1: AI West, 2: AI East
    // Rearhand is dealer. Forehand is left of dealer. Middlehand is left of Forehand.
    public dealerIndex = 0;

    // Bidding phase state
    public isBiddingPhase = false;
    public biddingStage = 0; // 0: Middlehand vs Forehand, 1: Winner vs Rearhand, 2: Completed
    public activeBidderIndex = 0;
    public passiveBidderIndex = 0;
    public currentBid = 0;
    public proposedBid = 0;
    public passedPlayers: boolean[] = [false, false, false];
    public biddingState: "active_to_propose" | "passive_to_respond" = "active_to_propose";
    public waitingForHumanBid = false;

    // Declarer and contract states
    public declarerIndex = -1;
    public isSkatPickupPhase = false;
    public waitingForHumanDiscard = false;
    public isContractSelectionPhase = false;
    public waitingForHumanContract = false;

    // Selected contract options
    public contractType: SkatContractType = "Suit";
    public chosenTrumpSuit: Suit = Suit.None;
    public isHandGame = false;
    public announcement: SkatAnnouncement = "None";

    // Piles
    public skatPile!: Pile;

    // Custom tracking
    public roundTricksCount: number[] = [0, 0, 0];
    public roundCardPoints: number[] = [0, 0, 0];
    public declarerWinPoints = 0;

    public override get winningScore(): number {
        return 150; // Skat game ends at 150 cumulative score
    }

    constructor(params: URLSearchParams) {
        super(3); // 3 Players
        this.options = new GameOptions(params);

        this.players = [
            { id: "player0", name: "You", isHuman: true },
            { id: "player1", name: "AI West", isHuman: false },
            { id: "player2", name: "AI East", isHuman: false },
        ];

        this.scoreTracker = new ScoreTracker("player");

        // Set up the Skat pile
        this.skatPile = new Pile(this);
        this.piles.push(this.skatPile);

        // Filter standard 52 deck down to 32 Skat cards (ranks 7 through Ace)
        const allowedRanks = [Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace];
        const cardsArray = (this.deckPile as any).cards_ as Card[];
        const skatCardsArray = cardsArray.filter(c => allowedRanks.includes(c.rank));

        cardsArray.length = 0;
        for (let i = 0; i < skatCardsArray.length; ++i) {
            const card = skatCardsArray[i];
            cardsArray.push(card);
            card.pileIndex = i;
        }

        this.cards = skatCardsArray;
        this.deckPile.cardsChanged();

        this.dealerIndex = Math.floor(Math.random() * 3);
    }

    public override determineTrump_(round: number): Suit {
        return Suit.None;
    }

    protected override *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = [0, 0, 0];
        this.sittingOutThisTrick = [false, false, false];

        // Reset round metrics
        this.roundTricksCount = [0, 0, 0];
        this.roundCardPoints = [0, 0, 0];

        // Gather all cards back to deck
        for (const pile of this.playedPiles) {
            while (pile.length > 0) {
                const card = pile.peek();
                if (card) {
                    this.deckPile.push(card);
                }
            }
        }
        while (this.skatPile.length > 0) {
            const card = this.skatPile.peek();
            if (card) {
                this.deckPile.push(card);
            }
        }

        for (const card of this.cards) {
            this.deckPile.push(card);
            card.doSetFaceUp(false);
        }

        // Shuffle deck
        this.deckPile.shuffle(rng);

        // Advance dealer index clockwise
        if (this.roundNumber > 1) {
            this.dealerIndex = (this.dealerIndex + 1) % 3;
        }

        const forehand = (this.dealerIndex + 1) % 3;
        const middlehand = (this.dealerIndex + 2) % 3;
        const rearhand = this.dealerIndex;

        // Deal pattern: 3-3-4 pattern with 2 cards to Skat
        // 1. Deal 3 to each player
        for (let i = 0; i < 3; ++i) {
            const playerIdx = (forehand + i) % 3;
            for (let c = 0; c < 3; ++c) {
                const card = this.deckPile.peek();
                if (card) {
                    this.handPiles[playerIdx].push(card);
                    card.doSetFaceUp(this.players[playerIdx].isHuman);
                }
            }
            yield DelayHint.Quick;
        }

        // 2. Deal 2 cards to the face-down Skat pile
        for (let c = 0; c < 2; ++c) {
            const card = this.deckPile.peek();
            if (card) {
                this.skatPile.push(card);
                card.doSetFaceUp(false); // always face down
            }
        }
        yield DelayHint.Quick;

        // 3. Deal 4 to each player
        for (let i = 0; i < 3; ++i) {
            const playerIdx = (forehand + i) % 3;
            for (let c = 0; c < 4; ++c) {
                const card = this.deckPile.peek();
                if (card) {
                    this.handPiles[playerIdx].push(card);
                    card.doSetFaceUp(this.players[playerIdx].isHuman);
                }
            }
            yield DelayHint.Quick;
        }

        // 4. Deal 3 to each player
        for (let i = 0; i < 3; ++i) {
            const playerIdx = (forehand + i) % 3;
            for (let c = 0; c < 3; ++c) {
                const card = this.deckPile.peek();
                if (card) {
                    this.handPiles[playerIdx].push(card);
                    card.doSetFaceUp(this.players[playerIdx].isHuman);
                }
            }
            yield DelayHint.Quick;
        }

        // Sort human player's hand:
        for (let i = 0; i < 3; ++i) {
            if (this.players[i].isHuman) {
                this.sortHand_(this.handPiles[i]);
            }
        }

        // Set up Bidding Phase
        this.isBiddingPhase = true;
        this.biddingStage = 0;
        this.activeBidderIndex = middlehand;
        this.passiveBidderIndex = forehand;
        this.currentBid = 0;
        this.proposedBid = 0;
        this.passedPlayers = [false, false, false];
        this.biddingState = "active_to_propose";
        this.waitingForHumanBid = false;

        this.declarerIndex = -1;
        this.isSkatPickupPhase = false;
        this.waitingForHumanDiscard = false;
        this.isContractSelectionPhase = false;
        this.waitingForHumanContract = false;

        this.gameLog.push(`--- Round ${this.roundNumber}: Bidding Phase ---`);
        this.gameLog.push(`Forehand: ${this.players[forehand].name}, Middlehand: ${this.players[middlehand].name}, Rearhand (Dealer): ${this.players[rearhand].name}`);

        yield* this.runBiddingPhase_();
    }

    public *runBiddingPhase_(): Generator<DelayHint, void> {
        while (this.isBiddingPhase) {
            const passedCount = this.passedPlayers.filter(p => p).length;
            if (passedCount === 3) {
                // All passed, redeal!
                this.gameLog.push("All players passed! Redealing...");
                yield DelayHint.Settle;
                const rng = prand.mersenne(Date.now());
                yield* this.startNewRound_(rng);
                return;
            }

            if (passedCount === 2) {
                // We have a winner!
                const winnerIdx = this.passedPlayers.indexOf(false);
                this.declarerIndex = winnerIdx;
                this.isBiddingPhase = false;
                this.gameLog.push(`${this.players[winnerIdx].name} won the bidding at ${this.currentBid || 18}!`);
                if (this.currentBid === 0) {
                    this.currentBid = 18; // Minimum bid if everyone else passed without proposing
                }
                yield* this.startDeclarerPhase_();
                return;
            }

            // Determine whose turn it is to act based on current state
            const currentPlayerIdx = this.biddingState === "active_to_propose" ? this.activeBidderIndex : this.passiveBidderIndex;
            const currentPlayer = this.players[currentPlayerIdx];

            if (currentPlayer.isHuman) {
                this.waitingForHumanBid = true;
                return; // Pause generator, wait for human bid submission
            } else {
                yield DelayHint.OneByOne;
                if (this.biddingState === "active_to_propose") {
                    const nextVal = this.getNextValidBid_(this.currentBid);
                    const wantsToBid = this.evaluateAIPotentialBid_(currentPlayerIdx, nextVal);
                    if (wantsToBid) {
                        yield* this.processActiveProposal_(nextVal);
                    } else {
                        yield* this.processActivePass_();
                    }
                } else {
                    const wantsToHold = this.evaluateAIPotentialBid_(currentPlayerIdx, this.proposedBid);
                    if (wantsToHold) {
                        yield* this.processPassiveYes_();
                    } else {
                        yield* this.processPassivePass_();
                    }
                }
            }
        }
    }

    public getNextValidBid_(val: number): number {
        const list = getSkatBidValues();
        for (const v of list) {
            if (v > val) return v;
        }
        return val + 1; // Fallback
    }

    public evaluateAIPotentialBid_(playerIdx: number, val: number): boolean {
        // AI bidding heuristic:
        // Evaluate hand strength across Grand, Clubs, Spades, Hearts, Diamonds.
        const hand = this.handPiles[playerIdx];
        let maxVal = 18;

        // Count jacks and high cards
        const jacksCount = [...hand].filter(c => c.rank === Rank.Jack).length;
        const acesCount = [...hand].filter(c => c.rank === Rank.Ace).length;

        // Heuristic:
        // Jacks are the primary driver of bidding in Skat.
        // 4 Jacks + strong suit is Grand/high suit.
        if (jacksCount >= 3) {
            maxVal = 48; // Grand or high suit
        } else if (jacksCount === 2) {
            maxVal = 30; // Medium suit
        } else if (jacksCount === 1) {
            maxVal = 22; // Low suit or pass soon
        } else {
            maxVal = 18; // Very weak, only bid 18 if forced/easy
        }

        // Add suit cards count to heuristic
        for (const suit of [Suit.Clubs, Suit.Spades, Suit.Hearts, Suit.Diamonds]) {
            const suitCount = [...hand].filter(c => c.suit === suit).length;
            if (suitCount >= 5) {
                maxVal = Math.max(maxVal, suitCount * 8);
            }
        }

        // Null game potential: if they have no Jacks, no Aces, and lots of low cards (7, 8, 9)
        const lowCards = [...hand].filter(c => c.rank === Rank.Seven || c.rank === Rank.Eight || c.rank === Rank.Nine).length;
        if (jacksCount === 0 && acesCount === 0 && lowCards >= 6) {
            maxVal = Math.max(maxVal, 35); // Null Hand potential
        }

        return val <= maxVal;
    }

    public *processActiveProposal_(bid: number): Generator<DelayHint, void> {
        const bidder = this.players[this.activeBidderIndex];
        this.proposedBid = bid;
        this.gameLog.push(`${bidder.name} bids ${bid}.`);
        this.biddingState = "passive_to_respond";
    }

    public *processActivePass_(): Generator<DelayHint, void> {
        const bidder = this.players[this.activeBidderIndex];
        this.passedPlayers[this.activeBidderIndex] = true;
        this.gameLog.push(`${bidder.name} passes.`);

        // Active bidder is out. The passive bidder wins this exchange.
        // Now survivor (passive) will exchange with Rearhand (dealer), if they weren't already the dealer.
        const rearhand = this.dealerIndex;
        if (this.biddingStage === 0) {
            // Stage 0 survivor is passive bidder (Forehand).
            // Now Middlehand is out. Passive bidder (Forehand) now has currentBid = proposedBid (if proposedBid was accepted) or currentBid = currentBid.
            // Wait, who asks whom in stage 1?
            // The survivor of stage 0 vs Rearhand. Rearhand (dealer) is passive (answers), survivor is active (asks).
            this.biddingStage = 1;
            this.activeBidderIndex = this.passiveBidderIndex; // survivor asks
            this.passiveBidderIndex = rearhand; // Rearhand answers
            this.biddingState = "active_to_propose";
            this.proposedBid = 0;
        } else {
            // Stage 1 completed
            this.isBiddingPhase = false;
        }
    }

    public *processPassiveYes_(): Generator<DelayHint, void> {
        const passive = this.players[this.passiveBidderIndex];
        this.currentBid = this.proposedBid;
        this.gameLog.push(`${passive.name} says yes.`);
        // Turn goes back to active bidder to propose higher value
        this.biddingState = "active_to_propose";
    }

    public *processPassivePass_(): Generator<DelayHint, void> {
        const passive = this.players[this.passiveBidderIndex];
        this.passedPlayers[this.passiveBidderIndex] = true;
        this.gameLog.push(`${passive.name} passes.`);

        // Passive bidder is out. Active bidder wins this exchange.
        // Stage 0 survivor is active bidder.
        const rearhand = this.dealerIndex;
        if (this.biddingStage === 0) {
            this.biddingStage = 1;
            // activeBidder remains activeBidder (M)
            this.passiveBidderIndex = rearhand; // Rearhand answers
            this.biddingState = "active_to_propose";
            this.proposedBid = 0;
        } else {
            // Stage 1 completed
            this.isBiddingPhase = false;
        }
    }

    public *submitHumanBidAction_(action: "bid" | "yes" | "pass"): Generator<DelayHint, void> {
        if (!this.isBiddingPhase || !this.waitingForHumanBid) return;

        this.waitingForHumanBid = false;

        const humanIdx = 0;
        if (this.biddingState === "active_to_propose") {
            if (action === "bid") {
                const nextVal = this.getNextValidBid_(this.currentBid);
                yield* this.processActiveProposal_(nextVal);
            } else {
                yield* this.processActivePass_();
            }
        } else {
            if (action === "yes") {
                yield* this.processPassiveYes_();
            } else {
                yield* this.processPassivePass_();
            }
        }

        yield* this.runBiddingPhase_();
    }

    public *startDeclarerPhase_(): Generator<DelayHint, void> {
        // Bidding is over. Declarer decided.
        const declarer = this.players[this.declarerIndex];
        this.gameLog.push(`--- Declarer Choice: ${declarer.name} ---`);

        if (declarer.isHuman) {
            this.isSkatPickupPhase = true;
            return; // Pause generator, wait for human choice to pick up Skat or play hand
        } else {
            yield DelayHint.OneByOne;
            // AI declarer heuristic:
            // If they have extremely strong hand, they can play Hand game.
            // Otherwise, they always pick up the Skat to improve their hand! (Highly standard AI play)
            const playHand = this.evaluateAIPlayHand_(this.declarerIndex);
            if (playHand) {
                yield* this.declareHandGame_();
            } else {
                yield* this.declareSkatGame_();
            }
        }
    }

    public evaluateAIPlayHand_(playerIdx: number): boolean {
        const hand = this.handPiles[playerIdx];
        const jacks = [...hand].filter(c => c.rank === Rank.Jack).length;
        return jacks === 4; // AI only plays Hand game if they have all 4 Jacks!
    }

    public *declareHandGame_(): Generator<DelayHint, void> {
        this.isHandGame = true;
        this.isSkatPickupPhase = false;
        this.gameLog.push(`${this.players[this.declarerIndex].name} chooses to play a Hand Game (Skat stays down).`);
        yield* this.startContractSelection_();
    }

    public *declareSkatGame_(): Generator<DelayHint, void> {
        this.isHandGame = false;
        this.isSkatPickupPhase = false;

        const declarer = this.players[this.declarerIndex];
        this.gameLog.push(`${declarer.name} chooses to pick up the Skat.`);

        // Move Skat cards to Hand
        const hand = this.handPiles[this.declarerIndex];
        while (this.skatPile.length > 0) {
            const card = this.skatPile.peek();
            if (card) {
                hand.push(card);
                card.doSetFaceUp(declarer.isHuman);
            }
        }

        if (declarer.isHuman) {
            this.waitingForHumanDiscard = true;
            this.sortHand_(hand);
            return; // Wait for human to discard exactly 2 cards
        } else {
            yield DelayHint.OneByOne;
            // AI discards 2 worst cards
            const discard1 = this.chooseAIDiscard_(this.declarerIndex);
            this.skatPile.push(discard1);
            discard1.doSetFaceUp(false);

            const discard2 = this.chooseAIDiscard_(this.declarerIndex);
            this.skatPile.push(discard2);
            discard2.doSetFaceUp(false);

            this.gameLog.push(`AI Declarer discarded 2 cards face-down.`);
            yield* this.startContractSelection_();
        }
    }

    public chooseAIDiscard_(playerIdx: number): Card {
        // AI Discard: choose lowest value non-trump, non-Jack cards
        const hand = this.handPiles[playerIdx];
        // For simplicity, find non-jack, non-Aces first
        let bestDiscard = hand.at(0);
        let bestRating = this.getAIDiscardRating_(bestDiscard);

        for (let i = 1; i < hand.length; ++i) {
            const card = hand.at(i);
            const rating = this.getAIDiscardRating_(card);
            if (rating < bestRating) {
                bestRating = rating;
                bestDiscard = card;
            }
        }

        return bestDiscard;
    }

    private getAIDiscardRating_(card: Card): number {
        // We want to discard non-jack, non-Ace cards, especially 7, 8, 9 of weak suits
        if (card.rank === Rank.Jack) return 100;
        if (card.rank === Rank.Ace) return 80;
        if (card.rank === Rank.Ten) return 60;
        if (card.rank === Rank.King) return 40;
        if (card.rank === Rank.Queen) return 30;
        return card.rank; // 7, 8, 9 rank lower
    }

    public *submitHumanDiscard_(cards: Card[]): Generator<DelayHint, void> {
        if (!this.waitingForHumanDiscard || cards.length !== 2) return;

        const hand = this.handPiles[0];
        for (const card of cards) {
            if (card.pile !== hand) return;
        }

        for (const card of cards) {
            this.skatPile.push(card);
            card.doSetFaceUp(false);
        }

        this.waitingForHumanDiscard = false;
        this.gameLog.push(`You discarded 2 cards face-down.`);

        this.sortHand_(hand);

        yield* this.startContractSelection_();
    }

    public *startContractSelection_(): Generator<DelayHint, void> {
        const declarer = this.players[this.declarerIndex];
        if (declarer.isHuman) {
            this.isContractSelectionPhase = true;
            this.waitingForHumanContract = true;
            return; // Pause generator, wait for human choice
        } else {
            yield DelayHint.OneByOne;
            // AI chooses contract
            const contract = this.chooseAIContract_(this.declarerIndex);
            this.contractType = contract.type;
            this.chosenTrumpSuit = contract.suit;
            this.announcement = "None"; // AI doesn't announce side contracts

            this.trumpSuit = contract.type === "Suit" ? contract.suit : Suit.None;

            this.gameLog.push(`${declarer.name} declares contract: ${this.getContractDisplayName_()}`);
            yield* this.startPlayPhase_();
        }
    }

    public chooseAIContract_(playerIdx: number): { type: SkatContractType; suit: Suit } {
        const hand = this.handPiles[playerIdx];
        const jacks = [...hand].filter(c => c.rank === Rank.Jack);

        // If they have J♣ and J♠ (strong jacks), check if Grand or Suit is best
        if (jacks.length >= 3) {
            // Grand is likely excellent!
            return { type: "Grand", suit: Suit.None };
        }

        // Check longest suit
        const suitCounts: Record<Suit, number> = {
            [Suit.Spades]: 0,
            [Suit.Hearts]: 0,
            [Suit.Diamonds]: 0,
            [Suit.Clubs]: 0,
            [Suit.None]: 0,
        };
        for (const card of hand) {
            if (card.suit in suitCounts) {
                suitCounts[card.suit]++;
            }
        }

        let bestSuit = Suit.Clubs;
        let maxCount = -1;
        for (const suit of [Suit.Clubs, Suit.Spades, Suit.Hearts, Suit.Diamonds]) {
            if (suitCounts[suit] > maxCount) {
                maxCount = suitCounts[suit];
                bestSuit = suit;
            }
        }

        // If we have no jacks and many low cards, Null is a choice
        const lowCards = [...hand].filter(c => c.rank === Rank.Seven || c.rank === Rank.Eight || c.rank === Rank.Nine).length;
        if (jacks.length === 0 && lowCards >= 6) {
            return { type: "Null", suit: Suit.None };
        }

        return { type: "Suit", suit: bestSuit };
    }

    public getContractDisplayName_(): string {
        if (this.contractType === "Null") {
            let label = "Null";
            if (this.isHandGame) label += " Hand";
            if (this.announcement === "Ouvert") label += " Ouvert";
            return label;
        }
        if (this.contractType === "Grand") {
            let label = "Grand";
            if (this.isHandGame) label += " Hand";
            if (this.announcement !== "None") label += ` (${this.announcement})`;
            return label;
        }
        const suitSymbols = {
            [Suit.Spades]: "Spades ♠",
            [Suit.Hearts]: "Hearts ♥",
            [Suit.Diamonds]: "Diamonds ♦",
            [Suit.Clubs]: "Clubs ♣",
            [Suit.None]: "None",
        };
        let label = suitSymbols[this.chosenTrumpSuit] || "Suit";
        if (this.isHandGame) label += " Hand";
        if (this.announcement !== "None") label += ` (${this.announcement})`;
        return label;
    }

    public *submitHumanContract_(type: SkatContractType, suit: Suit, announce: SkatAnnouncement): Generator<DelayHint, void> {
        if (!this.isContractSelectionPhase || !this.waitingForHumanContract) return;

        this.contractType = type;
        this.chosenTrumpSuit = suit;
        this.announcement = announce;
        this.trumpSuit = type === "Suit" ? suit : Suit.None;

        this.isContractSelectionPhase = false;
        this.waitingForHumanContract = false;

        this.gameLog.push(`You declare contract: ${this.getContractDisplayName_()}`);

        yield* this.startPlayPhase_();
    }

    public *startPlayPhase_(): Generator<DelayHint, void> {
        // Sort declarer's hand for clear visuals
        const declarer = this.players[this.declarerIndex];
        this.sortHand_(this.handPiles[this.declarerIndex]);

        // If Ouvert is announced/played, turn declarer's hand face up for all to see
        if (this.announcement === "Ouvert" || (this.contractType === "Null" && this.announcement === "Ouvert")) {
            for (const card of this.handPiles[this.declarerIndex]) {
                card.doSetFaceUp(true);
            }
        }

        // Forehand (left of dealer) always leads the first trick!
        this.currentLeaderIndex = (this.dealerIndex + 1) % 3;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.waitingForHumanPlay = false;

        this.gameLog.push(`--- Play Phase ---`);
        this.gameLog.push(`${this.players[this.currentLeaderIndex].name} leads the first trick.`);

        // Launch trick-taking loop
        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    // Required by TrickTakingGameBase:
    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];
        if (this.currentTrick.length === 0) {
            return [...hand];
        }

        const leadCard = this.currentTrick[0].card;
        const leadSuit = this.getEffectiveSuit_(leadCard);

        const matchingCards = [...hand].filter(c => this.getEffectiveSuit_(c) === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
    }

    public getEffectiveSuit_(card: Card): Suit {
        if (this.contractType === "Null") {
            return card.suit;
        }

        // In Suit/Grand, Jacks are trumps!
        if (card.rank === Rank.Jack) {
            return Suit.None; // Special "Trump" suit representation
        }

        if (this.contractType === "Suit" && card.suit === this.chosenTrumpSuit) {
            return Suit.None; // Also trump
        }

        return card.suit;
    }

    protected override compareCards_(a: Card, b: Card, leadSuit: Suit): number {
        const aIsTrump = this.isCardTrump_(a);
        const bIsTrump = this.isCardTrump_(b);

        if (aIsTrump && !bIsTrump) return 1;
        if (!aIsTrump && bIsTrump) return -1;

        if (aIsTrump && bIsTrump) {
            return this.getTrumpRankValue_(a) - this.getTrumpRankValue_(b);
        }

        // Neither is trump
        // In Skat, leadSuit is the effective suit of the card led.
        // Wait, if leadSuit is None, it means a trump was led!
        const aIsLead = this.getEffectiveSuit_(a) === leadSuit;
        const bIsLead = this.getEffectiveSuit_(b) === leadSuit;

        if (aIsLead && !bIsLead) return 1;
        if (!aIsLead && bIsLead) return -1;

        if (aIsLead && bIsLead) {
            return this.getNonTrumpRankValue_(a) - this.getNonTrumpRankValue_(b);
        }

        // Neither matches lead
        return this.getNonTrumpRankValue_(a) - this.getNonTrumpRankValue_(b);
    }

    public isCardTrump_(card: Card): boolean {
        if (this.contractType === "Null") {
            return false;
        }
        if (card.rank === Rank.Jack) {
            return true;
        }
        if (this.contractType === "Suit" && card.suit === this.chosenTrumpSuit) {
            return true;
        }
        return false;
    }

    public getTrumpRankValue_(card: Card): number {
        // Jacks rank: Clubs (♣) > Spades (♠) > Hearts (♥) > Diamonds (♦)
        // Let's assign numerical values: Club Jack is 100, Spade Jack is 90, Heart Jack is 80, Diamond Jack is 70
        if (card.rank === Rank.Jack) {
            if (card.suit === Suit.Clubs) return 100;
            if (card.suit === Suit.Spades) return 90;
            if (card.suit === Suit.Hearts) return 80;
            if (card.suit === Suit.Diamonds) return 70;
        }

        // Below Jacks, ranking is: A (11) > 10 (10) > K (4) > Q (3) > 9 (0) > 8 (0) > 7 (0)
        // Wait, for comparison we just need monotonic ranking: A > 10 > K > Q > 9 > 8 > 7
        const rankMap: Record<Rank, number> = {
            [Rank.Ace]: 14,
            [Rank.Ten]: 13,
            [Rank.King]: 12,
            [Rank.Queen]: 11,
            [Rank.Nine]: 10,
            [Rank.Eight]: 9,
            [Rank.Seven]: 8,
            [Rank.Jack]: 0, // Jack already handled
        };
        return rankMap[card.rank as keyof typeof rankMap] || 0;
    }

    public getNonTrumpRankValue_(card: Card): number {
        // For Suit/Grand: A > 10 > K > Q > 9 > 8 > 7
        // For Null: A > K > Q > J > 10 > 9 > 8 > 7
        if (this.contractType === "Null") {
            const rankMapNull: Record<Rank, number> = {
                [Rank.Ace]: 15,
                [Rank.King]: 14,
                [Rank.Queen]: 13,
                [Rank.Jack]: 12,
                [Rank.Ten]: 11,
                [Rank.Nine]: 10,
                [Rank.Eight]: 9,
                [Rank.Seven]: 8,
            };
            return rankMapNull[card.rank as keyof typeof rankMapNull] || 0;
        } else {
            const rankMapNormal: Record<Rank, number> = {
                [Rank.Ace]: 14,
                [Rank.Ten]: 13,
                [Rank.King]: 12,
                [Rank.Queen]: 11,
                [Rank.Nine]: 10,
                [Rank.Eight]: 9,
                [Rank.Seven]: 8,
                [Rank.Jack]: 0, // shouldn't happen as Jack is trump
            };
            return rankMapNormal[card.rank as keyof typeof rankMapNormal] || 0;
        }
    }

    public getCardPoints_(card: Card): number {
        if (card.rank === Rank.Ace) return 11;
        if (card.rank === Rank.Ten) return 10;
        if (card.rank === Rank.King) return 4;
        if (card.rank === Rank.Queen) return 3;
        if (card.rank === Rank.Jack) return 2;
        return 0; // 7, 8, 9 are worth 0
    }

    protected override chooseAIPlay_(player: IPlayer): Card {
        const playerIdx = this.players.indexOf(player);
        const hand = this.handPiles[playerIdx];
        const legal = this.getLegalCards_(hand);

        if (legal.length === 0) {
            throw new Error(`AI player ${player.name} has no cards in hand.`);
        }

        // Is this player the Declarer or Defender?
        const isDeclarer = playerIdx === this.declarerIndex;

        // If leading:
        if (this.currentTrick.length === 0) {
            if (this.contractType === "Null") {
                // If Declarer in Null: play lowest cards to lose the trick
                if (isDeclarer) {
                    return this.getLowestCardNull_(legal);
                }
                // Defender in Null: play high cards to try to force Declarer to win, or safe lead
                return this.getHighestCardNull_(legal);
            } else {
                // Suit/Grand: play high trumps or safe low suit cards
                if (isDeclarer) {
                    // Try to draw trumps if we have strong jacks, else play high Ace
                    const trumps = legal.filter(c => this.isCardTrump_(c));
                    if (trumps.length > 0) {
                        return this.getHighestCard_(trumps, Suit.None);
                    }
                }
                return this.getLowestCard_(legal);
            }
        }

        // If following:
        const leadCard = this.currentTrick[0].card;
        const leadSuit = this.getEffectiveSuit_(leadCard);

        // Find current best play in the trick
        let bestPlay = this.currentTrick[0];
        for (let i = 1; i < this.currentTrick.length; ++i) {
            const play = this.currentTrick[i];
            if (this.compareCards_(play.card, bestPlay.card, leadSuit) > 0) {
                bestPlay = play;
            }
        }

        if (this.contractType === "Null") {
            if (isDeclarer) {
                // Null Declarer: must play the highest legal card that is STILL lower than bestPlay, to avoid winning!
                // If all legal cards are higher, they have to win (and will lose the game).
                const lowerCards = legal.filter(c => this.compareCards_(c, bestPlay.card, leadSuit) < 0);
                if (lowerCards.length > 0) {
                    return this.getHighestCardNull_(lowerCards);
                }
                return this.getHighestCardNull_(legal); // forced to win
            } else {
                // Defender in Null: if declarer already played, try to throw a card higher than declarer's if we want to win,
                // or if we can force declarer to win, throw card just below declarer's.
                return this.getLowestCardNull_(legal);
            }
        } else {
            // Suit/Grand game play
            const bestPlayPlayerIdx = this.players.indexOf(bestPlay.player);
            const bestPlayIsDeclarer = bestPlayPlayerIdx === this.declarerIndex;

            if (isDeclarer) {
                // Declarer wants to win the trick if possible, or play lowest card if they can't win
                const winningCards = legal.filter(c => this.compareCards_(c, bestPlay.card, leadSuit) > 0);
                if (winningCards.length > 0) {
                    return this.getHighestCard_(winningCards, leadSuit);
                }
                return this.getLowestCard_(legal);
            } else {
                // Defender: cooperating with the other defender
                if (bestPlayIsDeclarer) {
                    // Declarer is currently winning: try to beat declarer
                    const winningCards = legal.filter(c => this.compareCards_(c, bestPlay.card, leadSuit) > 0);
                    if (winningCards.length > 0) {
                        return this.getHighestCard_(winningCards, leadSuit);
                    }
                    // Can't win: throw lowest value/point card
                    return this.getLowestCard_(legal);
                } else {
                    // Defender partner is winning! "Paint/Smear" points into the trick if safe, else throw low card
                    const pointCards = legal.filter(c => this.getCardPoints_(c) > 0 && this.compareCards_(c, bestPlay.card, leadSuit) < 0);
                    if (pointCards.length > 0) {
                        // Throw high point card to partner
                        pointCards.sort((a, b) => this.getCardPoints_(b) - this.getCardPoints_(a));
                        return pointCards[0];
                    }
                    return this.getLowestCard_(legal);
                }
            }
        }
    }

    private getLowestCardNull_(cards: Card[]): Card {
        let worst = cards[0];
        for (let i = 1; i < cards.length; ++i) {
            const current = cards[i];
            if (this.getNonTrumpRankValue_(current) < this.getNonTrumpRankValue_(worst)) {
                worst = current;
            }
        }
        return worst;
    }

    private getHighestCardNull_(cards: Card[]): Card {
        let best = cards[0];
        for (let i = 1; i < cards.length; ++i) {
            const current = cards[i];
            if (this.getNonTrumpRankValue_(current) > this.getNonTrumpRankValue_(best)) {
                best = current;
            }
        }
        return best;
    }

    protected override *evaluateTrickWinner_(): Generator<DelayHint, void> {
        if (this.currentTrick.length < 3) return;

        const leadCard = this.currentTrick[0].card;
        const leadSuit = this.getEffectiveSuit_(leadCard);
        let winningPlay = this.currentTrick[0];

        for (let i = 1; i < 3; ++i) {
            const play = this.currentTrick[i];
            if (this.compareCards_(play.card, winningPlay.card, leadSuit) > 0) {
                winningPlay = play;
            }
        }

        const winner = winningPlay.player;
        const winnerIndex = this.players.indexOf(winner);

        // Count trick points
        let trickPoints = 0;
        for (const play of this.currentTrick) {
            trickPoints += this.getCardPoints_(play.card);
        }

        this.roundTricksCount[winnerIndex]++;
        this.roundCardPoints[winnerIndex] += trickPoints;

        this.scoreTracker.addTrick(winner);
        this.gameLog.push(`${winner.name} won the trick with ${this.getCardName_(winningPlay.card)} (+${trickPoints} pts)`);

        yield DelayHint.Quick;

        // Clear played piles to deck
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

    public calculateMatadors_(): { count: number; withMatadors: boolean } {
        // Combined 12 cards of the declarer: hand + Skat
        const declarerHand = this.handPiles[this.declarerIndex];
        const combined = [...declarerHand, ...this.skatPile];

        // Define exact trumps order
        const trumpsOrder: Card[] = [];
        // First Jacks: Club, Spade, Heart, Diamond
        const jacks = [
            { suit: Suit.Clubs, rank: Rank.Jack },
            { suit: Suit.Spades, rank: Rank.Jack },
            { suit: Suit.Hearts, rank: Rank.Jack },
            { suit: Suit.Diamonds, rank: Rank.Jack }
        ];

        // Let's check which card matches in combined
        const hasCard = (suit: Suit, rank: Rank) => {
            return combined.some(c => c.suit === suit && c.rank === rank);
        };

        const hasJClubs = hasCard(Suit.Clubs, Rank.Jack);
        const withMatadors = hasJClubs;

        // Let's form the unbroken trumps list
        const list: { suit: Suit; rank: Rank }[] = [...jacks];
        if (this.contractType === "Suit") {
            const ranks = [Rank.Ace, Rank.Ten, Rank.King, Rank.Queen, Rank.Nine, Rank.Eight, Rank.Seven];
            for (const r of ranks) {
                list.push({ suit: this.chosenTrumpSuit, rank: r });
            }
        }

        // Count unbroken run
        let count = 0;
        for (const trumpItem of list) {
            const present = hasCard(trumpItem.suit, trumpItem.rank);
            if (present === withMatadors) {
                count++;
            } else {
                break;
            }
        }

        return { count, withMatadors };
    }

    protected override evaluateRoundScores_(): void {
        const declarer = this.players[this.declarerIndex];

        // Skat card points count for the declarer!
        let skatPoints = 0;
        for (const card of this.skatPile) {
            skatPoints += this.getCardPoints_(card);
        }

        const totalDeclarerPoints = this.roundCardPoints[this.declarerIndex] + skatPoints;
        const opponentPoints = 120 - totalDeclarerPoints;

        this.gameLog.push(`--- Round ${this.roundNumber} Ended ---`);
        this.gameLog.push(`${declarer.name} took ${totalDeclarerPoints} card points (including ${skatPoints} from Skat).`);
        this.gameLog.push(`Opponents took ${opponentPoints} card points.`);

        let isWin = false;
        let gameValue = 0;
        let baseValue = 0;
        let multiplier = 1;

        if (this.contractType === "Null") {
            // Null game evaluation: Declarer must win 0 tricks!
            const declarerTricks = this.roundTricksCount[this.declarerIndex];
            const cleanNullWin = declarerTricks === 0;

            if (this.isHandGame) {
                gameValue = this.announcement === "Ouvert" ? 59 : 35;
            } else {
                gameValue = this.announcement === "Ouvert" ? 46 : 23;
            }

            // Must cover the bid
            isWin = cleanNullWin && (gameValue >= this.currentBid);

            if (!isWin) {
                this.gameLog.push(`Declarer failed Null contract (took ${declarerTricks} tricks or bid too high).`);
            } else {
                this.gameLog.push(`Declarer successfully won Null contract!`);
            }
        } else {
            // Suit/Grand Game
            const matadorsObj = this.calculateMatadors_();
            const matadorsCount = matadorsObj.count;
            multiplier = matadorsCount + 1; // "With/Without X, Game Y" -> starting multiplier is X + 1

            // Hand game bonus
            if (this.isHandGame) {
                multiplier += 1;
            }

            // Schneider achieved (either declarer >= 90 or opponents < 30)
            const schneiderAchieved = totalDeclarerPoints >= 90 || opponentPoints < 30;
            if (schneiderAchieved) {
                multiplier += 1;
            }

            // Schneider announced
            if (this.isHandGame && (this.announcement === "Schneider" || this.announcement === "Schwarz" || this.announcement === "Ouvert")) {
                multiplier += 1;
            }

            // Schwarz achieved (declarer wins all 10 tricks)
            const declarerTricks = this.roundTricksCount[this.declarerIndex];
            const schwarzAchieved = declarerTricks === 10 || declarerTricks === 0; // wait, if opponent wins all 10 tricks, it's Schwarz against declarer.
            if (schwarzAchieved) {
                multiplier += 1;
            }

            // Schwarz announced
            if (this.isHandGame && (this.announcement === "Schwarz" || this.announcement === "Ouvert")) {
                multiplier += 1;
            }

            // Ouvert played
            if (this.isHandGame && this.announcement === "Ouvert") {
                multiplier += 1;
            }

            // Base value
            if (this.contractType === "Grand") {
                baseValue = 24;
            } else {
                const baseMap = {
                    [Suit.Diamonds]: 9,
                    [Suit.Hearts]: 10,
                    [Suit.Spades]: 11,
                    [Suit.Clubs]: 12,
                    [Suit.None]: 9,
                };
                baseValue = baseMap[this.chosenTrumpSuit] || 9;
            }

            gameValue = baseValue * multiplier;

            // General winning conditions:
            // 1. Must score 61+ points (or 90+ if Schneider announced, or all 10 tricks if Schwarz announced)
            let pointsRequirementMet = totalDeclarerPoints >= 61;
            if (this.isHandGame) {
                if (this.announcement === "Schneider" || this.announcement === "Schwarz" || this.announcement === "Ouvert") {
                    pointsRequirementMet = totalDeclarerPoints >= 90;
                }
                if (this.announcement === "Schwarz" || this.announcement === "Ouvert") {
                    pointsRequirementMet = declarerTricks === 10;
                }
            }

            // 2. Game value must cover the bid
            const coversBid = gameValue >= this.currentBid;

            isWin = pointsRequirementMet && coversBid;

            if (!isWin) {
                if (!pointsRequirementMet) {
                    this.gameLog.push(`Declarer failed points requirement (needed 61+, or Schneider/Schwarz announcement targets).`);
                }
                if (!coversBid) {
                    this.gameLog.push(`Declarer OVERBID! (Achieved game value ${gameValue} is less than bid ${this.currentBid}).`);
                    // For overbidding, raise gameValue to the lowest multiple of baseValue >= bid
                    gameValue = Math.ceil(this.currentBid / baseValue) * baseValue;
                }
            } else {
                this.gameLog.push(`Declarer won contract with ${matadorsObj.withMatadors ? "with" : "without"} ${matadorsCount}, multiplier ${multiplier}, game value ${gameValue}.`);
            }
        }

        // Apply scores: declarer is modified, opponents are untouched.
        // Won hand: add game value. Lost hand: subtract DOUBLE game value!
        this.declarerWinPoints = gameValue;
        if (isWin) {
            this.scoreTracker.addScore(declarer, gameValue);
            this.gameLog.push(`🏆 ${declarer.name} wins +${gameValue} points!`);
        } else {
            const penalty = -2 * gameValue;
            this.scoreTracker.addScore(declarer, penalty);
            this.gameLog.push(`❌ ${declarer.name} loses double penalty: ${penalty} points.`);
        }

        this.gameLog.push(`Cumulative Scores: ${this.players.map(p => `${p.name}: ${this.scoreTracker.getScore(p)}`).join(", ")}`);
    }

    protected override checkGameWon_(): boolean {
        // Any player reaches or goes below target/max values?
        // Standard Skat ends when we want to finish or when someone crosses 150. Let's return true if any score >= 150 or <= -150.
        // Wait, let's look at the winning score: 150.
        const scores = this.players.map(p => this.scoreTracker.getScore(p));
        const anyoneCrossed = scores.some(s => Math.abs(s) >= 150);
        if (anyoneCrossed) {
            // Highest score wins
            let bestPlayer = this.players[0];
            let maxScore = scores[0];
            for (let i = 1; i < 3; ++i) {
                if (scores[i] > maxScore) {
                    maxScore = scores[i];
                    bestPlayer = this.players[i];
                }
            }
            this.gameLog.push(`🏆🏆🏆 Game Over! ${bestPlayer.name} wins with ${maxScore} points! 🏆🏆🏆`);
            return true;
        }
        return false;
    }

    public sortHand_(hand: Pile) {
        // Custom Skat sorting:
        // In Suit/Grand: Jacks first (♣ > ♠ > ♥ > ♦), then by suit, within suit: A > 10 > K > Q > 9 > 8 > 7
        // In Null: simple suit-grouping, within suit: A > K > Q > J > 10 > 9 > 8 > 7
        (hand as any).cards_.sort((a: Card, b: Card) => {
            const isTrumpA = this.isCardTrump_(a);
            const isTrumpB = this.isCardTrump_(b);

            // Jacks always sorted first (even if Null game, let's keep them sorted nicely, but in Null let's just use Suit sorting)
            if (this.contractType !== "Null") {
                if (a.rank === Rank.Jack && b.rank !== Rank.Jack) return -1;
                if (a.rank !== Rank.Jack && b.rank === Rank.Jack) return 1;
                if (a.rank === Rank.Jack && b.rank === Rank.Jack) {
                    return this.getTrumpRankValue_(b) - this.getTrumpRankValue_(a); // Descending Jack ranking
                }

                if (isTrumpA && !isTrumpB) return -1;
                if (!isTrumpA && isTrumpB) return 1;

                if (isTrumpA && isTrumpB) {
                    return this.getTrumpRankValue_(b) - this.getTrumpRankValue_(a);
                }
            }

            // Suit grouping
            if (a.suit !== b.suit) {
                return a.suit - b.suit;
            }

            // Descending within suit
            return this.getNonTrumpRankValue_(b) - this.getNonTrumpRankValue_(a);
        });

        for (let i = 0; i < hand.length; ++i) {
            hand.at(i).onPileIndexChanged(i);
        }
        hand.cardsChanged();
    }

    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (this.waitingForHumanDiscard) {
            // In Skat, human discard is handled via custom submitHumanDiscard_ button or card clicking.
            // Let's toggle card inclusion in discard selection in the presenter.
            return;
        }
        if (this.isBiddingPhase || this.isContractSelectionPhase) return;
        yield* super.cardPrimary_(card);
    }

    public override serialize(): string {
        const baseJson = super.serialize();
        const state = {
            baseJson,
            dealerIndex: this.dealerIndex,
            isBiddingPhase: this.isBiddingPhase,
            biddingStage: this.biddingStage,
            activeBidderIndex: this.activeBidderIndex,
            passiveBidderIndex: this.passiveBidderIndex,
            currentBid: this.currentBid,
            proposedBid: this.proposedBid,
            passedPlayers: this.passedPlayers,
            biddingState: this.biddingState,
            waitingForHumanBid: this.waitingForHumanBid,
            declarerIndex: this.declarerIndex,
            isSkatPickupPhase: this.isSkatPickupPhase,
            waitingForHumanDiscard: this.waitingForHumanDiscard,
            isContractSelectionPhase: this.isContractSelectionPhase,
            waitingForHumanContract: this.waitingForHumanContract,
            contractType: this.contractType,
            chosenTrumpSuit: this.chosenTrumpSuit,
            isHandGame: this.isHandGame,
            announcement: this.announcement,
            roundTricksCount: this.roundTricksCount,
            roundCardPoints: this.roundCardPoints,
            declarerWinPoints: this.declarerWinPoints
        };
        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            if (!state || typeof state.baseJson !== "string") return false;

            const baseSuccess = super.deserialize(state.baseJson);
            if (!baseSuccess) return false;

            this.dealerIndex = state.dealerIndex ?? 0;
            this.isBiddingPhase = state.isBiddingPhase ?? false;
            this.biddingStage = state.biddingStage ?? 0;
            this.activeBidderIndex = state.activeBidderIndex ?? 0;
            this.passiveBidderIndex = state.passiveBidderIndex ?? 0;
            this.currentBid = state.currentBid ?? 0;
            this.proposedBid = state.proposedBid ?? 0;
            this.passedPlayers = state.passedPlayers || [false, false, false];
            this.biddingState = state.biddingState || "active_to_propose";
            this.waitingForHumanBid = state.waitingForHumanBid ?? false;
            this.declarerIndex = state.declarerIndex ?? -1;
            this.isSkatPickupPhase = state.isSkatPickupPhase ?? false;
            this.waitingForHumanDiscard = state.waitingForHumanDiscard ?? false;
            this.isContractSelectionPhase = state.isContractSelectionPhase ?? false;
            this.waitingForHumanContract = state.waitingForHumanContract ?? false;
            this.contractType = state.contractType || "Suit";
            this.chosenTrumpSuit = state.chosenTrumpSuit ?? Suit.None;
            this.isHandGame = state.isHandGame ?? false;
            this.announcement = state.announcement || "None";
            this.roundTricksCount = state.roundTricksCount || [0, 0, 0];
            this.roundCardPoints = state.roundCardPoints || [0, 0, 0];
            this.declarerWinPoints = state.declarerWinPoints ?? 0;

            // Setup generator depending on phase
            if (this.isBiddingPhase) {
                this.turnLoopGenerator = this.runBiddingPhase_();
            } else if (this.isSkatPickupPhase) {
                this.turnLoopGenerator = this.startDeclarerPhase_();
            } else if (this.isContractSelectionPhase) {
                this.turnLoopGenerator = this.startContractSelection_();
            } else {
                this.turnLoopGenerator = this.runTurnLoop_();
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize Skat state", error);
            return false;
        }
    }
}
