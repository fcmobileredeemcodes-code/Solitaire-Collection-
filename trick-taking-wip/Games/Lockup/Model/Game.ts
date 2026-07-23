import { TrickTakingGameBase } from "~CardLib/Model/TrickTakingGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";
import { Card } from "~CardLib/Model/Card";
import { Pile } from "~CardLib/Model/Pile";
import { IPlayer } from "~CardLib/Model/IPlayer";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { ScoreTracker } from "~CardLib/Model/ScoreTracker";
import { IGame } from "./IGame";

export class Game extends TrickTakingGameBase implements IGame {
    public readonly options: GameOptions;

    public override get winningScore(): number {
        return 20;
    }

    constructor(params: URLSearchParams) {
        super();
        this.options = new GameOptions(params);

        // 4 players, no partnerships - every player scores individually
        // Leave teamId unset for all players
        this.players = [
            { id: "player0", name: "You", isHuman: true },
            { id: "player1", name: "AI West", isHuman: false },
            { id: "player2", name: "AI North", isHuman: false },
            { id: "player3", name: "AI East", isHuman: false },
        ];

        // Score tracker in player mode
        this.scoreTracker = new ScoreTracker("player");
    }

    public override determineTrump_(round: number): Suit {
        // No trump suit at all permanently, no rotation, no bidding
        return Suit.None;
    }

    // Leader may lead any suit except Clubs, unless Clubs are the only cards left in their hand,
    // in which case they must lead a Club.
    // Players must follow suit if able; if unable, may play any card.
    public override getLegalCards_(hand: Pile): Card[] {
        if (hand.length === 0) return [];

        if (this.currentTrick.length === 0) {
            // Leader
            const nonClubs = [...hand].filter(c => c.suit !== Suit.Clubs);
            if (nonClubs.length > 0) {
                return nonClubs;
            }
            return [...hand];
        }

        // Follow suit
        const leadSuit = this.currentTrick[0].card.suit;
        const matchingCards = [...hand].filter(c => c.suit === leadSuit);
        if (matchingCards.length > 0) {
            return matchingCards;
        }

        return [...hand];
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

        // Check if the trick contains any Clubs
        const clubCards = this.currentTrick.filter(t => t.card.suit === Suit.Clubs);
        const clubCount = clubCards.length;

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

        // "lockup" mechanic: if a trick a player wins contains any Clubs,
        // that player is placed in "lockup" for a number of subsequent tricks equal to the number of Clubs.
        if (clubCount > 0) {
            this.skippedTricks[winnerIndex] += clubCount;
            this.gameLog.push(`${winner.name} is placed in lockup for ${clubCount} trick(s) because the trick contained ${clubCount} Club(s).`);
        }

        // Decrement skipped counters for players who sat out this trick:
        for (let i = 0; i < 4; ++i) {
            if (this.sittingOutThisTrick[i]) {
                this.skippedTricks[i]--;
                if (this.skippedTricks[i] < 0) {
                    this.skippedTricks[i] = 0;
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

        const leadCard = this.currentTrick[0]?.card;
        const leadSuit = leadCard ? leadCard.suit : Suit.None;

        // Custom Lockup AI heuristic:
        // Avoid winning tricks with Clubs in them when possible, to avoid self-inflicted lockup.
        // Also check if any card currently in the trick is a Club, or if any Club in our legal plays might win.
        const trickHasClubs = this.currentTrick.some(t => t.card.suit === Suit.Clubs);

        if (leadCard) {
            // Evaluate currently winning play in the trick so far:
            let bestPlay = this.currentTrick[0];
            for (let i = 1; i < this.currentTrick.length; ++i) {
                const p = this.currentTrick[i];
                if (this.compareCards_(p.card, bestPlay.card, leadSuit) > 0) {
                    bestPlay = p;
                }
            }

            // Group our legal cards into ones that would win vs ones that would not win
            const winningCards: Card[] = [];
            const safeCards: Card[] = [];

            for (const card of legalCards) {
                if (this.compareCards_(card, bestPlay.card, leadSuit) > 0) {
                    winningCards.push(card);
                } else {
                    safeCards.push(card);
                }
            }

            // If there's already a Club in the trick, or if we have Clubs in our hand that we might have to play,
            // we should try very hard NOT to win this trick.
            const dangerousTrick = trickHasClubs || winningCards.some(c => c.suit === Suit.Clubs);

            if (dangerousTrick) {
                if (safeCards.length > 0) {
                    // Play the highest card that does NOT win the trick, to conserve strength,
                    // or just play the lowest overall safe card.
                    return this.getLowestCard_(safeCards);
                } else {
                    // All legal cards would win the trick! Let's play our lowest winning card
                    // to minimize impact or discard the lowest club if possible.
                    return this.getLowestCard_(winningCards);
                }
            } else {
                // No clubs in trick so far. It's safe to try to win!
                if (winningCards.length > 0) {
                    // Try to win! Play highest winning card
                    return this.getHighestCard_(winningCards, leadSuit);
                } else {
                    // We can't win. Play lowest safe card
                    return this.getLowestCard_(safeCards);
                }
            }
        } else {
            // We are leading. We cannot lead clubs unless forced.
            // Avoid leading a suit if we have very high cards that might get clubbed,
            // but a standard heuristic is fine. Play a safe middle-to-high card of a non-club suit.
            const nonClubs = legalCards.filter(c => c.suit !== Suit.Clubs);
            if (nonClubs.length > 0) {
                // Lead a reasonably good card, maybe our highest of a non-club suit
                return this.getHighestCard_(nonClubs, Suit.None);
            }
            return this.getLowestCard_(legalCards);
        }
    }

    protected override evaluateRoundScores_(): void {
        const roundLogs: string[] = [];
        for (const player of this.players) {
            const tricksWon = this.scoreTracker.getTricks(player);
            this.scoreTracker.addScore(player, tricksWon);
            roundLogs.push(`${player.name}: scored ${tricksWon} pts (Total: ${this.scoreTracker.getScore(player)})`);
        }
        this.gameLog.push(`Round ended. ${roundLogs.join(", ")}`);
    }

    protected override checkGameWon_(): boolean {
        // First player to 20 points wins.
        // If two players have 20 points or more and have the same amount of points,
        // the game continues until one of them is higher than the other (which evaluateRoundScores_ does automatically).
        const scores = this.players.map(p => ({
            player: p,
            score: this.scoreTracker.getScore(p)
        }));

        const atLeastOneReached20 = scores.some(s => s.score >= this.winningScore);
        if (!atLeastOneReached20) {
            return false;
        }

        // Find the maximum score
        const maxScore = Math.max(...scores.map(s => s.score));
        const topScorers = scores.filter(s => s.score === maxScore);

        if (topScorers.length === 1) {
            const winner = topScorers[0].player;
            this.gameLog.push(`${winner.name} won the game with ${maxScore} points!`);
            return true;
        }

        // Tie at 20 or more - continue playing until there's a sole highest score
        return false;
    }
}
