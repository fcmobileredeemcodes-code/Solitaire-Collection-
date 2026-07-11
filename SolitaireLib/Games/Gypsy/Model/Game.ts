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

        // Register piles in the exact layout order:
        // Tableau piles (indices 0 to 7)
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        // Foundation piles (indices 8 to 15)
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Stock pile (index 16)
        this.piles.push(this.stock);

        // Cards: 2 standard 52 decks (104 cards total)
        this.cards = [
            ...DeckUtils.createStandard52Deck(this.stock),
            ...DeckUtils.createStandard52Deck(this.stock),
        ];
    }

    protected doGetWon_() {
        // Won when all 104 cards are sorted into the foundations.
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

        // Sort then shuffle the stock
        this.stock.sort();
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 8 columns of 2 cards each.
        // Card 0 (bottom) is face down, Card 1 (top) is face up.
        for (let j = 0; j < 2; ++j) {
            for (let i = 0; i < 8; ++i) {
                const card = this.stock.peek();
                if (card) {
                    const pile = this.tableaux[i] ?? Debug.error();
                    card.faceUp = (j === 1);
                    pile.push(card);
                    yield DelayHint.Quick;
                }
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // Clicking the stock deals 1 card face up to each of the 8 tableau columns simultaneously.
        if (card.pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }

        // Clicking the top face-down card of a tableau column reveals it
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card && !card.faceUp) {
                card.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
                return;
            }
        }
    }

    protected *cardSecondary_(card: Card) {
        // Double clicking a card -> auto-move to the foundations
        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card && card.faceUp) {
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
        // Clicking the stock pile
        if (pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (this.isTableauxDropSource_(card)) {
                return { canDrag: true, extraCards: card.pile.slice(card.pileIndex + 1) };
            }
        } else if (this.foundations.indexOf(card.pile) >= 0) {
            if (card.pile.peek() === card && card.faceUp) {
                return { canDrag: true, extraCards: [] };
            }
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
        for (let i = 0; i < 8; ++i) {
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
        if (!this.isTableauxDropSource_(card)) return false;

        if (this.tableaux.indexOf(pile) >= 0) {
            const topCard = pile.peek();

            if (topCard) {
                // Tableaus build down in alternating colors
                if (this.getCardValue_(topCard) === this.getCardValue_(card) + 1 && topCard.colour !== card.colour) {
                    return true;
                }
            } else {
                // Empty spaces in the tableau can be filled by any card
                return true;
            }
        }

        return false;
    }

    private isTableauxDropSource_(card: Card) {
        if (this.tableaux.indexOf(card.pile) >= 0) {
            if (!card.faceUp) return false;
            // Perfectly sorted sequences can be moved together as a unit
            for (let i = card.pileIndex; i < card.pile.length - 1; ++i) {
                const card0 = card.pile.at(i);
                const card1 = card.pile.at(i + 1);
                if (
                    !card0.faceUp ||
                    !card1.faceUp ||
                    card0.colour === card1.colour ||
                    this.getCardValue_(card0) !== this.getCardValue_(card1) + 1
                ) {
                    return false;
                }
            }
            return true;
        } else if (this.foundations.indexOf(card.pile) >= 0) {
            return card.pile.peek() === card && card.faceUp;
        }
        return false;
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
        if (!this.isFoundationDropSource_(card)) return false;

        if (this.foundations.indexOf(pile) >= 0) {
            const topCard = pile.peek();

            if (topCard) {
                if (this.getCardValue_(topCard) + 1 === this.getCardValue_(card) && topCard.suit === card.suit) {
                    return true;
                }
            } else {
                if (card.rank === Rank.Ace) {
                    return true;
                }
            }
        }

        return false;
    }

    private isFoundationDropSource_(card: Card) {
        // Only single card from tableau/foundations (top card) can move to foundation
        return card.pile.peek() === card && card.faceUp && (this.tableaux.indexOf(card.pile) >= 0 || this.foundations.indexOf(card.pile) >= 0);
    }

    private *doFoundationDrop_(card: Card, pile: Pile) {
        pile.push(card);
        yield DelayHint.OneByOne;
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

                for (const pile of this.tableaux) {
                    const card = pile.peek();
                    if (card && this.getCardValue_(card) <= foundationMin + this.options.autoMoveToFoundation) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(card, foundation)) {
                                yield* this.doFoundationDrop_(card, foundation);
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
