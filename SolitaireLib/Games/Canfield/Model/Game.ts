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
    public readonly reserve = new Pile(this);
    public readonly foundations: Pile[] = [];
    public readonly waste9 = new Pile(this);
    public readonly waste10 = new Pile(this);
    public readonly waste11 = new Pile(this);
    public readonly stock = new Pile(this);

    private readonly dragSingleSources_: Pile[] = [];
    private readonly autoMoveSources_: Pile[] = [];
    private baseRank_: Rank | undefined = undefined;

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Register piles in the exact layout order (indices 0 to 12)
        // Stacks 0, 1, 2, 3: Tableau piles
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Stack 4: Reserve pile
        this.piles.push(this.reserve);

        // Stacks 5, 6, 7, 8: Foundation piles
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Stacks 9, 10, 11: Discard/waste fan piles
        this.piles.push(this.waste9);
        this.piles.push(this.waste10);
        this.piles.push(this.waste11);

        // Stack 12: Stock/Main pile
        this.piles.push(this.stock);

        // Single drag sources: Reserve, foundations, and waste piles
        this.dragSingleSources_.push(this.reserve);
        for (const f of this.foundations) {
            this.dragSingleSources_.push(f);
        }
        this.dragSingleSources_.push(this.waste9);
        this.dragSingleSources_.push(this.waste10);
        this.dragSingleSources_.push(this.waste11);

        // Auto move sources: Reserve, waste piles, and tableaux
        this.autoMoveSources_.push(this.reserve);
        this.autoMoveSources_.push(this.waste9);
        this.autoMoveSources_.push(this.waste10);
        this.autoMoveSources_.push(this.waste11);
        for (const t of this.tableaux) {
            this.autoMoveSources_.push(t);
        }

        this.cards = DeckUtils.createStandard52Deck(this.stock);
    }

    protected doGetWon_() {
        let sum = 0;
        for (const pile of this.foundations) {
            sum += pile.length;
        }
        return sum === 52;
    }

    public get wonCards() {
        const wonCards: Card[] = [];
        for (const pile of this.foundations) {
            for (const card of pile) {
                wonCards.push(card);
            }
        }
        wonCards.sort((a, b) => {
            if (a.pileIndex > b.pileIndex) return 1;
            if (a.pileIndex < b.pileIndex) return -1;
            if (a.rank > b.rank) return 1;
            if (a.rank < b.rank) return -1;
            return 0;
        });
        return wonCards;
    }

    protected *restart_(rng: prand.RandomGenerator) {
        this.baseRank_ = undefined;

        // Reset all cards to stock face-down
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

        this.stock.sort();
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 13 cards to the Reserve pile (Stack 4), top card face up.
        for (let i = 0; i < 13; ++i) {
            const card = this.stock.peek();
            if (card) {
                this.reserve.push(card);
                if (i === 12) {
                    card.faceUp = true;
                }
                yield DelayHint.Quick;
            }
        }

        // Deal 1 card to the first foundation pile (Stack 5). This card's rank establishes the base rank.
        const baseCard = this.stock.peek();
        if (baseCard) {
            this.foundations[0].push(baseCard);
            baseCard.faceUp = true;
            this.baseRank_ = baseCard.rank;
            yield DelayHint.Quick;
        }

        // Deal 1 card face up to each of the 4 tableau columns.
        for (let i = 0; i < 4; ++i) {
            const card = this.stock.peek();
            if (card) {
                this.tableaux[i].push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // if the player clicks on the top card of the stock, move it to the waste:
        if (this.stock.peek() === card && this.stock.length > 0) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *cardSecondary_(card: Card) {
        // if the player double clicks a card, see if it can be auto-moved to the foundation:
        if (this.autoMoveSources_.indexOf(card.pile) >= 0) {
            for (const foundation of this.foundations) {
                if (this.isFoundationDrop_(card, foundation)) {
                    yield* this.doFoundationDrop_(card, foundation);
                    yield* this.doAutoMoves_();
                    return;
                }
            }
        }
    }

    protected *pilePrimary_(pile: Pile) {
        // if the player clicks the stock and it has been depleted, move the waste back to the stock:
        if (
            pile === this.stock &&
            this.stock.length === 0 &&
            (this.waste9.length > 0 || this.waste10.length > 0 || this.waste11.length > 0)
        ) {
            const wastePiles = [this.waste9, this.waste10, this.waste11];
            for (const waste of wastePiles) {
                for (let i = 0; i < waste.length; ++i) {
                    waste.at(i).faceUp = false;
                }
            }
            yield DelayHint.OneByOne;

            // Gather back to stock in perfect order
            while (this.waste9.length > 0 || this.waste10.length > 0 || this.waste11.length > 0) {
                if (this.waste11.length > 0) {
                    const card = this.waste11.peek();
                    if (card) {
                        this.stock.push(card);
                    }
                }
                if (this.waste10.length > 0) {
                    const card = this.waste10.peek();
                    if (card) {
                        this.stock.push(card);
                    }
                }
                if (this.waste9.length > 0) {
                    const card = this.waste9.peek();
                    if (card) {
                        this.stock.push(card);
                    }
                }
            }

            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.isFoundationDropSource_(card)) {
            return { canDrag: true, extraCards: [] };
        } else if (this.isTableauxDropSource_(card)) {
            return { canDrag: true, extraCards: card.pile.slice(card.pileIndex + 1) };
        }
        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        return this.isTableauxDrop_(card, pile) || this.isFoundationDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.isTableauxDrop_(card, pile)) {
            yield* this.doTableauxDrop_(card, pile);
            yield* this.doAutoMoves_();
        } else if (this.isFoundationDrop_(card, pile)) {
            yield* this.doFoundationDrop_(card, pile);
            yield* this.doAutoMoves_();
        }
    }

    private *doDrawFromStock_() {
        const card1 = this.stock.peek();
        if (card1) {
            this.waste9.push(card1);
            card1.faceUp = true;
            yield DelayHint.Quick;
        }
        const card2 = this.stock.peek();
        if (card2) {
            this.waste10.push(card2);
            card2.faceUp = true;
            yield DelayHint.Quick;
        }
        const card3 = this.stock.peek();
        if (card3) {
            this.waste11.push(card3);
            card3.faceUp = true;
            yield DelayHint.Quick;
        }
        yield DelayHint.OneByOne;
    }

    private isTableauxDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (!this.isTableauxDropSource_(card)) return false;

        if (this.tableaux.indexOf(pile) >= 0) {
            const topCard = pile.peek();

            if (topCard) {
                const topVal = this.getCardValue_(topCard);
                const cardVal = this.getCardValue_(card);
                const expectedVal = topVal === 1 ? 13 : topVal - 1;
                if (cardVal === expectedVal && topCard.colour !== card.colour) {
                    return true;
                }
            } else {
                if (this.reserve.length === 0) {
                    return true;
                }
            }
        }

        return false;
    }

    private isTableauxDropSource_(card: Card) {
        if (this.dragSingleSources_.indexOf(card.pile) >= 0 && card.pile.peek() === card && card.faceUp) {
            return true;
        } else if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.at(0) === card) {
            for (let i = 0; i < card.pile.length - 1; ++i) {
                const card0 = card.pile.at(i);
                const card1 = card.pile.at(i + 1);
                const val0 = this.getCardValue_(card0);
                const val1 = this.getCardValue_(card1);
                const expectedVal = val0 === 1 ? 13 : val0 - 1;
                if (card0.colour === card1.colour || val1 !== expectedVal) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    private *doTableauxDrop_(card: Card, pile: Pile) {
        const movingCards = card.pile.slice(card.pileIndex);
        for (const movingCard of movingCards) {
            pile.push(movingCard);
        }
        yield DelayHint.OneByOne;
    }

    private isFoundationDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (!this.isFoundationDropSource_(card)) return false;

        if (this.foundations.indexOf(pile) >= 0) {
            const topCard = pile.peek();

            if (topCard) {
                const topVal = this.getCardValue_(topCard);
                const cardVal = this.getCardValue_(card);
                if (cardVal === (topVal % 13) + 1 && topCard.suit === card.suit) {
                    return true;
                }
            } else {
                if (this.baseRank_ !== undefined && card.rank === this.baseRank_) {
                    return true;
                }
            }
        }

        return false;
    }

    private isFoundationDropSource_(card: Card) {
        return this.dragSingleSources_.indexOf(card.pile) >= 0 && card.pile.peek() === card && card.faceUp;
    }

    private *doFoundationDrop_(card: Card, pile: Pile) {
        pile.push(card);
        yield DelayHint.OneByOne;
    }

    private getRankValue_(rank: Rank) {
        switch (rank) {
            case Rank.Ace: return 1;
            case Rank.Two: return 2;
            case Rank.Three: return 3;
            case Rank.Four: return 4;
            case Rank.Five: return 5;
            case Rank.Six: return 6;
            case Rank.Seven: return 7;
            case Rank.Eight: return 8;
            case Rank.Nine: return 9;
            case Rank.Ten: return 10;
            case Rank.Jack: return 11;
            case Rank.Queen: return 12;
            case Rank.King: return 13;
            default: return 0;
        }
    }

    private getCardValue_(card: Card) {
        return this.getRankValue_(card.rank);
    }

    private getRelativeFoundationValue_(card: Card) {
        if (this.baseRank_ === undefined) return 0;
        const baseVal = this.getRankValue_(this.baseRank_);
        const cardVal = this.getCardValue_(card);
        return (cardVal - baseVal + 13) % 13;
    }

    private *doAutoMoves_() {
        mainLoop: while (true) {
            if (this.options.autoReveal) {
                // Check if Reserve top card is face down, and reveal it
                if (this.reserve.length > 0) {
                    const card = this.reserve.peek();
                    if (card && !card.faceUp) {
                        card.faceUp = true;
                        yield DelayHint.OneByOne;
                        continue mainLoop;
                    }
                }
            }

            // Fill empty tableau slots immediately from Reserve
            if (this.reserve.length > 0) {
                for (const tableau of this.tableaux) {
                    if (tableau.length === 0) {
                        const card = this.reserve.peek();
                        if (card) {
                            tableau.push(card);
                            card.faceUp = true;
                            yield DelayHint.OneByOne;
                            continue mainLoop;
                        }
                    }
                }
            }

            // Auto move to foundations
            if (this.options.autoMoveToFoundation > 0) {
                let foundationMin = 999;
                for (const pile of this.foundations) {
                    const card = pile.peek();
                    if (card) {
                        foundationMin = Math.min(foundationMin, this.getRelativeFoundationValue_(card));
                    } else {
                        foundationMin = Math.min(foundationMin, -1);
                    }
                }

                for (const pile of this.autoMoveSources_) {
                    const card = pile.peek();
                    if (card && this.getRelativeFoundationValue_(card) <= foundationMin + this.options.autoMoveToFoundation) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(card, foundation)) {
                                yield* this.doFoundationDrop_(card, foundation);
                                continue mainLoop;
                            }
                        }
                    }
                }
            }

            // Auto play stock if waste piles are completely empty
            if (this.options.autoPlayStock) {
                if (
                    this.waste9.length === 0 &&
                    this.waste10.length === 0 &&
                    this.waste11.length === 0 &&
                    this.stock.length > 0
                ) {
                    yield* this.doDrawFromStock_();
                    continue mainLoop;
                }
            }

            break;
        }
    }
}
