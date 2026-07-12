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
    public readonly flippers: Pile[] = [];
    public readonly foundations: Pile[] = [];
    public readonly tableaux: Pile[] = [];

    public get beakRank(): Rank {
        // 1. Check bottom of column 0
        const bottomCard = this.tableaux[0]?.at(0);
        if (bottomCard) {
            return bottomCard.rank;
        }
        // 2. Otherwise, check the bottom of any non-empty foundation
        for (const foundation of this.foundations) {
            const firstCard = foundation.at(0);
            if (firstCard) {
                return firstCard.rank;
            }
        }
        // Fallback (should not happen in a valid game)
        return Rank.None;
    }

    constructor(options: GameOptions) {
        super();
        this.options = options;

        // Register piles in exact layout order
        // 7 Tableau columns: indices 0 to 6
        for (let i = 0; i < 7; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // 7 Flipper cells: indices 7 to 13
        for (let i = 0; i < 7; ++i) {
            const pile = new Pile(this);
            this.flippers.push(pile);
            this.piles.push(pile);
        }

        // 4 Foundations: indices 14 to 17
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
            const stepA = this.getStepsFromBeak_(a);
            const stepB = this.getStepsFromBeak_(b);
            if (stepA > stepB) return 1;
            if (stepA < stepB) return -1;
            return 0;
        });
        return wonCards;
    }

    protected *restart_(rng: prand.RandomGenerator) {
        const tempPile = new Pile(this);

        // Gather all cards to tempPile
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

        // The first card dealt (beak) goes to tableaux[0] (bottom of column 1)
        const beakCard = tempPile.peek() ?? Debug.error();
        const beakRank = beakCard.rank;
        this.tableaux[0].push(beakCard);
        beakCard.faceUp = true;
        yield DelayHint.Quick;

        // Deal remaining cards into 7 tableaux so each column ends up with 7 cards.
        // There are 3 other cards of the same rank as the beak.
        // As they appear, immediately place them in the foundations.
        let foundationIdx = 0;
        for (let row = 0; row < 7; ++row) {
            for (let col = 0; col < 7; ++col) {
                if (row === 0 && col === 0) {
                    continue; // Already has beakCard
                }

                let card = tempPile.peek();
                while (card && card.rank === beakRank) {
                    const fd = this.foundations[foundationIdx++] ?? Debug.error();
                    fd.push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                    card = tempPile.peek();
                }

                if (card) {
                    this.tableaux[col].push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                }
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

        if (this.flippers.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card) {
                return { canDrag: true, extraCards: [] };
            }
        } else if (this.foundations.indexOf(card.pile) >= 0) {
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
        return this.isTableauDrop_(card, pile) || this.isFoundationDrop_(card, pile) || this.isFlipperDrop_(card, pile);
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
            if (!this.isTableauNext_(c1, c2)) {
                return false;
            }
        }
        return true;
    }

    private isTableauNext_(parent: Card, child: Card): boolean {
        if (parent.suit !== child.suit) return false;
        const parentVal = this.getCardValue_(parent);
        const childVal = this.getCardValue_(child);
        const expectedVal = parentVal === 1 ? 13 : parentVal - 1;
        return childVal === expectedVal;
    }

    private isFoundationNext_(parent: Card, child: Card): boolean {
        if (parent.suit !== child.suit) return false;
        const parentVal = this.getCardValue_(parent);
        const childVal = this.getCardValue_(child);
        const expectedVal = parentVal === 13 ? 1 : parentVal + 1;
        return childVal === expectedVal;
    }

    private isFoundationDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.foundations.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag || dragResult.extraCards.length > 0) return false;

        const topCard = pile.peek();
        if (topCard) {
            return this.isFoundationNext_(topCard, card);
        } else {
            return card.rank === this.beakRank;
        }
    }

    private isFlipperDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.flippers.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag || dragResult.extraCards.length > 0) return false;

        return pile.length === 0;
    }

    private isTableauDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) < 0) return false;

        const dragResult = this.canDrag_(card);
        if (!dragResult.canDrag) return false;

        const topCard = pile.peek();
        if (topCard) {
            return this.isTableauNext_(topCard, card);
        } else {
            return this.isOneBelowBeak_(card);
        }
    }

    private isOneBelowBeak_(card: Card): boolean {
        const beakRank = this.beakRank;
        if (beakRank === Rank.None) return false;
        const beakVal = this.getCardValueFromRank_(beakRank);
        const cardVal = this.getCardValue_(card);
        const expectedVal = beakVal === 1 ? 13 : beakVal - 1;
        return cardVal === expectedVal;
    }

    private getStepsFromBeak_(card: Card): number {
        const beakRank = this.beakRank;
        if (beakRank === Rank.None) return 0;
        const beakVal = this.getCardValueFromRank_(beakRank);
        const cardVal = this.getCardValue_(card);
        return (cardVal - beakVal + 13) % 13;
    }

    private getCardValue_(card: Card): number {
        return this.getCardValueFromRank_(card.rank);
    }

    private getCardValueFromRank_(rank: Rank): number {
        switch (rank) {
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
                let foundationMinSteps = 999;
                for (const pile of this.foundations) {
                    const card = pile.peek();
                    if (card) {
                        foundationMinSteps = Math.min(foundationMinSteps, this.getStepsFromBeak_(card));
                    } else {
                        foundationMinSteps = -1;
                    }
                }

                const sources = [...this.tableaux, ...this.flippers];
                for (const pile of sources) {
                    const card = pile.peek();
                    if (card && this.getStepsFromBeak_(card) <= foundationMinSteps + this.options.autoMoveToFoundation) {
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
