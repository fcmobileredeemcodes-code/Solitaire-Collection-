import prand from "pure-rand";
import * as Debug from "~CardLib/Debug";
import { Card } from "~CardLib/Model/Card";
import * as DeckUtils from "~CardLib/Model/DeckUtils";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { GameBase } from "~CardLib/Model/GameBase";
import { Pile } from "~CardLib/Model/Pile";
import { Rank } from "~CardLib/Model/Rank";
import { GameOptions } from "./GameOptions";
import { IGame } from "./IGame";

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;
    public readonly tableaux: Pile[] = [];
    public readonly foundations: Pile[] = [];
    public readonly waste = new Pile(this);
    public readonly stock = new Pile(this);

    // Foundation dynamic arithmetic progressions
    public static readonly sequences: Rank[][] = [
        // Foundation 4 (Step +1): A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K
        [
            Rank.Ace, Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six,
            Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King
        ],
        // Foundation 5 (Step +2): 2, 4, 6, 8, 10, Q, A, 3, 5, 7, 9, J, K
        [
            Rank.Two, Rank.Four, Rank.Six, Rank.Eight, Rank.Ten, Rank.Queen,
            Rank.Ace, Rank.Three, Rank.Five, Rank.Seven, Rank.Nine, Rank.Jack, Rank.King
        ],
        // Foundation 6 (Step +3): 3, 6, 9, Q, 2, 5, 8, J, A, 4, 7, 10, K
        [
            Rank.Three, Rank.Six, Rank.Nine, Rank.Queen, Rank.Two, Rank.Five,
            Rank.Eight, Rank.Jack, Rank.Ace, Rank.Four, Rank.Seven, Rank.Ten, Rank.King
        ],
        // Foundation 7 (Step +4): 4, 8, Q, 3, 7, J, 2, 6, 10, A, 5, 9, K
        [
            Rank.Four, Rank.Eight, Rank.Queen, Rank.Three, Rank.Seven, Rank.Jack,
            Rank.Two, Rank.Six, Rank.Ten, Rank.Ace, Rank.Five, Rank.Nine, Rank.King
        ]
    ];

    constructor(options: GameOptions) {
        super();
        this.options = options;

        // Tableau Piles (Discard/Trash zones): Stacks 0, 1, 2, 3
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Foundation Piles: Stacks 4, 5, 6, 7
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Discard/Trash Pile: Stack 8
        this.piles.push(this.waste);

        // Stock/Main Pile: Stack 9
        this.piles.push(this.stock);

        this.cards = DeckUtils.createStandard52Deck(this.stock);
    }

    protected doGetWon_() {
        return this.wonCards.length === 52;
    }

    public get wonCards() {
        const won: Card[] = [];
        for (const pile of this.foundations) {
            for (const card of pile) {
                won.push(card);
            }
        }
        return won;
    }

    protected *restart_(rng: prand.RandomGenerator) {
        // Collect all cards back to the stock, face down
        for (const card of this.stock) {
            card.faceUp = false;
        }

        for (let pileIndex = this.piles.length; pileIndex-- > 0; ) {
            const pile = this.piles[pileIndex] ?? Debug.error();
            if (pile === this.stock) continue;
            for (let cardIndex = pile.length; cardIndex-- > 0; ) {
                const card = pile.at(cardIndex);
                card.faceUp = false;
                this.stock.push(card);
            }
        }

        // Sort and shuffle stock
        this.stock.sort();
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Layout pre-deals: Find one Ace, 2, 3, 4 (any suit) and place them on Foundations 4, 5, 6, 7 respectively.
        const targets = [Rank.Ace, Rank.Two, Rank.Three, Rank.Four];
        for (let i = 0; i < 4; ++i) {
            const targetRank = targets[i];
            const foundation = this.foundations[i] ?? Debug.error();

            // Search stock for a card of targetRank
            let foundCard: Card | undefined;
            for (let cardIndex = 0; cardIndex < this.stock.length; ++cardIndex) {
                const card = this.stock.at(cardIndex);
                if (card.rank === targetRank) {
                    foundCard = card;
                    break;
                }
            }

            if (foundCard) {
                foundation.push(foundCard);
                foundCard.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        // Re-reveal or do auto plays if necessary
        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // If player clicks Stock, draw one card to waste (Stack 8)
        if (card.pile === this.stock) {
            if (this.stock.length > 0) {
                yield* this.doDrawFromStock_();
                yield* this.doAutoMoves_();
            }
            return;
        }

        // If clicking top card of waste, play to first valid foundation if possible
        if (card.pile === this.waste && this.waste.peek() === card) {
            for (const foundation of this.foundations) {
                if (this.isFoundationDrop_(card, foundation)) {
                    foundation.push(card);
                    yield DelayHint.OneByOne;
                    yield* this.doAutoMoves_();
                    return;
                }
            }
        }

        // If clicking top card of tableaux, play to first valid foundation if possible
        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            for (const foundation of this.foundations) {
                if (this.isFoundationDrop_(card, foundation)) {
                    foundation.push(card);
                    yield DelayHint.OneByOne;
                    yield* this.doAutoMoves_();
                    return;
                }
            }
        }
    }

    protected *cardSecondary_(card: Card) {
        yield* this.cardPrimary_(card);
    }

    protected *pilePrimary_(pile: Pile) {
        if (pile === this.stock && this.stock.length > 0) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        // Only the top card of a tableau pile or waste pile is available for play (drag)
        if (card.pile === this.waste && this.waste.peek() === card) {
            return { canDrag: true, extraCards: [] };
        }
        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            return { canDrag: true, extraCards: [] };
        }
        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        if (this.foundations.indexOf(pile) >= 0) {
            return this.isFoundationDrop_(card, pile);
        }
        if (this.tableaux.indexOf(pile) >= 0) {
            return this.isTableauxDrop_(card, pile);
        }
        return false;
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.isFoundationDrop_(card, pile)) {
            pile.push(card);
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        } else if (this.isTableauxDrop_(card, pile)) {
            pile.push(card);
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        }
    }

    private *doDrawFromStock_() {
        const card = this.stock.peek();
        if (card) {
            this.waste.push(card);
            card.faceUp = true;
            yield DelayHint.Quick;
        }
        yield DelayHint.OneByOne;
    }

    private isFoundationDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;

        const fIndex = this.foundations.indexOf(pile);
        if (fIndex < 0) return false;

        // Verify the next card in sequence for this foundation
        const seq = Game.sequences[fIndex] ?? Debug.error();
        const expectedRank = seq[pile.length];
        if (expectedRank !== undefined && card.rank === expectedRank) {
            return true;
        }

        return false;
    }

    private isTableauxDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) < 0) return false;

        // Cards can be placed on tableaux in any order (only from waste or stock top)
        // No movement allowed between tableau piles!
        if (this.tableaux.indexOf(card.pile) >= 0) return false;

        return true;
    }

    private *doAutoMoves_() {
        // In Calculation, automatic plays can be performed if a waste or stock card matches foundation
        // or top of tableau matches foundation.
        // Let's implement auto-reveal if there are face-down cards on any playable top piles,
        // though in Calculation normally stock cards are turned face up one by one.
        while (true) {
            let madeMove = false;

            // Check if top card of waste can go to any foundation
            const wasteTop = this.waste.peek();
            if (wasteTop) {
                for (const foundation of this.foundations) {
                    if (this.isFoundationDrop_(wasteTop, foundation)) {
                        foundation.push(wasteTop);
                        yield DelayHint.OneByOne;
                        madeMove = true;
                        break;
                    }
                }
            }

            if (madeMove) continue;

            // Check if top card of any tableau can go to any foundation
            for (const tableau of this.tableaux) {
                const tabTop = tableau.peek();
                if (tabTop) {
                    for (const foundation of this.foundations) {
                        if (this.isFoundationDrop_(tabTop, foundation)) {
                            foundation.push(tabTop);
                            yield DelayHint.OneByOne;
                            madeMove = true;
                            break;
                        }
                    }
                }
                if (madeMove) break;
            }

            if (!madeMove) break;
        }
    }
}
