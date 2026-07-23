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

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    // Seating/Partnership
    // 0: Human (South, TeamA), 1: AI West (TeamB), 2: AI Partner (North, TeamA), 3: AI East (TeamB)

    // Custom Phase flags
    public isBiddingPhase = false;
    public waitingForHumanBid = false;
    public biddingPlayerIndex = 0;
    public currentHighestBid = 0;
    public highestBidderIndex = -1;
    public hasPassed: boolean[] = [false, false, false, false];
    public dealerIndex = 0;

    public isNamingTrumpPhase = false;
    public waitingForHumanTrump = false;
    public auctionWinnerIndex = -1;
    public finalBid = 0;

    public isMeldPhase = false;
    public waitingForMeldConfirm = false;

    // Running hand stats
    public roundMeldPoints = { TeamA: 0, TeamB: 0 };
    public roundTrickPoints = { TeamA: 0, TeamB: 0 };
    public tricksWonInRound = { TeamA: 0, TeamB: 0 };

    // Detailed melds list per player for UI display
    public playerMelds: { name: string; points: number }[][] = [[], [], [], []];

    public override get winningScore(): number {
        return 1500;
    }

    constructor(params: URLSearchParams) {
        super();
        this.options = new GameOptions(params);

        // Define players with fixed partnerships
        this.players = [
            { id: "player0", name: "You", isHuman: true, teamId: "TeamA" },
            { id: "player1", name: "AI West", isHuman: false, teamId: "TeamB" },
            { id: "player2", name: "AI Partner", isHuman: false, teamId: "TeamA" },
            { id: "player3", name: "AI East", isHuman: false, teamId: "TeamB" },
        ];

        this.scoreTracker = new ScoreTracker("team");

        // Clear default standard 52-card deck
        (this.deckPile as any).cards_.length = 0;
        this.cards = [];

        // Build custom 48-card Pinochle deck:
        // Two copies each of 9, 10, J, Q, K, A in Spades, Hearts, Diamonds, Clubs
        const suits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
        const colours: Record<Suit, Colour> = {
            [Suit.Spades]: Colour.Black,
            [Suit.Hearts]: Colour.Red,
            [Suit.Diamonds]: Colour.Red,
            [Suit.Clubs]: Colour.Black,
            [Suit.None]: Colour.Black,
        };
        const ranks = [Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace];

        for (const suit of suits) {
            const colour = colours[suit]!;
            for (const rank of ranks) {
                for (let copy = 0; copy < 2; ++copy) {
                    const card = this.deckPile.createCard(suit, colour, rank);
                    this.cards.push(card);
                }
            }
        }

        // Initialize dealer
        this.dealerIndex = Math.floor(Math.random() * 4);
    }

    public override determineTrump_(round: number): Suit {
        return Suit.None;
    }

    protected override *startNewRound_(rng: prand.RandomGenerator): Generator<DelayHint, void> {
        this.scoreTracker.resetTricks();
        this.currentTrick = [];
        this.skippedTricks = [0, 0, 0, 0];
        this.sittingOutThisTrick = [false, false, false, false];

        // Gather all cards back to the deck
        for (const pile of this.playedPiles) {
            while (pile.length > 0) {
                const card = pile.peek();
                if (card) {
                    this.deckPile.push(card);
                }
            }
        }

        for (const card of this.cards) {
            this.deckPile.push(card);
            card.doSetFaceUp(false);
        }

        // Shuffle
        this.deckPile.shuffle(rng);

        // Deal 12 cards to each player in packets of 3
        for (let packet = 0; packet < 4; ++packet) {
            for (let i = 0; i < 4; ++i) {
                const hand = this.handPiles[i]!;
                const player = this.players[i]!;
                for (let cardInPacket = 0; cardInPacket < 3; ++cardInPacket) {
                    const card = this.deckPile.peek();
                    if (card) {
                        hand.push(card);
                        card.doSetFaceUp(player.isHuman);
                    }
                }
                yield DelayHint.Quick;
            }
        }

        // Sort human hand (using custom Pinochle ranking A > 10 > K > Q > J > 9)
        this.sortHand_(this.handPiles[0]!);

        // Reset round-specific stats
        this.roundMeldPoints = { TeamA: 0, TeamB: 0 };
        this.roundTrickPoints = { TeamA: 0, TeamB: 0 };
        this.tricksWonInRound = { TeamA: 0, TeamB: 0 };
        this.playerMelds = [[], [], [], []];

        // Advance dealer index (clockwise) after the first round
        if (this.roundNumber > 1) {
            this.dealerIndex = (this.dealerIndex + 1) % 4;
        }

        // Setup Bidding Phase
        this.isBiddingPhase = true;
        this.waitingForHumanBid = false;
        this.currentHighestBid = 0;
        this.highestBidderIndex = -1;
        this.hasPassed = [false, false, false, false];

        // Bidding starts to the left of dealer
        this.biddingPlayerIndex = (this.dealerIndex + 1) % 4;

        yield* this.runBiddingPhase_();
    }

    public *runBiddingPhase_(): Generator<DelayHint, void> {
        while (this.isBiddingPhase) {
            const activeCount = this.hasPassed.filter(p => !p).length;

            if (activeCount === 1) {
                const winnerIdx = this.hasPassed.indexOf(false);
                this.auctionWinnerIndex = winnerIdx;
                this.finalBid = this.currentHighestBid > 0 ? this.currentHighestBid : 20;
                this.isBiddingPhase = false;
                this.gameLog.push(`${this.players[winnerIdx]!.name} won the bidding auction with a bid of ${this.finalBid}!`);
                break;
            } else if (activeCount === 0) {
                // All players passed without any bid, dealer is forced to bid 20
                const winnerIdx = this.dealerIndex;
                this.auctionWinnerIndex = winnerIdx;
                this.finalBid = 20;
                this.isBiddingPhase = false;
                this.gameLog.push(`All players passed! ${this.players[winnerIdx]!.name} (Dealer) is forced to bid 20.`);
                break;
            }

            if (this.hasPassed[this.biddingPlayerIndex]!) {
                this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;
                continue;
            }

            const player = this.players[this.biddingPlayerIndex]!;
            if (player.isHuman) {
                this.waitingForHumanBid = true;
                return; // Wait for human input
            } else {
                yield DelayHint.OneByOne;
                const bidAction = this.evaluateAIBidAction_(this.biddingPlayerIndex);
                if (bidAction === "pass") {
                    this.hasPassed[this.biddingPlayerIndex] = true;
                    this.gameLog.push(`${player.name} passes.`);
                } else {
                    this.currentHighestBid = bidAction;
                    this.highestBidderIndex = this.biddingPlayerIndex;
                    this.gameLog.push(`${player.name} bids ${bidAction}.`);
                }
                this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;
            }
        }

        // Bidding completed, now Trump Naming!
        this.isNamingTrumpPhase = true;
        this.waitingForHumanTrump = false;
        yield* this.runTrumpNamingPhase_();
    }

    public *submitHumanBid_(action: "bid" | "pass", bidAmount?: number): Generator<DelayHint, void> {
        if (!this.isBiddingPhase || !this.waitingForHumanBid) return;

        const humanIndex = this.players.findIndex(p => p.isHuman);
        if (action === "pass") {
            this.hasPassed[humanIndex] = true;
            this.gameLog.push("You passed.");
        } else {
            const bidVal = bidAmount ?? Math.max(20, this.currentHighestBid + 1);
            this.currentHighestBid = bidVal;
            this.highestBidderIndex = humanIndex;
            this.gameLog.push(`You bid ${bidVal}.`);
        }

        this.waitingForHumanBid = false;
        this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;

        yield* this.runBiddingPhase_();
    }

    public evaluateAIBidAction_(playerIdx: number): number | "pass" {
        const hand = this.handPiles[playerIdx]!;

        let maxPotential = 0;
        const suits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
        for (const suit of suits) {
            const melds = this.calculateMeldsForHand_(hand, suit);
            const meldScore = melds.reduce((sum, m) => sum + m.points, 0);
            const suitCardsCount = [...hand].filter(c => c.suit === suit).length;
            const trumpStrength = suitCardsCount * 10;
            const potential = meldScore + trumpStrength;
            if (potential > maxPotential) {
                maxPotential = potential;
            }
        }

        const maxBidLimit = Math.max(20, maxPotential);
        const nextBid = Math.max(20, this.currentHighestBid + 1);

        if (nextBid <= maxBidLimit) {
            return nextBid;
        } else {
            return "pass";
        }
    }

    public *runTrumpNamingPhase_(): Generator<DelayHint, void> {
        const winner = this.players[this.auctionWinnerIndex]!;
        if (winner.isHuman) {
            this.waitingForHumanTrump = true;
            return; // Wait for human choice
        } else {
            yield DelayHint.OneByOne;
            const chosenSuit = this.chooseAITrumpSuit_(this.auctionWinnerIndex);
            this.trumpSuit = chosenSuit;
            this.isNamingTrumpPhase = false;
            this.gameLog.push(`${winner.name} names ${this.getSuitName_(chosenSuit)} as Trump!`);
        }

        // Run Meld calculation
        this.isMeldPhase = true;
        yield* this.runMeldPhase_();
    }

    public *submitHumanTrump_(suit: Suit): Generator<DelayHint, void> {
        if (!this.isNamingTrumpPhase || !this.waitingForHumanTrump) return;

        this.trumpSuit = suit;
        this.isNamingTrumpPhase = false;
        this.waitingForHumanTrump = false;
        this.gameLog.push(`You named ${this.getSuitName_(suit)} as Trump!`);

        // Run Meld calculation
        this.isMeldPhase = true;
        yield* this.runMeldPhase_();
    }

    private chooseAITrumpSuit_(playerIdx: number): Suit {
        const hand = this.handPiles[playerIdx]!;
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
        let bestSuit = Suit.Spades;
        let maxCount = -1;
        for (const s of [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs]) {
            const count = suitCounts[s] || 0;
            if (count > maxCount) {
                maxCount = count;
                bestSuit = s;
            }
        }
        return bestSuit;
    }

    public *runMeldPhase_(): Generator<DelayHint, void> {
        // Calculate melds for all players
        for (let i = 0; i < 4; ++i) {
            const hand = this.handPiles[i]!;
            const melds = this.calculateMeldsForHand_(hand, this.trumpSuit);
            this.playerMelds[i] = melds;

            const totalScore = melds.reduce((sum, m) => sum + m.points, 0);
            const player = this.players[i]!;
            if (player.teamId === "TeamA") {
                this.roundMeldPoints.TeamA += totalScore;
            } else {
                this.roundMeldPoints.TeamB += totalScore;
            }
        }

        this.gameLog.push(`--- Meld Phase ---`);
        this.gameLog.push(`Team A (You & Partner) melded: ${this.roundMeldPoints.TeamA} points.`);
        this.gameLog.push(`Team B (Opponents) melded: ${this.roundMeldPoints.TeamB} points.`);

        this.waitingForMeldConfirm = true;
        return; // Pause generator until player confirms
    }

    public *confirmMeldAndPlay_(): Generator<DelayHint, void> {
        if (!this.isMeldPhase || !this.waitingMeldConfirm_) return;

        this.isMeldPhase = false;
        this.waitingForMeldConfirm = false;

        // Bidding winner leads first trick
        this.currentLeaderIndex = this.auctionWinnerIndex;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.waitingForHumanPlay = false;

        // Initialize generator for loop
        this.turnLoopGenerator = this.runTurnLoop_();
        yield* this.turnLoopGenerator;
    }

    private get waitingMeldConfirm_(): boolean {
        return this.waitingForMeldConfirm;
    }

    public calculateMeldsForHand_(hand: Pile, trump: Suit): { name: string; points: number }[] {
        const melds: { name: string; points: number }[] = [];

        const counts: Record<Suit, Record<Rank, number>> = {
            [Suit.Spades]: {} as Record<Rank, number>,
            [Suit.Hearts]: {} as Record<Rank, number>,
            [Suit.Diamonds]: {} as Record<Rank, number>,
            [Suit.Clubs]: {} as Record<Rank, number>,
            [Suit.None]: {} as Record<Rank, number>,
        };
        const suits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
        const ranks = [Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace];
        for (const s of suits) {
            for (const r of ranks) {
                counts[s]![r] = 0;
            }
        }

        for (const card of hand) {
            if (card.suit in counts && counts[card.suit] && card.rank in counts[card.suit]!) {
                counts[card.suit]![card.rank]++;
            }
        }

        // 1. Class C (Around / Groupings)
        // Aces Around (100) or Aces Abound (1000)
        const minAces = Math.min(...suits.map(s => counts[s]?.[Rank.Ace] ?? 0));
        if (minAces === 2) {
            melds.push({ name: "Aces Abound", points: 1000 });
        } else if (minAces === 1) {
            melds.push({ name: "Aces Around", points: 100 });
        }

        // Kings Around (80) or Kings Abound (800)
        const minKings = Math.min(...suits.map(s => counts[s]?.[Rank.King] ?? 0));
        if (minKings === 2) {
            melds.push({ name: "Kings Abound", points: 800 });
        } else if (minKings === 1) {
            melds.push({ name: "Kings Around", points: 80 });
        }

        // Queens Around (60) or Queens Abound (600)
        const minQueens = Math.min(...suits.map(s => counts[s]?.[Rank.Queen] ?? 0));
        if (minQueens === 2) {
            melds.push({ name: "Queens Abound", points: 600 });
        } else if (minQueens === 1) {
            melds.push({ name: "Queens Around", points: 60 });
        }

        // Jacks Around (40) or Jacks Abound (400)
        const minJacks = Math.min(...suits.map(s => counts[s]?.[Rank.Jack] ?? 0));
        if (minJacks === 2) {
            melds.push({ name: "Jacks Abound", points: 400 });
        } else if (minJacks === 1) {
            melds.push({ name: "Jacks Around", points: 40 });
        }

        // 2. Class B (Pinochles)
        // Pinochle (J♦ + Q♠) (40) or Double Pinochle (300)
        const jD = counts[Suit.Diamonds]?.[Rank.Jack] ?? 0;
        const qS = counts[Suit.Spades]?.[Rank.Queen] ?? 0;
        const pinochleCount = Math.min(jD, qS);
        if (pinochleCount === 2) {
            melds.push({ name: "Double Pinochle", points: 300 });
        } else if (pinochleCount === 1) {
            melds.push({ name: "Pinochle", points: 40 });
        }

        // 3. Class A (Sequences)
        // Run (A, 10, K, Q, J of Trump) = 150, Double Run = 1500
        let trumpRuns = 0;
        if (trump !== Suit.None) {
            const runCards = [Rank.Ace, Rank.Ten, Rank.King, Rank.Queen, Rank.Jack];
            const trumpRunCounts = runCards.map(r => counts[trump]?.[r] ?? 0);
            trumpRuns = Math.min(...trumpRunCounts);
            if (trumpRuns === 2) {
                melds.push({ name: "Double Run", points: 1500 });
            } else if (trumpRuns === 1) {
                melds.push({ name: "Run", points: 150 });
            }
        }

        // Marriages: K + Q same suit
        for (const s of suits) {
            const numK = counts[s]?.[Rank.King] ?? 0;
            const numQ = counts[s]?.[Rank.Queen] ?? 0;
            let marriageCount = Math.min(numK, numQ);

            if (s === trump) {
                marriageCount = Math.max(0, marriageCount - trumpRuns);
                for (let m = 0; m < marriageCount; ++m) {
                    melds.push({ name: "Royal Marriage", points: 40 });
                }
            } else {
                for (let m = 0; m < marriageCount; ++m) {
                    melds.push({ name: "Common Marriage", points: 20 });
                }
            }
        }

        return melds;
    }

    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];
        if (this.currentTrick.length === 0) {
            return [...hand];
        }

        const leadSuit = this.currentTrick[0]!.card.suit;
        const matchingCards = [...hand].filter(c => c.suit === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
    }

    protected override *playCard_(card: Card, player: IPlayer): Generator<DelayHint, void> {
        yield* super.playCard_(card, player);
    }

    protected override *evaluateTrickWinner_(): Generator<DelayHint, void> {
        const expectedTrickSize = this.players.filter((_, idx) => !this.sittingOutThisTrick[idx]).length;
        if (this.currentTrick.length < expectedTrickSize || expectedTrickSize === 0) return;

        const leadSuit = this.currentTrick[0]!.card.suit;
        let winningPlay = this.currentTrick[0]!;

        // Evaluate trick winner. Ties are won by the card played first
        for (let i = 1; i < this.currentTrick.length; ++i) {
            const play = this.currentTrick[i]!;
            if (this.compareCards_(play.card, winningPlay.card, leadSuit) > 0) {
                winningPlay = play;
            }
        }

        const winner = winningPlay.player;
        const winnerIndex = this.players.indexOf(winner);
        const isTeamA = winner.teamId === "TeamA";
        const teamKey = isTeamA ? "TeamA" : "TeamB";

        // Scoring counters: Aces, 10s, Kings are 10 points each
        let pts = 0;
        for (const play of this.currentTrick) {
            const card = play.card;
            if (card.rank === Rank.Ace || card.rank === Rank.Ten || card.rank === Rank.King) {
                pts += 10;
            }
        }

        // Check if this is the last (12th) trick of the hand
        const handLength = this.handPiles[0]!.length;
        if (handLength === 0) {
            pts += 10; // Last trick bonus
        }

        this.roundTrickPoints[teamKey] += pts;
        this.tricksWonInRound[teamKey]++;

        this.scoreTracker.addTrick(winner);
        this.gameLog.push(`${winner.name} won trick with ${this.getCardName_(winningPlay.card)} (+${pts} trick pts)`);

        yield DelayHint.Quick;

        // Empty played piles to deck pile
        for (const pile of this.playedPiles) {
            while (pile.length > 0) {
                const card = pile.peek();
                if (card) {
                    this.deckPile.push(card);
                    card.doSetFaceUp(false);
                }
            }
        }

        // Leader of next trick
        this.currentLeaderIndex = winnerIndex;
        this.activePlayerIndex = this.currentLeaderIndex;
        this.currentTrick = [];
    }

    protected override evaluateRoundScores_(): void {
        // Melds bank only if the team wins at least one trick during play
        let finalMeldA = this.roundMeldPoints.TeamA;
        let finalMeldB = this.roundMeldPoints.TeamB;

        if (this.tricksWonInRound.TeamA === 0) {
            finalMeldA = 0;
            this.gameLog.push("Team A (You & Partner) won 0 tricks! Melds forfeited.");
        }
        if (this.tricksWonInRound.TeamB === 0) {
            finalMeldB = 0;
            this.gameLog.push("Team B (Opponents) won 0 tricks! Melds forfeited.");
        }

        const teamATotal = finalMeldA + this.roundTrickPoints.TeamA;
        const teamBTotal = finalMeldB + this.roundTrickPoints.TeamB;

        // Bidding team checks
        const biddingTeam = this.players[this.auctionWinnerIndex]!.teamId as "TeamA" | "TeamB";

        let scoreChangeA = teamATotal;
        let scoreChangeB = teamBTotal;

        if (biddingTeam === "TeamA") {
            if (teamATotal < this.finalBid) {
                scoreChangeA = 0;
                this.gameLog.push(`Team A (You & Partner) failed to make their bid of ${this.finalBid}! (Scored ${teamATotal}). Round score: 0.`);
            } else {
                this.gameLog.push(`Team A made their bid of ${this.finalBid}! (Scored ${teamATotal}).`);
            }
        } else {
            if (teamBTotal < this.finalBid) {
                scoreChangeB = 0;
                this.gameLog.push(`Team B failed to make their bid of ${this.finalBid}! (Scored ${teamBTotal}). Round score: 0.`);
            } else {
                this.gameLog.push(`Team B made their bid of ${this.finalBid}! (Scored ${teamBTotal}).`);
            }
        }

        this.scoreTracker.addScoreByKey("TeamA", scoreChangeA);
        this.scoreTracker.addScoreByKey("TeamB", scoreChangeB);

        this.gameLog.push(`Cumulative score: Team A (You): ${this.scoreTracker.getScoreByKey("TeamA")}, Team B (Opps): ${this.scoreTracker.getScoreByKey("TeamB")}`);
    }

    protected override checkGameWon_(): boolean {
        const scoreA = this.scoreTracker.getScoreByKey("TeamA");
        const scoreB = this.scoreTracker.getScoreByKey("TeamB");

        if (scoreA >= 1500 || scoreB >= 1500) {
            const biddingTeam = this.players[this.auctionWinnerIndex]!.teamId as "TeamA" | "TeamB";

            // If both teams cross 1500 in the same hand, the bidding team wins regardless of raw totals
            let winnerTeamKey: "TeamA" | "TeamB" = "TeamA";
            if (scoreA >= 1500 && scoreB >= 1500) {
                winnerTeamKey = biddingTeam;
            } else {
                winnerTeamKey = scoreA >= 1500 ? "TeamA" : "TeamB";
            }

            const winnerLabel = winnerTeamKey === "TeamA" ? "Team A (You & Partner)" : "Team B (Opponents)";
            const winningScore = winnerTeamKey === "TeamA" ? scoreA : scoreB;

            this.gameLog.push(`🏆 ${winnerLabel} won the game with ${winningScore} points! 🏆`);
            return true;
        }

        return false;
    }

    protected override getCardValue_(card: Card): number {
        if (card.rank === Rank.Ace) return 14;
        if (card.rank === Rank.Ten) return 13;
        if (card.rank === Rank.King) return 12;
        if (card.rank === Rank.Queen) return 11;
        if (card.rank === Rank.Jack) return 10;
        if (card.rank === Rank.Nine) return 9;
        return 0;
    }

    protected override compareCards_(a: Card, b: Card, leadSuit: Suit): number {
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

    public sortHand_(hand: Pile) {
        (hand as any).cards_.sort((a: Card, b: Card) => {
            if (a.suit !== b.suit) {
                return a.suit - b.suit;
            }
            const rA = this.getCardValue_(a);
            const rB = this.getCardValue_(b);
            return rB - rA; // Descending rank order
        });
        for (let i = 0; i < hand.length; ++i) {
            hand.at(i).onPileIndexChanged(i);
        }
        hand.cardsChanged();
    }

    protected override *cardPrimary_(card: Card): Generator<DelayHint, void> {
        if (this.isBiddingPhase || this.isNamingTrumpPhase || this.isMeldPhase) return;
        yield* super.cardPrimary_(card);
    }

    public getSuitName_(suit: Suit): string {
        const suitSymbols = {
            [Suit.Spades]: "Spades ♠",
            [Suit.Hearts]: "Hearts ♥",
            [Suit.Diamonds]: "Diamonds ♦",
            [Suit.Clubs]: "Clubs ♣",
            [Suit.None]: "No Trump",
        };
        return suitSymbols[suit] || "";
    }

    public override serialize(): string {
        const baseJson = super.serialize();
        const state = {
            baseJson,
            isBiddingPhase: this.isBiddingPhase,
            waitingForHumanBid: this.waitingForHumanBid,
            biddingPlayerIndex: this.biddingPlayerIndex,
            currentHighestBid: this.currentHighestBid,
            highestBidderIndex: this.highestBidderIndex,
            hasPassed: this.hasPassed,
            dealerIndex: this.dealerIndex,
            isNamingTrumpPhase: this.isNamingTrumpPhase,
            waitingForHumanTrump: this.waitingForHumanTrump,
            auctionWinnerIndex: this.auctionWinnerIndex,
            finalBid: this.finalBid,
            isMeldPhase: this.isMeldPhase,
            waitingForMeldConfirm: this.waitingForMeldConfirm,
            roundMeldPoints: this.roundMeldPoints,
            roundTrickPoints: this.roundTrickPoints,
            tricksWonInRound: this.tricksWonInRound,
            playerMelds: this.playerMelds
        };
        return JSON.stringify(state);
    }

    public override deserialize(json: string): boolean {
        try {
            const state = JSON.parse(json);
            if (!state || typeof state.baseJson !== "string") return false;

            const baseSuccess = super.deserialize(state.baseJson);
            if (!baseSuccess) return false;

            this.isBiddingPhase = state.isBiddingPhase || false;
            this.waitingForHumanBid = state.waitingForHumanBid || false;
            this.biddingPlayerIndex = state.biddingPlayerIndex ?? 0;
            this.currentHighestBid = state.currentHighestBid ?? 0;
            this.highestBidderIndex = state.highestBidderIndex ?? -1;
            this.hasPassed = state.hasPassed || [false, false, false, false];
            this.dealerIndex = state.dealerIndex ?? 0;
            this.isNamingTrumpPhase = state.isNamingTrumpPhase || false;
            this.waitingForHumanTrump = state.waitingForHumanTrump || false;
            this.auctionWinnerIndex = state.auctionWinnerIndex ?? -1;
            this.finalBid = state.finalBid ?? 0;
            this.isMeldPhase = state.isMeldPhase || false;
            this.waitingForMeldConfirm = state.waitingForMeldConfirm || false;
            this.roundMeldPoints = state.roundMeldPoints || { TeamA: 0, TeamB: 0 };
            this.roundTrickPoints = state.roundTrickPoints || { TeamA: 0, TeamB: 0 };
            this.tricksWonInRound = state.tricksWonInRound || { TeamA: 0, TeamB: 0 };
            this.playerMelds = state.playerMelds || [[], [], [], []];

            if (this.isBiddingPhase) {
                this.turnLoopGenerator = this.runBiddingPhase_();
            } else if (this.isNamingTrumpPhase) {
                this.turnLoopGenerator = this.runTrumpNamingPhase_();
            } else if (this.isMeldPhase) {
                this.turnLoopGenerator = this.runMeldPhase_();
            } else {
                this.turnLoopGenerator = this.runTurnLoop_();
            }

            return true;
        } catch (error) {
            console.error("Failed to deserialize Pinochle state", error);
            return false;
        }
    }
}
