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
    public readonly reserves: Pile[] = [];
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    private baseRank_ = Rank.None;
    private restocks_ = 0;

    constructor(options: GameOptions) {
        super();
        this.options = options;

        // Register piles in layout/logical order:
        this.piles.push(this.stock);
        this.piles.push(this.waste);

        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.reserves.push(pile);
            this.piles.push(pile);
        }

        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        for (let i = 0; i < 4; ++i) {
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
        this.baseRank_ = Rank.None;
        this.restocks_ = 0;

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

        // Deal 4 reserve piles of 3 cards each, face up
        for (let i = 0; i < 4; ++i) {
            const pile = this.reserves[i] ?? Debug.error();
            for (let j = 0; j < 3; ++j) {
                const card = this.stock.peek();
                if (card) {
                    pile.push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                }
            }
        }

        // Deal 4 tableau piles of 1 card each, face up
        for (let i = 0; i < 4; ++i) {
            const pile = this.tableaux[i] ?? Debug.error();
            const card = this.stock.peek();
            if (card) {
                pile.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;
    }

    private *chooseBaseRank_(card: Card, foundation: Pile) {
        this.baseRank_ = card.rank;
        foundation.push(card);
        yield DelayHint.OneByOne;
        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        if (this.baseRank_ === Rank.None) {
            // First move is mandatory: place any reserve top card to foundation
            if (this.reserves.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
                const emptyFoundation = this.foundations.find(f => f.length === 0);
                if (emptyFoundation) {
                    yield* this.chooseBaseRank_(card, emptyFoundation);
                }
            }
            return;
        }

        if (card.pile === this.stock && this.stock.length > 0) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *cardSecondary_(card: Card) {
        if (this.baseRank_ === Rank.None) {
            if (this.reserves.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
                const emptyFoundation = this.foundations.find(f => f.length === 0);
                if (emptyFoundation) {
                    yield* this.chooseBaseRank_(card, emptyFoundation);
                }
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

        // click stock to deal or redeal
        if (pile === this.stock) {
            if (this.stock.length > 0) {
                yield* this.doDrawFromStock_();
                yield* this.doAutoMoves_();
            } else if (this.waste.length > 0 && this.restocks_ < 1) {
                this.restocks_++;
                for (let i = this.waste.length; i-- > 0; ) {
                    this.waste.at(i).faceUp = false;
                }
                yield DelayHint.OneByOne;
                for (let i = this.waste.length; i-- > 0; ) {
                    const card = this.waste.at(i);
                    this.stock.push(card);
                }
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
            }
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.baseRank_ === Rank.None) {
            // first move is mandatory: take top card of any reserve and place on empty foundation
            if (this.reserves.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
                return { canDrag: true, extraCards: [] };
            }
            return { canDrag: false, extraCards: [] };
        }

        if (!card.faceUp) {
            return { canDrag: false, extraCards: [] };
        }

        if (this.reserves.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            return { canDrag: true, extraCards: [] };
        }

        if (card.pile === this.waste && this.waste.peek() === card) {
            return { canDrag: true, extraCards: [] };
        }

        if (this.foundations.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            return { canDrag: true, extraCards: [] };
        }

        if (this.tableaux.indexOf(card.pile) >= 0) {
            const idx = card.pileIndex;
            const remaining = card.pile.slice(idx);
            if (this.isTableauxSequence_(remaining)) {
                return { canDrag: true, extraCards: card.pile.slice(idx + 1) };
            }
        }

        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        if (this.baseRank_ === Rank.None) {
            // first move: any reserve top card to empty foundation
            return this.reserves.indexOf(card.pile) >= 0 &&
                card.pile.peek() === card &&
                this.foundations.indexOf(pile) >= 0 &&
                pile.length === 0;
        }

        return this.isTableauxDrop_(card, pile) || this.isFoundationDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.baseRank_ === Rank.None) {
            if (this.foundations.indexOf(pile) >= 0 && pile.length === 0) {
                yield* this.chooseBaseRank_(card, pile);
            }
            return;
        }

        if (this.isTableauxDrop_(card, pile)) {
            const moving = card.pile.slice(card.pileIndex);
            for (const c of moving) {
                pile.push(c);
            }
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        } else if (this.isFoundationDrop_(card, pile)) {
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

    private isTableauxSequence_(cards: Card[]): boolean {
        for (let i = 0; i < cards.length - 1; ++i) {
            const card0 = cards[i] ?? Debug.error();
            const card1 = cards[i + 1] ?? Debug.error();
            if (card0.colour === card1.colour) {
                return false;
            }
            const topVal = this.getCardValue_(card0);
            const cardVal = this.getCardValue_(card1);
            const isWrap = (topVal === 1 && cardVal === 13) || (topVal === 13 && cardVal === 1);
            if (cardVal !== topVal - 1 && !isWrap) {
                return false;
            }
        }
        return true;
    }

    private isTableauxDropSource_(card: Card) {
        if (!card.faceUp) return false;
        if (this.reserves.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            return true;
        }
        if (card.pile === this.waste && this.waste.peek() === card) {
            return true;
        }
        if (this.foundations.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            return true;
        }
        if (this.tableaux.indexOf(card.pile) >= 0) {
            const idx = card.pileIndex;
            const remaining = card.pile.slice(idx);
            return this.isTableauxSequence_(remaining);
        }
        return false;
    }

    private isTableauxDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (!this.isTableauxDropSource_(card)) return false;

        if (this.tableaux.indexOf(pile) >= 0) {
            const topCard = pile.peek();
            if (topCard) {
                const topVal = this.getCardValue_(topCard);
                const cardVal = this.getCardValue_(card);
                const isWrap = (topVal === 1 && cardVal === 13) || (topVal === 13 && cardVal === 1);
                if (card.colour !== topCard.colour && (cardVal === topVal - 1 || isWrap)) {
                    return true;
                }
            } else {
                // Empty tableau: filled from reserve top first, then once all reserves are empty, any card
                const hasReserve = this.reserves.some(r => r.length > 0);
                if (hasReserve) {
                    return this.reserves.indexOf(card.pile) >= 0 && card.pile.peek() === card;
                } else {
                    // filled from waste or another tableau
                    return card.pile === this.waste || this.tableaux.indexOf(card.pile) >= 0;
                }
            }
        }
        return false;
    }

    private isFoundationDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (!card.faceUp || card.pile.peek() !== card) return false;

        if (this.foundations.indexOf(pile) >= 0) {
            const topCard = pile.peek();
            if (topCard) {
                const topVal = this.getCardValue_(topCard);
                const cardVal = this.getCardValue_(card);
                if (cardVal === (topVal % 13) + 1 && card.suit === topCard.suit) {
                    return true;
                }
            } else {
                if (this.baseRank_ !== Rank.None && card.rank === this.baseRank_) {
                    return true;
                }
            }
        }
        return false;
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
        if (this.baseRank_ === Rank.None) return 0;
        const baseVal = this.getRankValue_(this.baseRank_);
        const cardVal = this.getCardValue_(card);
        return (cardVal - baseVal + 13) % 13;
    }

    private *doAutoMoves_() {
        mainLoop: while (true) {
            if (this.baseRank_ === Rank.None) {
                break;
            }

            // Immediately refill empty tableau columns from reserves
            for (const tableau of this.tableaux) {
                if (tableau.length === 0) {
                    for (const reserve of this.reserves) {
                        const card = reserve.peek();
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

                const autoMoveSources = [...this.tableaux, ...this.reserves, this.waste];
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
            this.baseRank_ = Rank.None;
            for (const pile of this.foundations) {
                if (pile.length > 0) {
                    this.baseRank_ = pile.at(0).rank;
                    break;
                }
            }
        }
        return success;
    }
}
