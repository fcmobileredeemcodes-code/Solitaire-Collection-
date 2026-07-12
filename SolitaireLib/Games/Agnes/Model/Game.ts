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

const TABLEAUX_COUNT = 7;

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;
    public readonly stock = new Pile(this);
    public readonly leftovers: Pile[] = [];
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    private masterRank_: Rank = Rank.None;

    constructor(options: GameOptions) {
        super();
        this.options = options;

        // Register piles in layout/logical order:
        this.piles.push(this.stock);

        for (let i = 0; i < 2; ++i) {
            const pile = new Pile(this);
            this.leftovers.push(pile);
            this.piles.push(pile);
        }

        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        for (let i = 0; i < TABLEAUX_COUNT; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
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
        this.masterRank_ = Rank.None;

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

        // sort then shuffle the stock:
        this.stock.sort();
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 7 tableaux columns (triangular, total 28 cards)
        for (let i = 0; i < this.tableaux.length; ++i) {
            const pile = this.tableaux[i] ?? Debug.error();
            for (let j = 0; j <= i; ++j) {
                const card = this.stock.peek();
                if (card) {
                    pile.push(card);
                    if (j === i) {
                        card.faceUp = true;
                    }
                    yield DelayHint.Quick;
                }
            }
        }

        // Deal 29th card face up to first foundation
        const masterCard = this.stock.peek();
        if (masterCard) {
            this.foundations[0].push(masterCard);
            masterCard.faceUp = true;
            this.masterRank_ = masterCard.rank;
            yield DelayHint.Quick;
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        if (card.pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }

        // Reveal tableau card if top and face down
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card && !card.faceUp) {
                card.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
                return;
            }
        }
    }

    protected *cardSecondary_(card: Card) {
        if (card.faceUp && card.pile.peek() === card) {
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
        if (pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (this.isTableauxDropSource_(card)) {
                return { canDrag: true, extraCards: card.pile.slice(card.pileIndex + 1) };
            }
        } else if (this.foundations.indexOf(card.pile) >= 0 || this.leftovers.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card && card.faceUp) {
                return { canDrag: true, extraCards: [] };
            }
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

    private canDrawFromStock_() {
        return this.stock.length >= 7;
    }

    private *doDrawFromStock_() {
        for (let i = 0; i < TABLEAUX_COUNT; ++i) {
            const card = this.stock.peek();
            if (card) {
                const tableau = this.tableaux[i] ?? Debug.error();
                tableau.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        if (this.stock.length === 2) {
            const card0 = this.stock.peek();
            if (card0) {
                this.leftovers[0].push(card0);
                card0.faceUp = true;
                yield DelayHint.Quick;
            }
            const card1 = this.stock.peek();
            if (card1) {
                this.leftovers[1].push(card1);
                card1.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;
    }

    private isTableauxDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (!this.isTableauxDropSource_(card)) return false;

        if (this.tableaux.indexOf(pile) >= 0) {
            const topCard = pile.peek();

            if (topCard) {
                if (topCard.colour !== card.colour && this.getCardValue_(topCard) === this.getCardValue_(card) + 1) {
                    return true;
                }
            } else {
                const masterVal = this.getCardValue_Rank(this.masterRank_);
                const expectedVal = masterVal === 1 ? 13 : masterVal - 1;
                if (this.getCardValue_(card) === expectedVal) {
                    return true;
                }
            }
        }

        return false;
    }

    private isTableauxDropSource_(card: Card) {
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (!card.faceUp) return false;
            for (let i = card.pileIndex; i < card.pile.length - 1; ++i) {
                const card0 = card.pile.at(i);
                const card1 = card.pile.at(i + 1);
                if (
                    !card0.faceUp ||
                    !card1.faceUp ||
                    card0.colour === card1.colour ||
                    this.getCardValue_(card0) !== this.getCardValue_(card1) + 1
                ) {
                    return false;
                }
            }
            return true;
        }
        return card.pile.peek() === card && card.faceUp && (
            this.foundations.indexOf(card.pile) >= 0 ||
            this.leftovers.indexOf(card.pile) >= 0
        );
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
        if (card.pile.peek() !== card || !card.faceUp) return false;

        if (this.foundations.indexOf(pile) >= 0) {
            const topCard = pile.peek();

            if (topCard) {
                if (topCard.suit === card.suit && (this.getCardValue_(topCard) % 13) + 1 === this.getCardValue_(card)) {
                    return true;
                }
            } else {
                if (card.rank === this.masterRank_) {
                    return true;
                }
            }
        }

        return false;
    }

    private *doFoundationDrop_(card: Card, pile: Pile) {
        pile.push(card);
        yield DelayHint.OneByOne;
    }

    private getCardValue_Rank(rank: Rank) {
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
        return this.getCardValue_Rank(card.rank);
    }

    private getRelativeFoundationValue_(card: Card) {
        if (this.masterRank_ === Rank.None) return 0;
        const masterVal = this.getCardValue_Rank(this.masterRank_);
        const cardVal = this.getCardValue_(card);
        return (cardVal - masterVal + 13) % 13;
    }

    private *doAutoMoves_() {
        mainLoop: while (true) {
            if (this.options.autoReveal) {
                for (const tableau of this.tableaux) {
                    const card = tableau.peek();
                    if (card && !card.faceUp) {
                        card.faceUp = true;
                        yield DelayHint.OneByOne;
                        continue mainLoop;
                    }
                }
            }

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

                const autoMoveSources = [...this.tableaux, ...this.leftovers];

                for (const pile of autoMoveSources) {
                    const card = pile.peek();
                    if (card && card.faceUp && this.getRelativeFoundationValue_(card) <= foundationMin + this.options.autoMoveToFoundation) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(card, foundation)) {
                                yield* this.doFoundationDrop_(card, foundation);
                                continue mainLoop;
                            }
                        }
                    }
                }
            }

            break;
        }
    }
}
