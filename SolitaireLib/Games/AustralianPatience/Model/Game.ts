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
    public readonly waste = new Pile(this);
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    constructor(options: GameOptions) {
        super();

        this.options = options;
        this.piles.push(this.stock);
        this.piles.push(this.waste);

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
        const tempPile = new Pile(this);

        // Gather all cards back to the temporary pile
        for (const pile of this.piles) {
            for (let i = pile.length; i-- > 0; ) {
                const card = pile.at(i);
                card.faceUp = false;
                tempPile.push(card);
            }
        }

        for (const card of tempPile) {
            card.faceUp = false;
        }

        tempPile.sort();
        tempPile.shuffle(rng);

        this.waste.maxFan = 0;

        yield DelayHint.Settle;

        // Deal 7 tableau columns of exactly 4 cards each, all face up (28 cards dealt)
        for (let i = 0; i < TABLEAUX_COUNT; ++i) {
            const pile = this.tableaux[i] ?? Debug.error();
            for (let j = 0; j < 4; ++j) {
                const card = tempPile.peek();
                if (card) {
                    card.faceUp = true;
                    pile.push(card);
                    yield DelayHint.Quick;
                }
            }
        }

        // The remaining 24 cards form the stock.
        while (tempPile.length > 0) {
            const card = tempPile.peek();
            if (card) {
                card.faceUp = false;
                this.stock.push(card);
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // If the player clicks on the top card of the stock, draw a card to the waste:
        if (this.stock.peek() === card && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *cardSecondary_(card: Card) {
        // If the player double clicks a card, see if it can be auto-moved to the foundation:
        if (card.pile.peek() === card && card.faceUp) {
            for (const foundation of this.foundations) {
                if (this.isFoundationDrop_(card, foundation)) {
                    const sourcePile = card.pile;
                    foundation.push(card);
                    if (sourcePile === this.waste) {
                        this.waste.maxFan = Math.max(0, this.waste.maxFan - 1);
                    }
                    yield DelayHint.OneByOne;
                    yield* this.doAutoMoves_();
                    return;
                }
            }
        }
    }

    protected *pilePrimary_(pile: Pile) {
        // Click on empty stock does nothing since there is NO redeal.
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (!card.faceUp) return { canDrag: false, extraCards: [] };

        if (this.tableaux.indexOf(card.pile) >= 0) {
            // Yukon/Scorpion style rule: any face-up card along with everything covering it can be dragged together
            return { canDrag: true, extraCards: card.pile.slice(card.pileIndex + 1) };
        } else if (this.foundations.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card) {
                return { canDrag: true, extraCards: [] };
            }
        } else if (card.pile === this.waste) {
            if (this.waste.peek() === card) {
                return { canDrag: true, extraCards: [] };
            }
        }

        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        return this.isTableauxDrop_(card, pile) || this.isFoundationDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.previewDrop_(card, pile)) {
            const sourcePile = card.pile;
            const movingCards = [card, ...this.canDrag_(card).extraCards];
            for (const movingCard of movingCards) {
                pile.push(movingCard);
            }
            if (sourcePile === this.waste) {
                this.waste.maxFan = Math.max(0, this.waste.maxFan - 1);
            }
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        }
    }

    private canDrawFromStock_() {
        return this.stock.length > 0;
    }

    private *doDrawFromStock_() {
        this.waste.maxFan = 0;
        const card = this.stock.peek();
        if (card) {
            this.waste.push(card);
            this.waste.maxFan = 1;
            card.faceUp = true;
            yield DelayHint.Quick;
        }
        yield DelayHint.OneByOne;
    }

    private isTableauxDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag) return false;

        const topCard = pile.peek();
        if (topCard) {
            // Tableau columns build down strictly by suit
            return topCard.suit === card.suit && this.getCardValue_(topCard) === this.getCardValue_(card) + 1;
        } else {
            // Empty columns may be filled by a King, or sequence headed by a King
            return card.rank === Rank.King;
        }
    }

    private isFoundationDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (this.foundations.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag || dragResult.extraCards.length > 0) return false;

        const topCard = pile.peek();
        if (topCard) {
            // Foundations build up by suit, Ace to King
            return topCard.suit === card.suit && this.getCardValue_(topCard) + 1 === this.getCardValue_(card);
        } else {
            // Empty foundation starts with an Ace
            return card.rank === Rank.Ace;
        }
    }

    private getCardValue_(card: Card) {
        switch (card.rank) {
            case Rank.Ace:
                return 1;
            case Rank.Two:
                return 2;
            case Rank.Three:
                return 3;
            case Rank.Four:
                return 4;
            case Rank.Five:
                return 5;
            case Rank.Six:
                return 6;
            case Rank.Seven:
                return 7;
            case Rank.Eight:
                return 8;
            case Rank.Nine:
                return 9;
            case Rank.Ten:
                return 10;
            case Rank.Jack:
                return 11;
            case Rank.Queen:
                return 12;
            case Rank.King:
                return 13;
            default:
                Debug.error();
        }
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
                        foundationMin = Math.min(foundationMin, this.getCardValue_(card));
                    } else {
                        foundationMin = Math.min(foundationMin, 0);
                    }
                }

                const sources = [this.waste, ...this.tableaux];
                for (const pile of sources) {
                    const card = pile.peek();
                    if (card && card.faceUp && this.getCardValue_(card) <= foundationMin + this.options.autoMoveToFoundation) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(card, foundation)) {
                                const sourcePile = card.pile;
                                foundation.push(card);
                                if (sourcePile === this.waste) {
                                    this.waste.maxFan = Math.max(0, this.waste.maxFan - 1);
                                }
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
}
