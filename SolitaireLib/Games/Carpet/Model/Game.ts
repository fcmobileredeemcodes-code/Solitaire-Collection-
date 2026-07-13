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
    public readonly foundations: Pile[] = [];
    public readonly carpet: Pile[] = [];

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

        for (let i = 0; i < 20; ++i) {
            const pile = new Pile(this);
            this.carpet.push(pile);
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

        this.stock.sort();

        // Remove all 4 Aces and place them as the foundation bases
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

        // Shuffle the remaining 48 cards
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 20 of them face up into a 4x5 grid ("the carpet")
        for (let i = 0; i < 20; ++i) {
            const card = this.stock.peek();
            if (card) {
                const pile = this.carpet[i] ?? Debug.error();
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
                const nextCard = this.stock.peek() ?? Debug.error();
                this.waste.push(nextCard);
                nextCard.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
            }
            return;
        }

        if (card.pile.peek() === card && card.faceUp) {
            if (this.carpet.indexOf(card.pile) >= 0 || card.pile === this.waste) {
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
    }

    protected *cardSecondary_(card: Card) {
        yield* this.cardPrimary_(card);
    }

    protected *pilePrimary_(pile: Pile) {
        if (pile === this.stock) {
            if (this.stock.length > 0) {
                const nextCard = this.stock.peek() ?? Debug.error();
                this.waste.push(nextCard);
                nextCard.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
            }
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        const isTop = (this.carpet.indexOf(card.pile) >= 0 || card.pile === this.waste) && card.pile.peek() === card;
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
            return this.getCardValue_(card) === this.getCardValue_(topCard) + 1 && card.suit === topCard.suit;
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

    private *doAutoMoves_() {
        mainLoop: while (true) {
            for (let i = 0; i < 20; ++i) {
                const carpetPile = this.carpet[i] ?? Debug.error();
                if (carpetPile.length === 0) {
                    if (this.waste.length > 0) {
                        const card = this.waste.peek() ?? Debug.error();
                        carpetPile.push(card);
                        card.faceUp = true;
                        yield DelayHint.OneByOne;
                        continue mainLoop;
                    }
                    if (this.stock.length > 0) {
                        const card = this.stock.peek() ?? Debug.error();
                        carpetPile.push(card);
                        card.faceUp = true;
                        yield DelayHint.OneByOne;
                        continue mainLoop;
                    }
                }
            }
            break;
        }
    }
}
