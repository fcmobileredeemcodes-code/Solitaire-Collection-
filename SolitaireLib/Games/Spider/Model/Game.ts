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
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Register piles in layout order:
        // Tableau piles (indices 0 to 9)
        for (let i = 0; i < 10; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Foundation piles (indices 10 to 17)
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Stock pile (index 18)
        this.piles.push(this.stock);

        // Cards: 2 standard 52 decks (104 cards total)
        this.cards = [
            ...DeckUtils.createStandard52Deck(this.stock),
            ...DeckUtils.createStandard52Deck(this.stock),
        ];
    }

    protected doGetWon_() {
        // Won when all 104 cards are sorted into the foundations
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
        // Reset all cards to stock face-down:
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

        // Sort and shuffle the stock:
        this.stock.sort();
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 54 cards: 6 cards each to first 4, 5 cards each to remaining 6 columns
        for (let i = 0; i < 10; ++i) {
            const pile = this.tableaux[i] ?? Debug.error();
            const count = i < 4 ? 6 : 5;
            for (let j = 0; j < count; ++j) {
                const card = this.stock.peek();
                if (card) {
                    card.faceUp = (j === count - 1);
                    pile.push(card);
                    yield DelayHint.Quick;
                }
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // Clicking stock deals 1 card face up to each column
        if (card.pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }

        // Clicking top face-down card reveals it
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card && !card.faceUp) {
                card.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
                return;
            }
        }
    }

    protected *cardSecondary_(card: Card) {}

    protected *pilePrimary_(pile: Pile) {
        // Clicking stock deals 1 card face up to each column
        if (pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (this.isSameSuitSequence_(card)) {
                return { canDrag: true, extraCards: card.pile.slice(card.pileIndex + 1) };
            }
        }
        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        return this.isTableauxDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.isTableauxDrop_(card, pile)) {
            yield* this.doTableauxDrop_(card, pile);
            yield* this.doAutoMoves_();
        }
    }

    private canDrawFromStock_() {
        if (this.stock.length === 0) return false;
        return this.tableaux.every(tableau => tableau.length > 0);
    }

    private *doDrawFromStock_() {
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
    }

    private isTableauxDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) < 0) return false;
        if (!this.isSameSuitSequence_(card)) return false;

        const topCard = pile.peek();
        if (topCard) {
            // Tableaux build down regardless of suit
            if (this.getCardValue_(topCard) === this.getCardValue_(card) + 1) {
                return true;
            }
        } else {
            // Empty tableau slots can be filled by any card/sequence
            return true;
        }

        return false;
    }

    private isSameSuitSequence_(card: Card): boolean {
        if (!card.faceUp) return false;
        const pile = card.pile;
        if (this.tableaux.indexOf(pile) < 0) return false;
        for (let i = card.pileIndex; i < pile.length - 1; ++i) {
            const card0 = pile.at(i);
            const card1 = pile.at(i + 1);
            if (!card0.faceUp || !card1.faceUp) return false;
            if (card0.suit !== card1.suit) return false;
            if (this.getCardValue_(card0) !== this.getCardValue_(card1) + 1) return false;
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

    private findCompleteSequenceIndex_(tableau: Pile): number {
        if (tableau.length < 13) return -1;
        const startIdx = tableau.length - 13;
        const startCard = tableau.at(startIdx);
        if (!startCard || !startCard.faceUp || startCard.rank !== Rank.King) {
            return -1;
        }
        const suit = startCard.suit;
        for (let i = 0; i < 13; ++i) {
            const card = tableau.at(startIdx + i);
            if (!card || !card.faceUp || card.suit !== suit || this.getCardValue_(card) !== 13 - i) {
                return -1;
            }
        }
        return startIdx;
    }

    private findEmptyFoundation_(): Pile | undefined {
        for (const foundation of this.foundations) {
            if (foundation.length === 0) {
                return foundation;
            }
        }
        return undefined;
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

            // Automove completed sequences to foundation
            for (const tableau of this.tableaux) {
                const seqStartIdx = this.findCompleteSequenceIndex_(tableau);
                if (seqStartIdx >= 0) {
                    const foundation = this.findEmptyFoundation_();
                    if (foundation) {
                        const movingCards = tableau.slice(seqStartIdx);
                        for (const card of movingCards) {
                            foundation.push(card);
                        }
                        yield DelayHint.OneByOne;
                        continue mainLoop;
                    }
                }
            }

            break;
        }
    }
}
