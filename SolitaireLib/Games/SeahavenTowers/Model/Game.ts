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
    public readonly freecells: Pile[] = [];
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Tableaux 0 to 9
        for (let i = 0; i < 10; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Freecells 10 to 13
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.freecells.push(pile);
            this.piles.push(pile);
        }

        // Foundations 14 to 17
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Create standard 52-card deck
        this.cards = DeckUtils.createStandard52Deck(this.tableaux[0] ?? Debug.error());
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
                card.faceUp = true;
                tempPile.push(card);
            }
        }

        for (const card of tempPile) {
            card.faceUp = true;
        }

        tempPile.sort();
        tempPile.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 5 cards face up to each of the 10 tableau piles (total 50 cards)
        for (let i = 0; i < 5; ++i) {
            for (let j = 0; j < 10; ++j) {
                const destTableau = this.tableaux[j] ?? Debug.error();
                const card = tempPile.peek();
                if (card) {
                    destTableau.push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                }
            }
        }

        // The remaining 2 cards of the deck are dealt into freecells[1] and freecells[2]
        for (const idx of [1, 2]) {
            const destCell = this.freecells[idx] ?? Debug.error();
            const card = tempPile.peek();
            if (card) {
                destCell.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {}

    protected *cardSecondary_(card: Card) {
        // Double-click -> auto-move to foundations
        for (const foundation of this.foundations) {
            if (this.isFoundationDrop_(card, foundation)) {
                foundation.push(card);
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
                return;
            }
        }
    }

    protected *pilePrimary_(pile: Pile) {}

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (!card.faceUp) return { canDrag: false, extraCards: [] };

        if (this.freecells.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card) {
                return { canDrag: true, extraCards: [] };
            }
        } else if (this.tableaux.indexOf(card.pile) >= 0) {
            const sequence = card.pile.slice(card.pileIndex);
            if (this.isValidSequence_(sequence)) {
                return { canDrag: true, extraCards: sequence.slice(1) };
            }
        }

        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        return this.isTableauDrop_(card, pile) || this.isFoundationDrop_(card, pile) || this.isFreecellDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.previewDrop_(card, pile)) {
            const movingCards = [card, ...this.canDrag_(card).extraCards];
            for (const movingCard of movingCards) {
                pile.push(movingCard);
            }
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        }
    }

    private isValidSequence_(cards: Card[]): boolean {
        for (let i = 0; i < cards.length - 1; ++i) {
            const c1 = cards[i] ?? Debug.error();
            const c2 = cards[i + 1] ?? Debug.error();
            if (c1.suit !== c2.suit || this.getCardValue_(c1) !== this.getCardValue_(c2) + 1) {
                return false;
            }
        }
        return true;
    }

    private isFoundationDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.foundations.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag || dragResult.extraCards.length > 0) return false;

        const topCard = pile.peek();
        if (topCard) {
            return this.getCardValue_(topCard) + 1 === this.getCardValue_(card) && topCard.suit === card.suit;
        } else {
            return card.rank === Rank.Ace;
        }
    }

    private isFreecellDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.freecells.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag || dragResult.extraCards.length > 0) return false;

        return pile.length === 0;
    }

    private isTableauDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag) return false;

        const sequenceLength = 1 + dragResult.extraCards.length;

        let emptyFreeCells = 0;
        for (const fc of this.freecells) {
            if (fc.length === 0) emptyFreeCells++;
        }

        const maxMove = 1 + emptyFreeCells;
        if (sequenceLength > maxMove) return false;

        const topCard = pile.peek();
        if (topCard) {
            return topCard.suit === card.suit && this.getCardValue_(topCard) === this.getCardValue_(card) + 1;
        } else {
            return card.rank === Rank.King;
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

                const sources = [...this.tableaux, ...this.freecells];
                for (const pile of sources) {
                    const card = pile.peek();
                    if (card && this.getCardValue_(card) <= foundationMin + this.options.autoMoveToFoundation) {
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
}
