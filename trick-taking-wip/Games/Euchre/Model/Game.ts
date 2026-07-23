import { TrickTakingGameBase } from "~CardLib/Model/TrickTakingGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { ScoreTracker } from "~CardLib/Model/ScoreTracker";
import { IGame, EuchreBid } from "./IGame";
import { Card } from "~CardLib/Model/Card";
import { Pile } from "~CardLib/Model/Pile";
import { IPlayer } from "~CardLib/Model/IPlayer";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { Rank } from "~CardLib/Model/Rank";
import { Colour } from "~CardLib/Model/Colour";
import prand from "pure-rand";

export function getSameColorSuit(suit: Suit): Suit {
    if (suit === Suit.Spades) return Suit.Clubs;
    if (suit === Suit.Clubs) return Suit.Spades;
    if (suit === Suit.Hearts) return Suit.Diamonds;
    if (suit === Suit.Diamonds) return Suit.Hearts;
    return Suit.None;
}

export function getEffectiveSuit(card: Card, trump: Suit): Suit {
    if (trump !== Suit.None && card.rank === Rank.Jack) {
        if (card.suit === trump) {
            return trump;
        }
        if (card.suit === getSameColorSuit(trump)) {
            return trump;
        }
    }
    return card.suit;
}

export function getTrumpValue(card: Card, trump: Suit): number {
    if (card.rank === Rank.Jack) {
        if (card.suit === trump) return 100; // Right Bower
        if (card.suit === getSameColorSuit(trump)) return 99; // Left Bower
    }
    if (card.rank === Rank.Ace) return 14;
    if (card.rank === Rank.King) return 13;
    if (card.rank === Rank.Queen) return 12;
    if (card.rank === Rank.Ten) return 10;
    if (card.rank === Rank.Nine) return 9;
    return 0;
}

export function getNonTrumpValue(card: Card): number {
    if (card.rank === Rank.Ace) return 14;
    if (card.rank === Rank.King) return 13;
    if (card.rank === Rank.Queen) return 12;
    if (card.rank === Rank.Jack) return 11;
    if (card.rank === Rank.Ten) return 10;
    if (card.rank === Rank.Nine) return 9;
    return 0;
}

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    // Bidding/negotiation states
    public isBiddingPhase = false;
    public biddingRound = 1;
    public biddingPlayerIndex = 0;
    public dealerIndex = 0;
    public proposedTrumpCard: Card | null = null;
    public waitingForHumanBid = false;
    public waitingForHumanDiscard = false;

    // Maker and alone tracking
    public makerPlayerIndex = -1;
    public alonePlayerIndex = -1;

    public override get winningScore(): number {
        return 10;
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

        // Filter standard 52 deck down to 24 Euchre cards
        const allowedRanks = [Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace];
        const cardsArray = (this.deckPile as any).cards_ as Card[];
        const euchreCardsArray = cardsArray.filter(c => allowedRanks.includes(c.rank));

        // Re-assign the deckPile's underlying cards array
        cardsArray.length = 0;
        for (let i = 0; i < euchreCardsArray.length; ++i) {
            const card = euchreCardsArray[i];
            cardsArray.push(card);
            card.pileIndex = i;
        }

        this.cards = euchreCardsArray;
        this.deckPile.cardsChanged();
    }

    public override determineTrump_(round: number): Suit {
        return Suit.None;
    }

    protected override *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = [0, 0, 0, 0];
        this.sittingOutThisTrick = [false, false, false, false];

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

        // Deal 5 cards to each player
        for (let r = 0; r < 5; ++r) {
            for (let i = 0; i < 4; ++i) {
                const card = this.deckPile.peek();
                if (card) {
                    this.handPiles[i].push(card);
                    card.doSetFaceUp(this.players[i].isHuman);
                }
                yield DelayHint.Quick;
            }
        }

        // Proposed trump card is on top of deck
        this.proposedTrumpCard = this.deckPile.peek() ?? null;
        if (this.proposedTrumpCard) {
            this.proposedTrumpCard.doSetFaceUp(true);
        }

        this.trumpSuit = Suit.None;
        this.makerPlayerIndex = -1;
        this.alonePlayerIndex = -1;

        // Sort human player's hand:
        for (let i = 0; i < 4; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Determine dealer index
        if (this.roundNumber === 1) {
            this.dealerIndex = Math.floor(Math.random() * 4);
        } else {
            this.dealerIndex = (this.dealerIndex + 1) % 4;
        }

        // Bidding setup
        this.isBiddingPhase = true;
        this.biddingRound = 1;
        this.waitingForHumanBid = false;
        this.waitingForHumanDiscard = false;
        this.biddingPlayerIndex = (this.dealerIndex + 1) % 4;

        yield* this.runBiddingPhase_();
    }

    public *runBiddingPhase_(): Generator<DelayHint, void> {
        while (this.isBiddingPhase) {
            const player = this.players[this.biddingPlayerIndex];
            if (player.isHuman) {
                this.waitingForHumanBid = true;
                return; // Pause generator, wait for presenter to submit the bid
            } else {
                yield DelayHint.OneByOne;
                const bid = this.evaluateAIBid_(this.biddingPlayerIndex);
                yield* this.processBid_(bid);
            }
        }
    }

    public *processBid_(bid: EuchreBid): Generator<DelayHint, void> {
        const player = this.players[this.biddingPlayerIndex];

        if (this.biddingRound === 1) {
            if (bid.action === "order-up" || bid.action === "alone") {
                this.trumpSuit = this.proposedTrumpCard!.suit;
                this.makerPlayerIndex = this.biddingPlayerIndex;
                if (bid.action === "alone") {
                    this.alonePlayerIndex = this.biddingPlayerIndex;
                    this.gameLog.push(`${player.name} ordered it up and is GOING ALONE!`);
                } else {
                    this.gameLog.push(`${player.name} ordered up ${this.getCardName_(this.proposedTrumpCard!)}.`);
                }

                // Dealer picks up the proposed trump card
                const dealer = this.players[this.dealerIndex];
                this.handPiles[this.dealerIndex].push(this.proposedTrumpCard!);
                this.proposedTrumpCard!.doSetFaceUp(dealer.isHuman);

                this.isBiddingPhase = false;

                if (dealer.isHuman) {
                    this.waitingForHumanDiscard = true;
                    return; // Pause, waiting for human discard
                } else {
                    // AI dealer discards automatically
                    const discard = this.chooseAIDiscard_(this.dealerIndex);
                    this.deckPile.push(discard);
                    discard.doSetFaceUp(false);
                    yield* this.startPlayPhase_();
                }
            } else {
                // Pass
                this.gameLog.push(`${player.name} passed.`);
                this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;
                if (this.biddingPlayerIndex === (this.dealerIndex + 1) % 4) {
                    // All passed Round 1
                    this.gameLog.push("Everyone passed in Round 1. Proposed card turned down.");
                    if (this.proposedTrumpCard) {
                        this.proposedTrumpCard.doSetFaceUp(false);
                    }
                    this.biddingRound = 2;
                    this.biddingPlayerIndex = (this.dealerIndex + 1) % 4;
                }
            }
        } else {
            // Round 2
            if (bid.action === "name-suit" || bid.action === "alone") {
                const suit = bid.chosenSuit!;
                this.trumpSuit = suit;
                this.makerPlayerIndex = this.biddingPlayerIndex;
                if (bid.action === "alone") {
                    this.alonePlayerIndex = this.biddingPlayerIndex;
                    this.gameLog.push(`${player.name} named ${this.getSuitSymbol_(suit)} as trump and is GOING ALONE!`);
                } else {
                    this.gameLog.push(`${player.name} named ${this.getSuitSymbol_(suit)} as trump.`);
                }
                this.isBiddingPhase = false;
                yield* this.startPlayPhase_();
            } else {
                // Pass (Cannot pass if dealer is forced under Stick the Dealer)
                const isDealer = this.biddingPlayerIndex === this.dealerIndex;
                if (isDealer) {
                    // Stick the dealer! Force some other suit
                    const forbiddenSuit = this.proposedTrumpCard!.suit;
                    const possibleSuits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs].filter(s => s !== forbiddenSuit);
                    const chosenSuit = possibleSuits[0];
                    this.trumpSuit = chosenSuit;
                    this.makerPlayerIndex = this.biddingPlayerIndex;
                    this.gameLog.push(`${player.name} was STUCK and named ${this.getSuitSymbol_(chosenSuit)} as trump.`);
                    this.isBiddingPhase = false;
                    yield* this.startPlayPhase_();
                } else {
                    this.gameLog.push(`${player.name} passed.`);
                    this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;
                }
            }
        }
    }

    public *submitHumanBid_(bid: EuchreBid): Generator<DelayHint, void> {
        if (!this.isBiddingPhase || !this.waitingForHumanBid) return;

        this.waitingForHumanBid = false;
        yield* this.processBid_(bid);

        if (this.isBiddingPhase) {
            yield* this.runBiddingPhase_();
        }
    }

    public *submitHumanDiscard_(card: Card): Generator<DelayHint, void> {
        if (!this.waitingForHumanDiscard) return;

        const hand = this.handPiles[0];
        if (card.pile !== hand) return;

        this.deckPile.push(card);
        card.doSetFaceUp(false);

        this.waitingForHumanDiscard = false;
        this.gameLog.push(`You discarded ${this.getCardName_(card)}.`);

        yield* this.startPlayPhase_();
    }

    public *startPlayPhase_(): Generator<DelayHint, void> {
        this.isBiddingPhase = false;
        this.waitingForHumanBid = false;
        this.waitingForHumanDiscard = false;

        // Sort human hand
        for (let i = 0; i < 4; ++i) {
            if (this.players[i].isHuman) {
                this.handPiles[i].sort();
            }
        }

        // Going alone logic:
        if (this.alonePlayerIndex !== -1) {
            const partnerIndex = (this.alonePlayerIndex + 2) % 4;
            this.sittingOutThisTrick[partnerIndex] = true;
            this.skippedTricks[partnerIndex] = 100; // sit out entire round

            // Discard partner's hand
            const partnerHand = this.handPiles[partnerIndex];
            while (partnerHand.length > 0) {
                const card = partnerHand.peek();
                if (card) {
                    this.deckPile.push(card);
                    card.doSetFaceUp(false);
                }
            }
            this.gameLog.push(`${this.players[partnerIndex].name} is sitting out this round.`);
        }

        // Leader starts play (left of dealer)
        let leaderIdx = (this.dealerIndex + 1) % 4;
        while (this.sittingOutThisTrick[leaderIdx]) {
            leaderIdx = (leaderIdx + 1) % 4;
        }

        this.currentLeaderIndex = leaderIdx;
        this.activePlayerIndex = this.currentLeaderIndex;

        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    public evaluateAIBid_(playerIdx: number): EuchreBid {
        if (this.biddingRound === 1) {
            const proposedSuit = this.proposedTrumpCard!.suit;
            const score = this.getHandStrengthForSuit_(playerIdx, proposedSuit);

            if (score >= 7.0) {
                return { action: "alone" };
            } else if (score >= 4.0) {
                return { action: "order-up" };
            } else {
                return { action: "pass" };
            }
        } else {
            // Round 2
            const forbiddenSuit = this.proposedTrumpCard!.suit;
            const candidateSuits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs].filter(s => s !== forbiddenSuit);

            let bestSuit = candidateSuits[0];
            let bestScore = this.getHandStrengthForSuit_(playerIdx, bestSuit);

            for (let i = 1; i < candidateSuits.length; ++i) {
                const s = candidateSuits[i];
                const score = this.getHandStrengthForSuit_(playerIdx, s);
                if (score > bestScore) {
                    bestScore = score;
                    bestSuit = s;
                }
            }

            const isDealer = playerIdx === this.dealerIndex;

            if (bestScore >= 6.5) {
                return { action: "alone", chosenSuit: bestSuit };
            } else if (bestScore >= 3.5 || isDealer) {
                return { action: "name-suit", chosenSuit: bestSuit };
            } else {
                return { action: "pass" };
            }
        }
    }

    private getHandStrengthForSuit_(playerIdx: number, suit: Suit): number {
        const hand = this.handPiles[playerIdx];
        let score = 0;
        for (const card of hand) {
            const effSuit = getEffectiveSuit(card, suit);
            if (effSuit === suit) {
                if (card.rank === Rank.Jack) {
                    if (card.suit === suit) {
                        score += 3.0; // Right Bower
                    } else {
                        score += 2.5; // Left Bower
                    }
                } else if (card.rank === Rank.Ace) {
                    score += 1.5;
                } else if (card.rank === Rank.King) {
                    score += 1.2;
                } else {
                    score += 1.0; // other trump
                }
            } else if (card.rank === Rank.Ace) {
                score += 0.5; // helper Ace
            }
        }
        return score;
    }

    public chooseAIDiscard_(dealerIdx: number): Card {
        const hand = this.handPiles[dealerIdx];
        let worstCard = hand.at(0);
        let worstVal = this.getAIDiscardRating_(worstCard);

        for (let i = 1; i < hand.length; ++i) {
            const current = hand.at(i);
            const currentVal = this.getAIDiscardRating_(current);
            if (currentVal < worstVal) {
                worstVal = currentVal;
                worstCard = current;
            }
        }
        return worstCard;
    }

    private getAIDiscardRating_(card: Card): number {
        const effSuit = getEffectiveSuit(card, this.trumpSuit);
        if (effSuit === this.trumpSuit) {
            return 100 + getTrumpValue(card, this.trumpSuit);
        }
        if (card.rank === Rank.Ace) return 14;
        if (card.rank === Rank.King) return 13;
        if (card.rank === Rank.Queen) return 12;
        if (card.rank === Rank.Jack) return 11;
        if (card.rank === Rank.Ten) return 10;
        if (card.rank === Rank.Nine) return 9;
        return 0;
    }

    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];

        if (this.currentTrick.length === 0) {
            return [...hand];
        }

        // Follow suit with correct Bower handling
        const leadCard = this.currentTrick[0].card;
        const leadSuit = getEffectiveSuit(leadCard, this.trumpSuit);

        const matchingCards = [...hand].filter(c => getEffectiveSuit(c, this.trumpSuit) === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
    }

    protected override *playCard_(card: Card, player: IPlayer): Generator<DelayHint, void> {
        yield* super.playCard_(card, player);
    }

    protected override compareCards_(a: Card, b: Card, leadSuit: Suit): number {
        const aEff = getEffectiveSuit(a, this.trumpSuit);
        const bEff = getEffectiveSuit(b, this.trumpSuit);

        const aIsTrump = (aEff === this.trumpSuit && this.trumpSuit !== Suit.None);
        const bIsTrump = (bEff === this.trumpSuit && this.trumpSuit !== Suit.None);

        if (aIsTrump && !bIsTrump) return 1;
        if (!aIsTrump && bIsTrump) return -1;

        if (aIsTrump && bIsTrump) {
            return getTrumpValue(a, this.trumpSuit) - getTrumpValue(b, this.trumpSuit);
        }

        // Neither is trump
        const aIsLead = (aEff === leadSuit);
        const bIsLead = (bEff === leadSuit);

        if (aIsLead && !bIsLead) return 1;
        if (!aIsLead && bIsLead) return -1;

        if (aIsLead && bIsLead) {
            return getNonTrumpValue(a) - getNonTrumpValue(b);
        }

        return getNonTrumpValue(a) - getNonTrumpValue(b);
    }

    protected override *evaluateTrickWinner_(): Generator<DelayHint, void> {
        const expectedTrickSize = this.players.filter((_, idx) => !this.sittingOutThisTrick[idx]).length;
        if (this.currentTrick.length < expectedTrickSize || expectedTrickSize === 0) return;

        const leadCard = this.currentTrick[0].card;
        const leadSuit = getEffectiveSuit(leadCard, this.trumpSuit);

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

        // Leader of next trick is winner of this one
        this.currentLeaderIndex = winnerIndex;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.currentTrick = [];
    }

    protected override evaluateRoundScores_(): void {
        const makerTeam = this.players[this.makerPlayerIndex].teamId;
        const defenderTeam = makerTeam === "TeamA" ? "TeamB" : "TeamA";

        const teamATricks = this.scoreTracker.getTricksByKey("TeamA");
        const teamBTricks = this.scoreTracker.getTricksByKey("TeamB");

        const makerTricks = makerTeam === "TeamA" ? teamATricks : teamBTricks;

        let pointsAwarded = 0;
        let scoringTeam = "";

        const isAlone = this.alonePlayerIndex !== -1;

        if (makerTricks >= 3) {
            scoringTeam = makerTeam;
            if (makerTricks === 5) {
                if (isAlone) {
                    pointsAwarded = 4;
                    this.gameLog.push(`${this.players[this.makerPlayerIndex].name} went alone and swept all 5 tricks! Maker Team scores 4 points!`);
                } else {
                    pointsAwarded = 2;
                    this.gameLog.push(`Maker Team took all 5 tricks (march)! Maker Team scores 2 points.`);
                }
            } else {
                pointsAwarded = 1;
                this.gameLog.push(`Maker Team won the round with ${makerTricks} tricks. Maker Team scores 1 point.`);
            }
        } else {
            scoringTeam = defenderTeam;
            pointsAwarded = 2;
            this.gameLog.push(`Maker Team only took ${makerTricks} tricks and was EUCHRED! Defending Team (${defenderTeam}) scores 2 points!`);
        }

        this.scoreTracker.addScoreByKey(scoringTeam, pointsAwarded);

        this.gameLog.push(`Scores: Team A: ${this.scoreTracker.getScoreByKey("TeamA")}, Team B: ${this.scoreTracker.getScoreByKey("TeamB")}`);
    }

    protected override checkGameWon_(): boolean {
        const scoreA = this.scoreTracker.getScoreByKey("TeamA");
        const scoreB = this.scoreTracker.getScoreByKey("TeamB");

        if (scoreA >= 10 || scoreB >= 10) {
            if (scoreA !== scoreB) {
                const winningTeam = scoreA > scoreB ? "Team A (You & Partner)" : "Team B (Opponents)";
                this.gameLog.push(`🏆 ${winningTeam} won the game with ${Math.max(scoreA, scoreB)} points! 🏆`);
                return true;
            }
        }
        return false;
    }

    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (this.waitingForHumanDiscard) {
            yield* this.submitHumanDiscard_(card);
            return;
        }
        if (this.isBiddingPhase) return;
        yield* super.cardPrimary_(card);
    }

    protected override getCardName_(card: Card): string {
        const isRightBower = this.trumpSuit !== Suit.None && card.rank === Rank.Jack && card.suit === this.trumpSuit;
        const isLeftBower = this.trumpSuit !== Suit.None && card.rank === Rank.Jack && card.suit === getSameColorSuit(this.trumpSuit);

        if (isRightBower) {
            return `Right Bower (J${this.getSuitSymbol_(card.suit)})`;
        }
        if (isLeftBower) {
            return `Left Bower (J${this.getSuitSymbol_(card.suit)})`;
        }

        return super.getCardName_(card);
    }

    private getSuitSymbol_(suit: Suit): string {
        const symbols = {
            [Suit.Spades]: "♠",
            [Suit.Hearts]: "♥",
            [Suit.Diamonds]: "♦",
            [Suit.Clubs]: "♣",
            [Suit.None]: "",
        };
        return symbols[suit] || "";
    }

    public override serialize(): string {
        const baseJson = super.serialize();
        const state = JSON.parse(baseJson);

        state.dealerIndex = this.dealerIndex;
        state.isBiddingPhase = this.isBiddingPhase;
        state.biddingRound = this.biddingRound;
        state.biddingPlayerIndex = this.biddingPlayerIndex;
        state.waitingForHumanBid = this.waitingForHumanBid;
        state.waitingForHumanDiscard = this.waitingForHumanDiscard;
        state.alonePlayerIndex = this.alonePlayerIndex;
        state.makerPlayerIndex = this.makerPlayerIndex;
        state.proposedCardIndex = this.proposedTrumpCard ? this.cards.indexOf(this.proposedTrumpCard) : -1;

        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            if (!state || typeof state.baseJson !== "string") return false;

            const baseSuccess = super.deserialize(json);
            if (!baseSuccess) return false;

            this.dealerIndex = state.dealerIndex ?? 0;
            this.isBiddingPhase = state.isBiddingPhase ?? false;
            this.biddingRound = state.biddingRound ?? 1;
            this.biddingPlayerIndex = state.biddingPlayerIndex ?? 0;
            this.waitingForHumanBid = state.waitingForHumanBid ?? false;
            this.waitingForHumanDiscard = state.waitingForHumanDiscard ?? false;
            this.alonePlayerIndex = state.alonePlayerIndex ?? -1;
            this.makerPlayerIndex = state.makerPlayerIndex ?? -1;

            const proposedIdx = state.proposedCardIndex ?? -1;
            this.proposedTrumpCard = proposedIdx !== -1 ? this.cards[proposedIdx] : null;

            if (this.isBiddingPhase) {
                this.turnLoopGenerator = this.runBiddingPhase_();
            } else {
                this.turnLoopGenerator = this.runTurnLoop_();
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize Euchre state", error);
            return false;
        }
    }
}
