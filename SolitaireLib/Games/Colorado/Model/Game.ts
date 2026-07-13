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

        // Register piles in logical/layout order:
        // Piles 0-19: 20 tableaux piles
        for (let i = 0; i < 20; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Piles 20-27: 8 foundations (first 4 build up, last 4 build down)
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Pile 28: stock
        this.piles.push(this.stock);

        // Load 104 cards (two standard decks combined)
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
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 1 card face up to each of the 20 tableaux
        for (let i = 0; i < 20; ++i) {
            const card = this.stock.peek();
            if (card) {
                const tableau = this.tableaux[i] ?? Debug.error();
                tableau.push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // If stock top card is face down, click reveals it:
        if (card.pile === this.stock) {
            if (this.stock.peek() === card && !card.faceUp) {
                card.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
            }
            return;
        }

        // If tableau card is clicked, check if it can move to a foundation:
        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card && card.faceUp) {
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
            const card = this.stock.peek();
            if (card && !card.faceUp) {
                card.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
            }
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        // Top card of stock can be dragged if face up
        if (card.pile === this.stock && this.stock.peek() === card && card.faceUp) {
            return { canDrag: true, extraCards: [] };
        }
        // Top card of any tableau can be dragged
        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card && card.faceUp) {
            return { canDrag: true, extraCards: [] };
        }
        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        // From stock: can drop on any tableau pile
        if (card.pile === this.stock) {
            return this.tableaux.indexOf(pile) >= 0;
        }
        // From tableau: can drop on any foundation
        if (this.tableaux.indexOf(card.pile) >= 0) {
            return this.isFoundationDrop_(card, pile);
        }
        return false;
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (card.pile === this.stock && this.tableaux.indexOf(pile) >= 0) {
            pile.push(card);
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        } else if (this.tableaux.indexOf(card.pile) >= 0 && this.isFoundationDrop_(card, pile)) {
            pile.push(card);
            yield DelayHint.OneByOne;
            yield* this.doAutoMoves_();
        }
    }

    private isFoundationDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        const index = this.foundations.indexOf(pile);
        if (index < 0) return false;

        const topCard = pile.peek();
        if (index < 4) {
            // First 4 build UP Ace -> King
            if (topCard) {
                return (
                    this.getCardValue_(topCard) + 1 === this.getCardValue_(card) &&
                    topCard.suit === card.suit
                );
            } else {
                return card.rank === Rank.Ace;
            }
        } else {
            // Last 4 build DOWN King -> Ace
            if (topCard) {
                return (
                    this.getCardValue_(topCard) - 1 === this.getCardValue_(card) &&
                    topCard.suit === card.suit
                );
            } else {
                return card.rank === Rank.King;
            }
        }
    }

    private getCardValue_(card: Card) {
        switch (card.rank) {
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
            default: Debug.error();
        }
    }

    private *doAutoMoves_() {
        mainLoop: while (true) {
            // 1. Refill any empty tableau piles automatically from the top of the stock
            for (const tableau of this.tableaux) {
                if (tableau.length === 0) {
                    const stockCard = this.stock.peek();
                    if (stockCard) {
                        tableau.push(stockCard);
                        stockCard.faceUp = true;
                        yield DelayHint.Quick;
                        continue mainLoop;
                    }
                }
            }

            // 2. Auto play tableau top cards to foundations if option is enabled
            if (this.options.autoMoveToFoundation) {
                for (const tableau of this.tableaux) {
                    const card = tableau.peek();
                    if (card) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(card, foundation)) {
                                foundation.push(card);
                                yield DelayHint.Quick;
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
