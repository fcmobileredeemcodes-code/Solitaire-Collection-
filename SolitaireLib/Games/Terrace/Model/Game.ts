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
    public readonly stock = new Pile(this);
    public readonly waste = new Pile(this);
    public readonly reserve = new Pile(this);
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    private baseRank_: Rank = Rank.None;

    constructor(options: GameOptions) {
        super();
        this.options = options;

        // Register piles in layout/logical order:
        this.piles.push(this.stock);
        this.piles.push(this.waste);
        this.piles.push(this.reserve);

        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        for (let i = 0; i < 9; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Two standard 52-card decks shuffled together
        this.cards = [
            ...DeckUtils.createStandard52Deck(this.stock),
            ...DeckUtils.createStandard52Deck(this.stock),
        ];
    }

    protected doGetWon_() {
        let sum = 0;
        for (const pile of this.foundations) {
            sum += pile.length;
        }
        return sum === 104;
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
        this.baseRank_ = Rank.None;

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

        // Deal 11 cards face up in an overlapping row to form a reserve
        for (let i = 0; i < 11; ++i) {
            const card = this.stock.peek();
            if (card) {
                this.reserve.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        // Deal 3 cards face up, one to each of the first 3 tableaux piles
        for (let i = 0; i < 3; ++i) {
            const card = this.stock.peek();
            if (card) {
                const tableau = this.tableaux[i] ?? Debug.error();
                tableau.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;
    }

    private *chooseBaseRank_(card: Card) {
        this.baseRank_ = card.rank;
        const firstFoundation = this.foundations[0] ?? Debug.error();
        firstFoundation.push(card);
        yield DelayHint.OneByOne;

        // Deal 1 card face up onto each of the remaining empty tableau piles (7 total)
        for (const tableau of this.tableaux) {
            if (tableau.length === 0) {
                const stockCard = this.stock.peek();
                if (stockCard) {
                    tableau.push(stockCard);
                    stockCard.faceUp = true;
                    yield DelayHint.Quick;
                }
            }
        }

        yield DelayHint.OneByOne;
        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        if (this.baseRank_ === Rank.None) {
            const idx = this.tableaux.indexOf(card.pile);
            if (idx >= 0 && idx < 3 && card.pile.peek() === card) {
                yield* this.chooseBaseRank_(card);
            }
            return;
        }

        if (card.pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *cardSecondary_(card: Card) {
        if (this.baseRank_ === Rank.None) {
            const idx = this.tableaux.indexOf(card.pile);
            if (idx >= 0 && idx < 3 && card.pile.peek() === card) {
                yield* this.chooseBaseRank_(card);
            }
            return;
        }

        if (card.faceUp && card.pile.peek() === card) {
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

    protected *pilePrimary_(pile: Pile) {
        if (this.baseRank_ === Rank.None) {
            return;
        }

        if (pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.baseRank_ === Rank.None) {
            const idx = this.tableaux.indexOf(card.pile);
            if (idx >= 0 && idx < 3 && card.pile.peek() === card) {
                return { canDrag: true, extraCards: [] };
            }
            return { canDrag: false, extraCards: [] };
        }

        // Only the top card of tableaux, reserve, or waste can be dragged, and only single cards.
        const isTop = card.pile.peek() === card;
        if (isTop && card.faceUp) {
            if (
                this.tableaux.indexOf(card.pile) >= 0 ||
                card.pile === this.reserve ||
                card.pile === this.waste
            ) {
                return { canDrag: true, extraCards: [] };
            }
        }
        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        if (this.baseRank_ === Rank.None) {
            return pile === (this.foundations[0] ?? Debug.error());
        }
        return this.isTableauxDrop_(card, pile) || this.isFoundationDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.baseRank_ === Rank.None) {
            if (pile === (this.foundations[0] ?? Debug.error())) {
                yield* this.chooseBaseRank_(card);
            }
            return;
        }

        if (this.isTableauxDrop_(card, pile)) {
            pile.push(card);
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        } else if (this.isFoundationDrop_(card, pile)) {
            pile.push(card);
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        }
    }

    private canDrawFromStock_() {
        return this.stock.length > 0;
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

    private isTableauxDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) >= 0) {
            const topCard = pile.peek();
            if (topCard) {
                // Tableaus build down in sequence and alternating colors, wrapping (Ace to King)
                const valA = this.getCardValue_(topCard);
                const valB = this.getCardValue_(card);
                const expectedVal = valA === 1 ? 13 : valA - 1;
                if (card.colour !== topCard.colour && valB === expectedVal) {
                    return true;
                }
            } else {
                // Empty spaces in tableau can be filled with any card if stock/waste are empty
                return true;
            }
        }
        return false;
    }

    private isFoundationDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (this.foundations.indexOf(pile) >= 0) {
            const topCard = pile.peek();
            if (topCard) {
                // Foundations build up in alternating colors, wrapping (King to Ace)
                const valA = this.getCardValue_(topCard);
                const valB = this.getCardValue_(card);
                const expectedVal = (valA % 13) + 1;
                if (card.colour !== topCard.colour && valB === expectedVal) {
                    return true;
                }
            } else {
                // Empty foundations must start with the base rank
                if (card.rank === this.baseRank_) {
                    return true;
                }
            }
        }
        return false;
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
        if (this.baseRank_ === Rank.None) return 0;
        const baseVal = this.getCardValue_Rank(this.baseRank_);
        const cardVal = this.getCardValue_(card);
        return (cardVal - baseVal + 13) % 13;
    }

    private *doAutoMoves_() {
        mainLoop: while (true) {
            if (this.baseRank_ === Rank.None) {
                break;
            }

            // Immediately refill empty tableau columns with a card from waste, or stock if waste is empty.
            for (const tableau of this.tableaux) {
                if (tableau.length === 0) {
                    if (this.waste.length > 0) {
                        const card = this.waste.peek();
                        if (card) {
                            tableau.push(card);
                            card.faceUp = true;
                            yield DelayHint.Quick;
                            continue mainLoop;
                        }
                    } else if (this.stock.length > 0) {
                        const card = this.stock.peek();
                        if (card) {
                            tableau.push(card);
                            card.faceUp = true;
                            yield DelayHint.Quick;
                            continue mainLoop;
                        }
                    }
                }
            }

            // Automatically turn stock over to waste if waste is empty
            if (this.options.autoPlayStock) {
                if (this.waste.length === 0 && this.stock.length > 0) {
                    yield* this.doDrawFromStock_();
                    continue mainLoop;
                }
            }

            // Auto play to foundations
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

                const autoMoveSources = [...this.tableaux, this.reserve, this.waste];
                for (const pile of autoMoveSources) {
                    const card = pile.peek();
                    if (card && card.faceUp && this.getRelativeFoundationValue_(card) <= foundationMin + this.options.autoMoveToFoundation) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(card, foundation)) {
                                foundation.push(card);
                                yield DelayHint.OneByOne;
                                continue mainLoop;
                            }
                        }
                    }
                }
            }

            break;
        }
    }

    public override deserialize(json: string): boolean {
        const success = super.deserialize(json);
        if (success) {
            const firstFoundation = this.foundations[0] ?? Debug.error();
            if (firstFoundation.length > 0) {
                this.baseRank_ = firstFoundation.at(0).rank;
            } else {
                this.baseRank_ = Rank.None;
            }
        }
        return success;
    }
}
