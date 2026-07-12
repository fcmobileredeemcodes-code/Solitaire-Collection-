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
        this.piles.push(this.stock);

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
        return wonCards;
    }

    protected *restart_(rng: prand.RandomGenerator) {
        // Put all cards back into the stock face down
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

        // Sort then shuffle:
        this.stock.sort();
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Separate the 4 Aces from the deck and place them face up as the 4 foundations
        const aces: Card[] = [];
        for (let i = 0; i < this.stock.length; ++i) {
            const card = this.stock.at(i);
            if (card.rank === Rank.Ace) {
                aces.push(card);
            }
        }

        for (let i = 0; i < 4; ++i) {
            const ace = aces[i] ?? Debug.error();
            const foundation = this.foundations[i] ?? Debug.error();
            foundation.push(ace);
            ace.faceUp = true;
            yield DelayHint.Quick;
        }

        // Deal 4 cards face up below the foundations, one card starting each of 4 tableau piles
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

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        if (card.pile === this.stock) {
            if (this.stock.length > 0) {
                yield* this.doDrawFromStock_();
                yield* this.doAutoMoves_();
            }
            return;
        }

        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
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

    protected *cardSecondary_(card: Card) {
        yield* this.cardPrimary_(card);
    }

    protected *pilePrimary_(pile: Pile) {
        if (pile === this.stock) {
            if (this.stock.length > 0) {
                yield* this.doDrawFromStock_();
                yield* this.doAutoMoves_();
            }
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        const isTop = this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card;
        return { canDrag: isTop, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        return this.isFoundationDrop_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.isFoundationDrop_(card, pile)) {
            pile.push(card);
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        }
    }

    private isFoundationDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        if (this.foundations.indexOf(pile) < 0) return false;

        const topCard = pile.peek();
        if (topCard) {
            return this.getCardValue_(card) === this.getCardValue_(topCard) + 1;
        } else {
            return card.rank === Rank.Ace;
        }
    }

    private getCardValue_(card: Card): number {
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
                return 0;
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

    private *doAutoMoves_() {
        // No automatic moves required for standard play unless implemented as options,
        // so we leave it empty to support manual/deliberate play.
    }
}
