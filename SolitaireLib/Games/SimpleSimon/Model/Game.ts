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
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Register 10 tableaux piles
        for (let i = 0; i < 10; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Register 4 foundation piles
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Initialize cards
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
        const tempPile = this.tableaux[0] ?? Debug.error();

        // Gather all cards back to the temporary pile
        for (const pile of this.piles) {
            if (pile === tempPile) continue;
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

        // Deal cards to starting tableaux layout:
        // First 3 columns get 8 cards each, then 7, 6, 5, 4, 3, 2, 1
        const counts = [8, 8, 8, 7, 6, 5, 4, 3, 2, 1];
        for (let col = 0; col < 10; ++col) {
            const destTableau = this.tableaux[col] ?? Debug.error();
            const cardCount = counts[col] ?? Debug.error();
            for (let j = 0; j < cardCount; ++j) {
                const card = tempPile.peek();
                if (card) {
                    destTableau.push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                }
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {}

    protected *cardSecondary_(card: Card) {}

    protected *pilePrimary_(pile: Pile) {}

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (!card.faceUp) return { canDrag: false, extraCards: [] };

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
            const movingCards = [card, ...this.canDrag_(card).extraCards];
            for (const movingCard of movingCards) {
                pile.push(movingCard);
            }
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        }
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

    private isTableauxDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) < 0) return false;
        if (!this.isSameSuitSequence_(card)) return false;

        const topCard = pile.peek();
        if (topCard) {
            if (this.getCardValue_(topCard) === this.getCardValue_(card) + 1) {
                return true;
            }
        } else {
            return true;
        }

        return false;
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
