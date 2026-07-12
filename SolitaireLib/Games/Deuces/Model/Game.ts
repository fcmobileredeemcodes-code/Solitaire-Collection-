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

export function getNextFoundationRank(rank: Rank): Rank {
    switch (rank) {
        case Rank.Two: return Rank.Three;
        case Rank.Three: return Rank.Four;
        case Rank.Four: return Rank.Five;
        case Rank.Five: return Rank.Six;
        case Rank.Six: return Rank.Seven;
        case Rank.Seven: return Rank.Eight;
        case Rank.Eight: return Rank.Nine;
        case Rank.Nine: return Rank.Ten;
        case Rank.Ten: return Rank.Jack;
        case Rank.Jack: return Rank.Queen;
        case Rank.Queen: return Rank.King;
        case Rank.King: return Rank.Ace;
        default: return Rank.None;
    }
}

export function getPrevTableauRank(rank: Rank): Rank {
    switch (rank) {
        case Rank.Three: return Rank.Two;
        case Rank.Two: return Rank.Ace;
        case Rank.Ace: return Rank.King;
        case Rank.King: return Rank.Queen;
        case Rank.Queen: return Rank.Jack;
        case Rank.Jack: return Rank.Ten;
        case Rank.Ten: return Rank.Nine;
        case Rank.Nine: return Rank.Eight;
        case Rank.Eight: return Rank.Seven;
        case Rank.Seven: return Rank.Six;
        case Rank.Six: return Rank.Five;
        case Rank.Five: return Rank.Four;
        case Rank.Four: return Rank.Three;
        default: return Rank.None;
    }
}

export function getDeucesValue(rank: Rank): number {
    switch (rank) {
        case Rank.Two: return 1;
        case Rank.Three: return 2;
        case Rank.Four: return 3;
        case Rank.Five: return 4;
        case Rank.Six: return 5;
        case Rank.Seven: return 6;
        case Rank.Eight: return 7;
        case Rank.Nine: return 8;
        case Rank.Ten: return 9;
        case Rank.Jack: return 10;
        case Rank.Queen: return 11;
        case Rank.King: return 12;
        case Rank.Ace: return 13;
        default: return 0;
    }
}

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;
    public readonly stock = new Pile(this);
    public readonly waste = new Pile(this);
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    private readonly dragSingleSources_: Pile[] = [];
    private readonly autoMoveSources_: Pile[] = [];

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Register piles in exact layout order (indices 0 to 19):
        // Stacks 0 to 9: Tableau piles
        for (let i = 0; i < 10; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
            this.autoMoveSources_.push(pile);
        }

        // Stacks 10 to 17: Foundation piles
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
            this.dragSingleSources_.push(pile);
        }

        // Stack 18: Discard/Waste pile
        this.piles.push(this.waste);
        this.dragSingleSources_.push(this.waste);
        this.autoMoveSources_.push(this.waste);

        // Stack 19: Stock/Main pile
        this.piles.push(this.stock);

        // Cards: 2 standard 52 decks (104 cards total)
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
            const aVal = getDeucesValue(a.rank);
            const bVal = getDeucesValue(b.rank);
            if (aVal > bVal) return 1;
            if (aVal < bVal) return -1;
            return 0;
        });
        return wonCards;
    }

    protected *restart_(rng: prand.RandomGenerator) {
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

        // Sort stock and then shuffle deterministically
        this.stock.sort();
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Separate the 8 Twos (2s) from the combined decks and place them face up as the 8 foundations.
        // We use a new, unregistered Pile as a temporary container to avoid unexpected pile mutation and dealing errors.
        const tempPile = new Pile(this);
        while (this.stock.length > 0) {
            const card = this.stock.peek()!;
            if (card.rank === Rank.Two) {
                let placed = false;
                for (const foundation of this.foundations) {
                    if (foundation.length === 0) {
                        foundation.push(card);
                        card.faceUp = true;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    tempPile.push(card);
                }
            } else {
                tempPile.push(card);
            }
        }

        // Return remaining cards back to the stock
        while (tempPile.length > 0) {
            const card = tempPile.peek()!;
            this.stock.push(card);
        }

        // Deal 10 tableau piles with 1 card each, all face up.
        for (let i = 0; i < 10; ++i) {
            const card = this.stock.peek();
            if (card) {
                const pile = this.tableaux[i] ?? Debug.error();
                pile.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // click stock to draw 1 card to waste
        if (this.stock.peek() === card && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *cardSecondary_(card: Card) {
        // double click card: see if it can be auto-moved to a foundation
        if (card.pile.peek() === card && card.faceUp) {
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
        // click stock when not empty to draw card
        if (pile === this.stock && this.stock.length > 0) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.isTableauxDropSource_(card)) {
            return { canDrag: true, extraCards: card.pile.slice(card.pileIndex + 1) };
        } else if (
            (card.pile === this.waste || this.foundations.indexOf(card.pile) >= 0) &&
            card.pile.peek() === card &&
            card.faceUp
        ) {
            return { canDrag: true, extraCards: [] };
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
        if (this.tableaux.indexOf(pile) < 0) return false;

        const topCard = pile.peek();
        if (topCard) {
            if (getPrevTableauRank(topCard.rank) === card.rank && topCard.suit === card.suit) {
                return true;
            }
        } else {
            // An empty tableau. Although auto-move refills empty tableaus immediately, returning true is correct and safe.
            return true;
        }
        return false;
    }

    private isTableauxDropSource_(card: Card) {
        const pile = card.pile;
        if (this.tableaux.indexOf(pile) < 0) return false;
        if (!card.faceUp) return false;

        // Check if all cards from `card` to the top of the pile form a valid built-down same-suit sequence
        for (let i = card.pileIndex; i < pile.length - 1; ++i) {
            const current = pile.at(i);
            const next = pile.at(i + 1);
            if (!current.faceUp || !next.faceUp) return false;
            if (current.suit !== next.suit) return false;
            if (getPrevTableauRank(current.rank) !== next.rank) return false;
        }

        return true;
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
        if (this.foundations.indexOf(pile) < 0) return false;

        // Only single cards can be placed onto foundations
        if (card.pile.peek() !== card) return false;

        const topCard = pile.peek();
        if (topCard) {
            if (getNextFoundationRank(topCard.rank) === card.rank && topCard.suit === card.suit) {
                return true;
            }
        } else {
            // Foundations are initialized with Twos, but if one gets cleared somehow, a Two can be placed.
            if (card.rank === Rank.Two) {
                return true;
            }
        }
        return false;
    }

    private *doFoundationDrop_(card: Card, pile: Pile) {
        pile.push(card);
        yield DelayHint.OneByOne;
    }

    private *doAutoMoves_() {
        mainLoop: while (true) {
            // 1. Refill any empty tableau piles from top of waste or stock (waste is preferred)
            for (const tableau of this.tableaux) {
                if (tableau.length === 0) {
                    const wasteCard = this.waste.peek();
                    if (wasteCard) {
                        tableau.push(wasteCard);
                        wasteCard.faceUp = true;
                        yield DelayHint.Quick;
                        continue mainLoop;
                    } else {
                        const stockCard = this.stock.peek();
                        if (stockCard) {
                            tableau.push(stockCard);
                            stockCard.faceUp = true;
                            yield DelayHint.Quick;
                            continue mainLoop;
                        }
                    }
                }
            }

            // 2. Auto-reveal any facedown cards at the top of tableaux (all are initially face-up in Deuces, but good for completeness)
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

            // 3. Auto-play cards to foundations if enabled
            if (this.options.autoMoveToFoundation > 0) {
                let foundationMinVal = 999;
                for (const pile of this.foundations) {
                    const card = pile.peek();
                    if (card) {
                        foundationMinVal = Math.min(foundationMinVal, getDeucesValue(card.rank));
                    } else {
                        foundationMinVal = Math.min(foundationMinVal, 0);
                    }
                }

                for (const pile of this.autoMoveSources_) {
                    const card = pile.peek();
                    if (card && getDeucesValue(card.rank) <= foundationMinVal + this.options.autoMoveToFoundation) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(card, foundation)) {
                                yield* this.doFoundationDrop_(card, foundation);
                                continue mainLoop;
                            }
                        }
                    }
                }
            }

            // 4. Draw from stock if waste is empty
            if (this.options.autoPlayStock) {
                if (this.waste.length === 0 && this.canDrawFromStock_()) {
                    yield* this.doDrawFromStock_();
                    continue mainLoop;
                }
            }

            break;
        }
    }
}
