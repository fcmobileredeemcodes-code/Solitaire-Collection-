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
    public readonly foundation = new Pile(this);
    public readonly tableaux: Pile[] = [];

    constructor(options: GameOptions) {
        super();
        this.options = options;

        // Tableau Piles: Stacks 0, 1, 2, 3
        for (let i = 0; i < 4; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Foundation Pile: Stack 4
        this.piles.push(this.foundation);

        // Stock/Main Pile: Stack 5
        this.piles.push(this.stock);

        this.cards = DeckUtils.createStandard52Deck(this.stock);
    }

    protected doGetWon_() {
        return this.foundation.length === 48;
    }

    public get wonCards() {
        const wonCards: Card[] = [];
        for (const card of this.foundation) {
            wonCards.push(card);
        }
        return wonCards;
    }

    protected *restart_(rng: prand.RandomGenerator) {
        // put all the cards face down back into the stock
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

        // Deal 1 card face up to each of the 4 tableau piles
        for (let i = 0; i < this.tableaux.length; ++i) {
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

    protected *cardPrimary_(card: Card) {
        if (card.pile === this.stock) {
            if (this.stock.length > 0) {
                yield* this.doDrawFromStock_();
            }
            return;
        }

        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            if (this.canMoveToFoundation_(card)) {
                this.foundation.push(card);
                yield DelayHint.OneByOne;
                return;
            }

            for (const tableau of this.tableaux) {
                if (tableau.length === 0) {
                    tableau.push(card);
                    yield DelayHint.OneByOne;
                    return;
                }
            }
        }
    }

    protected *cardSecondary_(card: Card) {
        yield* this.cardPrimary_(card);
    }

    protected *pilePrimary_(pile: Pile) {
        if (pile === this.stock) {
            if (this.stock.length > 0) {
                yield* this.doDrawFromStock_();
            }
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        const isTop = this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card;
        return { canDrag: isTop, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        if (pile === this.foundation) {
            return this.canMoveToFoundation_(card);
        }
        return this.isTableauDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (pile === this.foundation && this.canMoveToFoundation_(card)) {
            pile.push(card);
            yield DelayHint.OneByOne;
        } else if (this.isTableauDrop_(card, pile)) {
            pile.push(card);
            yield DelayHint.OneByOne;
        }
    }

    private *doDrawFromStock_() {
        for (const tableau of this.tableaux) {
            const card = this.stock.peek();
            if (card) {
                tableau.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }
        yield DelayHint.OneByOne;
    }

    private canMoveToFoundation_(card: Card): boolean {
        if (this.tableaux.indexOf(card.pile) < 0) return false;
        if (card.pile.peek() !== card) return false;

        const val = this.getCardValue_(card);
        for (const tableau of this.tableaux) {
            if (tableau === card.pile) continue;
            const top = tableau.peek();
            if (top && top.suit === card.suit && this.getCardValue_(top) > val) {
                return true;
            }
        }
        return false;
    }

    private isTableauDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.tableaux.indexOf(pile) < 0) return false;
        if (pile.length > 0) return false;

        if (this.tableaux.indexOf(card.pile) < 0) return false;
        if (card.pile.peek() !== card) return false;

        return true;
    }

    private getCardValue_(card: Card): number {
        switch (card.rank) {
            case Rank.Ace:
                return 14;
            case Rank.King:
                return 13;
            case Rank.Queen:
                return 12;
            case Rank.Jack:
                return 11;
            case Rank.Ten:
                return 10;
            case Rank.Nine:
                return 9;
            case Rank.Eight:
                return 8;
            case Rank.Seven:
                return 7;
            case Rank.Six:
                return 6;
            case Rank.Five:
                return 5;
            case Rank.Four:
                return 4;
            case Rank.Three:
                return 3;
            case Rank.Two:
                return 2;
            default:
                return 0;
        }
    }
}
