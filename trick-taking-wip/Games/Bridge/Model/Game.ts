import { TrickTakingGameBase } from "~CardLib/Model/TrickTakingGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { ScoreTracker } from "~CardLib/Model/ScoreTracker";
import { IGame, BridgeBid } from "./IGame";
import { Card } from "~CardLib/Model/Card";
import { Pile } from "~CardLib/Model/Pile";
import { IPlayer } from "~CardLib/Model/IPlayer";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { Rank } from "~CardLib/Model/Rank";
import prand from "pure-rand";

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    // Bridge Bidding phase states
    public isBiddingPhase = false;
    public waitingForHumanBid = false;
    public biddingPlayerIndex = 0;
    public dealerIndex = 0;
    public bids: BridgeBid[] = [];
    public contract: BridgeBid | null = null;
    public isDoubled = false;
    public isRedoubled = false;
    public consecutivePassesCount = 0;

    // Declarer / Dummy / Seating Info
    public declarerIndex = -1;
    public dummyIndex = -1;
    public dummyRevealed = false;

    // Scores
    public belowTheLineScore = { TeamA: 0, TeamB: 0 };
    public aboveTheLineScore = { TeamA: 0, TeamB: 0 };
    public gamesWon = { TeamA: 0, TeamB: 0 };

    // Track original hands for honors scoring
    private originalHands: Card[][] = [[], [], [], []];

    public override get winningScore(): number {
        return 1000; // Rubber target score or custom, but won condition is based on rubber games
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
        return Suit.None; // Will be set by bidding phase
    }

    protected override *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = [0, 0, 0, 0];
        this.sittingOutThisTrick = [false, false, false, false];
        this.dummyRevealed = false;

        // Clear played piles
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

        // Sort human hand
        for (let i = 0; i < 4; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Save original hands for honors scoring
        for (let i = 0; i < 4; ++i) {
            this.originalHands[i] = [...this.handPiles[i]];
        }

        // Determine dealer
        if (this.roundNumber === 1) {
            this.dealerIndex = Math.floor(Math.random() * 4);
        } else {
            this.dealerIndex = (this.dealerIndex + 1) % 4;
        }

        // Bidding setup
        this.isBiddingPhase = true;
        this.waitingForHumanBid = false;
        this.bids = [];
        this.contract = null;
        this.isDoubled = false;
        this.isRedoubled = false;
        this.consecutivePassesCount = 0;
        this.biddingPlayerIndex = (this.dealerIndex + 1) % 4;
        this.declarerIndex = -1;
        this.dummyIndex = -1;

        this.gameLog.push(`--- Bidding Round begins! Dealer is ${this.players[this.dealerIndex].name} ---`);

        yield* this.runBiddingPhase_();
    }

    public *runBiddingPhase_(): Generator<DelayHint, void> {
        while (this.isBiddingPhase) {
            const player = this.players[this.biddingPlayerIndex];
            if (player.isHuman) {
                this.waitingForHumanBid = true;
                return; // Pause, wait for submitHumanBid_
            } else {
                yield DelayHint.OneByOne;
                const bid = this.evaluateAIBid_(this.biddingPlayerIndex);
                yield* this.processBid_(bid);
            }
        }
    }

    public *submitHumanBid_(bid: Omit<BridgeBid, "bidderIndex">): Generator<DelayHint, void> {
        if (!this.isBiddingPhase || !this.waitingForHumanBid) return;

        const humanIndex = this.players.findIndex(p => p.isHuman);
        const fullBid: BridgeBid = {
            ...bid,
            bidderIndex: humanIndex
        };

        this.waitingForHumanBid = false;
        yield* this.processBid_(fullBid);

        if (this.isBiddingPhase) {
            yield* this.runBiddingPhase_();
        }
    }

    private strainValue(strain: Suit | "no-trump"): number {
        if (strain === "no-trump") return 5;
        if (strain === Suit.Spades) return 4;
        if (strain === Suit.Hearts) return 3;
        if (strain === Suit.Diamonds) return 2;
        if (strain === Suit.Clubs) return 1;
        return 0;
    }

    public compareBids(b1: BridgeBid, b2: BridgeBid): number {
        if (b1.level > b2.level) return 1;
        if (b1.level < b2.level) return -1;
        const v1 = this.strainValue(b1.suit);
        const v2 = this.strainValue(b2.suit);
        if (v1 > v2) return 1;
        if (v1 < v2) return -1;
        return 0;
    }

    public getLastNonPassBid(): BridgeBid | null {
        for (let i = this.bids.length - 1; i >= 0; i--) {
            if (this.bids[i].level > 0) {
                return this.bids[i];
            }
        }
        return null;
    }

    public getLastNonPassCall(): BridgeBid | null {
        for (let i = this.bids.length - 1; i >= 0; i--) {
            if (!this.bids[i].isPass) {
                return this.bids[i];
            }
        }
        return null;
    }

    public canDouble(playerIdx: number): boolean {
        const lastBid = this.getLastNonPassBid();
        if (!lastBid) return false;

        const lastBidderIndex = lastBid.bidderIndex;
        const playerTeam = this.players[playerIdx].teamId;
        const lastBidderTeam = this.players[lastBidderIndex].teamId;

        // Must be made by opponent
        if (playerTeam === lastBidderTeam) return false;

        const lastCall = this.getLastNonPassCall();
        if (!lastCall) return false;

        // Must not be already doubled or redoubled
        return lastCall.level > 0;
    }

    public canRedouble(playerIdx: number): boolean {
        const lastBid = this.getLastNonPassBid();
        if (!lastBid) return false;

        const lastBidderIndex = lastBid.bidderIndex;
        const playerTeam = this.players[playerIdx].teamId;
        const lastBidderTeam = this.players[lastBidderIndex].teamId;

        // Must be made by partner/self
        if (playerTeam !== lastBidderTeam) return false;

        const lastCall = this.getLastNonPassCall();
        if (!lastCall) return false;

        // Last call must be Double by opponent
        return lastCall.isDouble;
    }

    public *processBid_(bid: BridgeBid): Generator<DelayHint, void> {
        const player = this.players[bid.bidderIndex];

        // Safety fallback check to prevent illegal bids from AI
        if (bid.level > 0) {
            const lastBid = this.getLastNonPassBid();
            if (lastBid && this.compareBids(bid, lastBid) <= 0) {
                console.error(`AI generated illegal bid! Proposed: ${bid.level} ${bid.suit}. Last was: ${lastBid.level} ${lastBid.suit}. Changing to PASS.`);
                this.gameLog.push(`[Bug] AI offered illegal bid, corrected to PASS.`);
                bid.level = 0;
                bid.suit = Suit.None;
                bid.isPass = true;
                bid.isDouble = false;
                bid.isRedouble = false;
            }
        }

        // Validate legality of Double/Redouble
        if (bid.isDouble && !this.canDouble(bid.bidderIndex)) {
            bid.isDouble = false;
            bid.isPass = true;
        }
        if (bid.isRedouble && !this.canRedouble(bid.bidderIndex)) {
            bid.isRedouble = false;
            bid.isPass = true;
        }

        this.bids.push(bid);

        if (bid.isPass) {
            this.gameLog.push(`${player.name} passed.`);
            this.consecutivePassesCount++;
        } else if (bid.isDouble) {
            this.gameLog.push(`${player.name} DOUBLED!`);
            this.isDoubled = true;
            this.isRedoubled = false;
            this.consecutivePassesCount = 0;
        } else if (bid.isRedouble) {
            this.gameLog.push(`${player.name} REDOUBLED!!`);
            this.isRedoubled = true;
            this.isDoubled = false;
            this.consecutivePassesCount = 0;
        } else {
            const suitSymbols = {
                [Suit.Spades]: "♠",
                [Suit.Hearts]: "♥",
                [Suit.Diamonds]: "♦",
                [Suit.Clubs]: "♣",
                "no-trump": "NT",
            };
            const strainStr = typeof bid.suit === "string" ? "NT" : (suitSymbols[bid.suit] || "");
            this.gameLog.push(`${player.name} bids ${bid.level}${strainStr}`);
            this.contract = bid;
            this.isDoubled = false;
            this.isRedoubled = false;
            this.consecutivePassesCount = 0;
        }

        // Check bidding end condition
        const lastNonPass = this.getLastNonPassBid();
        if (lastNonPass) {
            if (this.consecutivePassesCount === 3) {
                // Bidding ended successfully!
                this.isBiddingPhase = false;
                yield* this.startPlayPhase_();
                return;
            }
        } else {
            if (this.consecutivePassesCount === 4) {
                // Passed out! Redeal.
                this.gameLog.push(`All 4 players passed! Board passed out. Redealing...`);
                yield DelayHint.Settle;
                yield* this.startNewRound_(prand.mersenne(Date.now()));
                return;
            }
        }

        this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;
    }

    public evaluateAIBid_(playerIdx: number): BridgeBid {
        const hand = this.handPiles[playerIdx];

        // 1. HCP calculation
        let hcp = 0;
        for (const card of hand) {
            if (card.rank === Rank.Ace) hcp += 4;
            else if (card.rank === Rank.King) hcp += 3;
            else if (card.rank === Rank.Queen) hcp += 2;
            else if (card.rank === Rank.Jack) hcp += 1;
        }

        // 2. Count suit distributions
        const suitCounts = {
            [Suit.Spades]: 0,
            [Suit.Hearts]: 0,
            [Suit.Diamonds]: 0,
            [Suit.Clubs]: 0,
        };
        for (const card of hand) {
            if (card.suit !== Suit.None) {
                suitCounts[card.suit]++;
            }
        }

        // Balanced hand check
        let isBalanced = true;
        let doubletonsCount = 0;
        for (const s of [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs]) {
            const count = suitCounts[s];
            if (count === 0 || count === 1) {
                isBalanced = false;
            }
            if (count === 2) {
                doubletonsCount++;
            }
        }
        if (doubletonsCount > 1) {
            isBalanced = false;
        }

        const lastBid = this.getLastNonPassBid();

        // 3. Partner Opening check
        const partnerIdx = (playerIdx + 2) % 4;
        let partnerOpened = false;
        let partnerBid: BridgeBid | null = null;
        for (const b of this.bids) {
            if (b.bidderIndex === partnerIdx && b.level > 0) {
                partnerOpened = true;
                partnerBid = b;
                break;
            }
        }

        const defaultPass: BridgeBid = { level: 0, suit: Suit.None, isPass: true, isDouble: false, isRedouble: false, bidderIndex: playerIdx };

        // 4. Bidding Logic
        if (!lastBid) {
            // Nobody has opened yet
            if (hcp >= 12) {
                if (isBalanced && hcp >= 15 && hcp <= 17) {
                    return { level: 1, suit: "no-trump", isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                }
                // Open longest suit
                let bestSuit: Suit = Suit.Spades;
                let maxLen = -1;
                for (const s of [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs]) {
                    if (suitCounts[s] > maxLen) {
                        maxLen = suitCounts[s];
                        bestSuit = s;
                    }
                }
                return { level: 1, suit: bestSuit, isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
            }
        } else {
            // Someone has opened
            if (partnerOpened && partnerBid) {
                // Support partner
                const pSuit = partnerBid.suit;
                const pLevel = partnerBid.level;

                if (pSuit !== "no-trump") {
                    const pSuitTyped = pSuit as Suit;
                    const support = suitCounts[pSuitTyped] || 0;
                    if (support >= 3) {
                        if (hcp >= 6 && hcp <= 9) {
                            const candidate: BridgeBid = { level: pLevel + 1, suit: pSuit, isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                            if (this.compareBids(candidate, lastBid) > 0) return candidate;
                        } else if (hcp >= 10 && hcp <= 12) {
                            const candidate: BridgeBid = { level: pLevel + 2, suit: pSuit, isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                            if (this.compareBids(candidate, lastBid) > 0) return candidate;
                        }
                    }
                }

                // New suit response
                if (hcp >= 6) {
                    let bestSuit: Suit = Suit.Spades;
                    let maxLen = -1;
                    for (const s of [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs]) {
                        if (s !== pSuit && suitCounts[s] >= 4 && suitCounts[s] > maxLen) {
                            maxLen = suitCounts[s];
                            bestSuit = s;
                        }
                    }
                    if (maxLen >= 4) {
                        const nextLevel = hcp >= 10 ? lastBid.level + 1 : lastBid.level;
                        const candidate1: BridgeBid = { level: lastBid.level, suit: bestSuit, isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                        if (this.compareBids(candidate1, lastBid) > 0) return candidate1;
                        const candidate2: BridgeBid = { level: lastBid.level + 1, suit: bestSuit, isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                        if (this.compareBids(candidate2, lastBid) > 0) return candidate2;
                    }
                }

                // Balanced raise
                if (hcp >= 6 && hcp <= 9 && isBalanced) {
                    const candidate1: BridgeBid = { level: lastBid.level, suit: "no-trump", isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                    if (this.compareBids(candidate1, lastBid) > 0) return candidate1;
                    const candidate2: BridgeBid = { level: lastBid.level + 1, suit: "no-trump", isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                    if (this.compareBids(candidate2, lastBid) > 0) return candidate2;
                }
            } else {
                // Opponent opened, we can overcall if we have strong hand
                if (hcp >= 10) {
                    let bestSuit: Suit = Suit.Spades;
                    let maxLen = -1;
                    for (const s of [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs]) {
                        if (suitCounts[s] >= 5 && suitCounts[s] > maxLen) {
                            maxLen = suitCounts[s];
                            bestSuit = s;
                        }
                    }
                    if (maxLen >= 5) {
                        const candidate1: BridgeBid = { level: lastBid.level, suit: bestSuit, isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                        if (this.compareBids(candidate1, lastBid) > 0) return candidate1;
                        const candidate2: BridgeBid = { level: lastBid.level + 1, suit: bestSuit, isPass: false, isDouble: false, isRedouble: false, bidderIndex: playerIdx };
                        if (this.compareBids(candidate2, lastBid) > 0) return candidate2;
                    }
                }
            }
        }

        // If no bid found or illegal, default to pass
        return defaultPass;
    }

    public *startPlayPhase_(): Generator<DelayHint, void> {
        this.isBiddingPhase = false;
        this.waitingForHumanBid = false;

        const lastBid = this.getLastNonPassBid()!;
        const winningTeam = this.players[lastBid.bidderIndex].teamId;

        // Find the FIRST player of winning side to bid this strain
        let firstStrainBidderIdx = lastBid.bidderIndex;
        for (const b of this.bids) {
            if (b.level > 0 && b.suit === lastBid.suit) {
                const bidderTeam = this.players[b.bidderIndex].teamId;
                if (bidderTeam === winningTeam) {
                    firstStrainBidderIdx = b.bidderIndex;
                    break;
                }
            }
        }

        this.declarerIndex = firstStrainBidderIdx;
        this.dummyIndex = (this.declarerIndex + 2) % 4;
        this.dummyRevealed = false;

        this.trumpSuit = lastBid.suit === "no-trump" ? Suit.None : lastBid.suit;

        const suitNames = {
            [Suit.Spades]: "Spades",
            [Suit.Hearts]: "Hearts",
            [Suit.Diamonds]: "Diamonds",
            [Suit.Clubs]: "Clubs",
        };
        const contractStr = `${lastBid.level} ${lastBid.suit === "no-trump" ? "NT" : suitNames[lastBid.suit]}`;
        const suffix = this.isRedoubled ? " Redoubled" : (this.isDoubled ? " Doubled" : "");
        this.gameLog.push(`--- Contract: ${contractStr}${suffix} ---`);
        this.gameLog.push(`Declarer: ${this.players[this.declarerIndex].name}. Dummy: ${this.players[this.dummyIndex].name}.`);

        // Sort human hand again to be sure
        for (let i = 0; i < 4; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Hide dummy hand from players initially
        for (const card of this.handPiles[this.dummyIndex]) {
            card.doSetFaceUp(false);
        }

        // Player to declarer's left makes opening lead
        const openingLeader = (this.declarerIndex + 1) % 4;
        this.currentLeaderIndex = openingLeader;
        this.activePlayerIndex = openingLeader;
        this.waitingForHumanPlay = false;

        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];

        if (this.currentTrick.length === 0) {
            return [...hand];
        }

        // Follow suit if able
        const leadSuit = this.currentTrick[0].card.suit;
        const matchingCards = [...hand].filter(c => c.suit === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
    }

    protected override *playCard_(card: Card, player: IPlayer): Generator<DelayHint, void> {
        yield* super.playCard_(card, player);

        // Turn Dummy hand face up immediately after the opening lead (1st card of the 1st trick of the round)
        if (this.contract !== null && !this.dummyRevealed && this.currentTrick.length === 1) {
            this.dummyRevealed = true;
            this.gameLog.push(`Opening lead played. ${this.players[this.dummyIndex].name}'s hand is revealed as Dummy!`);
            for (const c of this.handPiles[this.dummyIndex]) {
                c.doSetFaceUp(true);
            }
            yield DelayHint.Quick;
        }
    }

    protected override *runTurnLoop_(): Generator<DelayHint, void> {
        while (!this.won) {
            const expectedTrickSize = 4;
            while (this.currentTrick.length < expectedTrickSize) {
                const currentPlayer = this.players[this.activePlayerIndex];
                const isDummyTurn = (this.activePlayerIndex === this.dummyIndex);
                const humanIsDeclarer = (this.declarerIndex === 0);

                if (currentPlayer.isHuman && !isDummyTurn) {
                    // South plays South cards
                    this.waitingForHumanPlay = true;
                    return;
                } else if (isDummyTurn && humanIsDeclarer) {
                    // South plays Dummy (North) cards
                    this.waitingForHumanPlay = true;
                    return;
                } else {
                    // AI Turn
                    yield DelayHint.OneByOne;
                    // Declarer plays dummy, or defenders play their own
                    const cardPlayed = this.chooseAIPlay_(currentPlayer);
                    yield* this.playCard_(cardPlayed, currentPlayer);
                }
            }

            // Trick completed! Evaluate winner
            yield DelayHint.Settle;
            yield* this.evaluateTrickWinner_();

            // Check round end
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
        }
    }

    protected override chooseAIPlay_(player: IPlayer): Card {
        // If it is Dummy's turn, Declarer chooses the card.
        const playerIndex = this.players.indexOf(player);
        const actualChooserIndex = (playerIndex === this.dummyIndex) ? this.declarerIndex : playerIndex;

        const hand = this.handPiles[playerIndex];
        const legalCards = this.getLegalCards_(hand);

        if (legalCards.length === 0) {
            throw new Error(`Player ${player.name} has no cards in hand!`);
        }

        const leadCard = this.currentTrick[0]?.card;
        const leadSuit = leadCard ? leadCard.suit : Suit.None;

        if (this.currentTrick.length === 0) {
            // Lead the highest card of our longest suit
            return this.getHighestCard_(legalCards, Suit.None);
        }

        // Not leading
        let bestTrickPlay = this.currentTrick[0];
        for (let i = 1; i < this.currentTrick.length; ++i) {
            const p = this.currentTrick[i];
            if (this.compareCards_(p.card, bestTrickPlay.card, leadSuit) > 0) {
                bestTrickPlay = p;
            }
        }

        const chooserTeam = this.players[actualChooserIndex].teamId;
        const currentlyWinningTeam = chooserTeam; // simplification for basic AI: check if partner is winning
        const partnerIndex = (actualChooserIndex + 2) % 4;
        const partnerPlayed = this.currentTrick.find(t => t.player === this.players[partnerIndex])?.card;

        const partnerIsCurrentlyWinning = partnerPlayed && (bestTrickPlay.card === partnerPlayed);

        if (partnerIsCurrentlyWinning) {
            // Partner wins, throw lowest card to duck
            return this.getLowestCard_(legalCards);
        }

        // Try to win with lowest possible winning card, else play lowest card
        const winningCards = legalCards.filter(c => this.compareCards_(c, bestTrickPlay.card, leadSuit) > 0);
        if (winningCards.length > 0) {
            return this.getLowestCard_(winningCards);
        }

        return this.getLowestCard_(legalCards);
    }

    protected override *evaluateTrickWinner_(): Generator<DelayHint, void> {
        if (this.currentTrick.length < 4) return;

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

        this.currentLeaderIndex = winnerIndex;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.currentTrick = [];
    }

    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (!this.waitingForHumanPlay) return;

        const isDummyTurn = (this.activePlayerIndex === this.dummyIndex);
        const handIndex = isDummyTurn ? this.dummyIndex : 0;
        const hand = this.handPiles[handIndex];

        if (card.pile !== hand) return;

        const legalCards = this.getLegalCards_(hand);
        if (!legalCards.includes(card)) {
            return;
        }

        yield* this.playCard_(card, this.players[handIndex]);
        this.waitingForHumanPlay = false;

        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    protected override evaluateRoundScores_(): void {
        const lastBid = this.contract;
        if (!lastBid) {
            console.log("No contract found!");
            return;
        }

        const L = lastBid.level;
        const contractSuit = lastBid.suit;
        const declTeam = this.players[this.declarerIndex]?.teamId ?? "TeamA";
        const defTeam = declTeam === "TeamA" ? "TeamB" : "TeamA";

        // Count declarer partnership tricks (using tricks for the team since ScoreTracker is in team mode)
        const tricksMade = this.scoreTracker.getTricksByKey(declTeam);

        const contractTarget = L + 6;
        const isVul = (declTeam === "TeamA" ? this.gamesWon.TeamA >= 1 : this.gamesWon.TeamB >= 1);

        this.gameLog.push(`--- Round Ended. Contract: ${L} of ${contractSuit === "no-trump" ? "NT" : contractSuit}. Tricks Made: ${tricksMade} ---`);

        if (tricksMade >= contractTarget) {
            // CONTRACT MADE
            // 1. Trick points below the line
            let baseTrickPoints = 0;
            if (contractSuit === "no-trump") {
                baseTrickPoints = 40 + 30 * (L - 1);
            } else if (contractSuit === Suit.Spades || contractSuit === Suit.Hearts) {
                baseTrickPoints = 30 * L;
            } else {
                baseTrickPoints = 20 * L;
            }

            let multiplier = 1;
            if (this.isRedoubled) multiplier = 4;
            else if (this.isDoubled) multiplier = 2;

            const trickPoints = baseTrickPoints * multiplier;
            this.belowTheLineScore[declTeam] += trickPoints;

            this.gameLog.push(`Contract made! ${trickPoints} points scored BELOW THE LINE.`);

            // 2. Overtricks above the line
            const overtricks = tricksMade - contractTarget;
            if (overtricks > 0) {
                let overtrickPoints = 0;
                if (this.isRedoubled) {
                    overtrickPoints = (isVul ? 400 : 200) * overtricks;
                } else if (this.isDoubled) {
                    overtrickPoints = (isVul ? 200 : 100) * overtricks;
                } else {
                    if (contractSuit === "no-trump" || contractSuit === Suit.Spades || contractSuit === Suit.Hearts) {
                        overtrickPoints = 30 * overtricks;
                    } else {
                        overtrickPoints = 20 * overtricks;
                    }
                }
                this.aboveTheLineScore[declTeam] += overtrickPoints;
                this.gameLog.push(`Declarer made ${overtricks} overtrick(s): +${overtrickPoints} points above the line.`);
            }

            // 3. Insult bonus
            if (this.isRedoubled) {
                this.aboveTheLineScore[declTeam] += 100;
                this.gameLog.push(`Redouble insult bonus: +100 above the line.`);
            } else if (this.isDoubled) {
                this.aboveTheLineScore[declTeam] += 50;
                this.gameLog.push(`Double insult bonus: +50 above the line.`);
            }

            // 4. Slam bonus
            if (L === 6) {
                const slamBonus = isVul ? 750 : 500;
                this.aboveTheLineScore[declTeam] += slamBonus;
                this.gameLog.push(`SMALL SLAM bid and made! +${slamBonus} above the line.`);
            } else if (L === 7) {
                const slamBonus = isVul ? 1500 : 1000;
                this.aboveTheLineScore[declTeam] += slamBonus;
                this.gameLog.push(`GRAND SLAM bid and made!! +${slamBonus} above the line.`);
            }
        } else {
            // CONTRACT FAILED (Undertricks)
            const undertricks = contractTarget - tricksMade;
            let undertrickPenalty = 0;

            if (this.isRedoubled) {
                if (isVul) {
                    undertrickPenalty = 400 + 600 * (undertricks - 1);
                } else {
                    if (undertricks === 1) undertrickPenalty = 200;
                    else if (undertricks === 2) undertrickPenalty = 600;
                    else if (undertricks === 3) undertrickPenalty = 1000;
                    else undertrickPenalty = 1000 + 600 * (undertricks - 3);
                }
            } else if (this.isDoubled) {
                if (isVul) {
                    undertrickPenalty = 200 + 300 * (undertricks - 1);
                } else {
                    if (undertricks === 1) undertrickPenalty = 100;
                    else if (undertricks === 2) undertrickPenalty = 300;
                    else if (undertricks === 3) undertrickPenalty = 500;
                    else undertrickPenalty = 500 + 300 * (undertricks - 3);
                }
            } else {
                undertrickPenalty = (isVul ? 100 : 50) * undertricks;
            }

            this.aboveTheLineScore[defTeam] += undertrickPenalty;
            this.gameLog.push(`Contract failed by ${undertricks} trick(s). Defenders score +${undertrickPenalty} ABOVE THE LINE.`);
        }

        // 5. Honors Bonus check
        for (let i = 0; i < 4; ++i) {
            const originalHand = this.originalHands[i];
            const pTeam = this.players[i].teamId;

            if (contractSuit === "no-trump") {
                // Holding all 4 Aces
                const acesCount = originalHand.filter(c => c.rank === Rank.Ace).length;
                if (acesCount === 4) {
                    this.aboveTheLineScore[pTeam] += 150;
                    this.gameLog.push(`${this.players[i].name} held all 4 Aces! +150 honors bonus.`);
                }
            } else {
                // Trump suit honors: Ace, King, Queen, Jack, Ten of trump
                const honorsCount = originalHand.filter(c => c.suit === contractSuit &&
                    [Rank.Ace, Rank.King, Rank.Queen, Rank.Jack, Rank.Ten].includes(c.rank)).length;
                if (honorsCount === 4) {
                    this.aboveTheLineScore[pTeam] += 100;
                    this.gameLog.push(`${this.players[i].name} held 4 of 5 trump honors! +100 honors bonus.`);
                } else if (honorsCount === 5) {
                    this.aboveTheLineScore[pTeam] += 150;
                    this.gameLog.push(`${this.players[i].name} held all 5 trump honors! +150 honors bonus.`);
                }
            }
        }

        // 6. Game Check
        if (this.belowTheLineScore.TeamA >= 100) {
            this.gamesWon.TeamA++;
            this.gameLog.push(`🏆 Team A (You) wins a game! (${this.gamesWon.TeamA}/2)`);
            this.belowTheLineScore.TeamA = 0;
            this.belowTheLineScore.TeamB = 0;
        }
        if (this.belowTheLineScore.TeamB >= 100) {
            this.gamesWon.TeamB++;
            this.gameLog.push(`🏆 Team B (Opponents) wins a game! (${this.gamesWon.TeamB}/2)`);
            this.belowTheLineScore.TeamA = 0;
            this.belowTheLineScore.TeamB = 0;
        }

        // 7. Rubber Check
        if (this.gamesWon.TeamA === 2) {
            const rubberBonus = this.gamesWon.TeamB === 0 ? 700 : 500;
            this.aboveTheLineScore.TeamA += rubberBonus;
            this.gameLog.push(`🏆🏆 Team A wins the rubber 2-${this.gamesWon.TeamB}! Rubber bonus: +${rubberBonus}. Match complete.`);
            this.won = true;
        } else if (this.gamesWon.TeamB === 2) {
            const rubberBonus = this.gamesWon.TeamA === 0 ? 700 : 500;
            this.aboveTheLineScore.TeamB += rubberBonus;
            this.gameLog.push(`🏆🏆 Team B wins the rubber 2-${this.gamesWon.TeamA}! Rubber bonus: +${rubberBonus}. Match complete.`);
            this.won = true;
        }

        // Sync total scores to ScoreTracker (for UI display and final comparisons)
        const totalA = this.belowTheLineScore.TeamA + this.aboveTheLineScore.TeamA;
        const totalB = this.belowTheLineScore.TeamB + this.aboveTheLineScore.TeamB;

        this.scoreTracker.setScoreByKey("TeamA", totalA);
        this.scoreTracker.setScoreByKey("TeamB", totalB);

        this.gameLog.push(`Scores - Team A: ${totalA} (Above: ${this.aboveTheLineScore.TeamA}, Below: ${this.belowTheLineScore.TeamA}, Games: ${this.gamesWon.TeamA})`);
        this.gameLog.push(`Scores - Team B: ${totalB} (Above: ${this.aboveTheLineScore.TeamB}, Below: ${this.belowTheLineScore.TeamB}, Games: ${this.gamesWon.TeamB})`);
    }

    protected override checkGameWon_(): boolean {
        return this.won;
    }

    public override serialize(): string {
        const baseJson = super.serialize();
        const state = JSON.parse(baseJson);

        state.isBiddingPhase = this.isBiddingPhase;
        state.waitingForHumanBid = this.waitingForHumanBid;
        state.biddingPlayerIndex = this.biddingPlayerIndex;
        state.dealerIndex = this.dealerIndex;
        state.bids = this.bids;
        state.contract = this.contract;
        state.isDoubled = this.isDoubled;
        state.isRedoubled = this.isRedoubled;
        state.consecutivePassesCount = this.consecutivePassesCount;
        state.declarerIndex = this.declarerIndex;
        state.dummyIndex = this.dummyIndex;
        state.dummyRevealed = this.dummyRevealed;
        state.belowTheLineScore = this.belowTheLineScore;
        state.aboveTheLineScore = this.aboveTheLineScore;
        state.gamesWon = this.gamesWon;

        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            if (!state || typeof state.baseJson !== "string") return false;

            const baseSuccess = super.deserialize(json);
            if (!baseSuccess) return false;

            this.isBiddingPhase = state.isBiddingPhase ?? false;
            this.waitingForHumanBid = state.waitingForHumanBid ?? false;
            this.biddingPlayerIndex = state.biddingPlayerIndex ?? 0;
            this.dealerIndex = state.dealerIndex ?? 0;
            this.bids = state.bids ?? [];
            this.contract = state.contract ?? null;
            this.isDoubled = state.isDoubled ?? false;
            this.isRedoubled = state.isRedoubled ?? false;
            this.consecutivePassesCount = state.consecutivePassesCount ?? 0;
            this.declarerIndex = state.declarerIndex ?? -1;
            this.dummyIndex = state.dummyIndex ?? -1;
            this.dummyRevealed = state.dummyRevealed ?? false;
            this.belowTheLineScore = state.belowTheLineScore ?? { TeamA: 0, TeamB: 0 };
            this.aboveTheLineScore = state.aboveTheLineScore ?? { TeamA: 0, TeamB: 0 };
            this.gamesWon = state.gamesWon ?? { TeamA: 0, TeamB: 0 };

            if (this.isBiddingPhase) {
                this.turnLoopGenerator = this.runBiddingPhase_();
            } else {
                this.turnLoopGenerator = this.runTurnLoop_();
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize Bridge state", error);
            return false;
        }
    }
}
