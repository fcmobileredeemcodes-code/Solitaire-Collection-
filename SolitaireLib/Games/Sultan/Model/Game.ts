import prand from "pure-rand";
import * as Debug from "~CardLib/Debug";
import { Card } from "~CardLib/Model/Card";
import * as DeckUtils from "~CardLib/Model/DeckUtils";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { GameBase } from "~CardLib/Model/GameBase";
import { Pile } from "~CardLib/Model/Pile";
import { Rank } from "~CardLib/Model/Rank";
import { Suit } from "~CardLib/Model/Suit";
import { GameOptions } from "./GameOptions";
import { IGame } from "./IGame";

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;
    public readonly stock = new Pile(this);
    public readonly waste = new Pile(this);
    public readonly sultan = new Pile(this);
    public readonly foundations: Pile[] = [];
    public readonly reserves: Pile[] = [];

    private restocks_ = 0;

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Register piles in layout order:
        // Piles 0-7: reserves
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.reserves.push(pile);
            this.piles.push(pile);
        }

        // Piles 8-15: foundations
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.foundations.push(pile);
            this.piles.push(pile);
        }

        // Pile 16: sultan (decorative)
        this.piles.push(this.sultan);

        // Pile 17: stock
        this.piles.push(this.stock);

        // Pile 18: waste
        this.piles.push(this.waste);

        // Create two decks of cards (104 cards total)
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
        return sum === 103;
    }

    public get wonCards() {
        const wonCards: Card[] = [];
        for (const pile of this.foundations) {
            for (const card of pile) {
                wonCards.push(card);
            }
        }
        for (const card of this.sultan) {
            wonCards.push(card);
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
        this.restocks_ = 0;

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

        // Sort stock to locate Kings and Ace of Hearts deterministically
        this.stock.sort();

        let sultanCard: Card | undefined;
        let heartKingFoundationCard: Card | undefined;
        const spadeKings: Card[] = [];
        const diamondKings: Card[] = [];
        const clubKings: Card[] = [];
        let heartAce: Card | undefined;

        // Loop through stock to find and remove the starting cards
        for (let i = this.stock.length - 1; i >= 0; i--) {
            const card = this.stock.at(i);
            if (card.rank === Rank.King) {
                if (card.suit === Suit.Hearts) {
                    if (!sultanCard) {
                        sultanCard = card;
                    } else if (!heartKingFoundationCard) {
                        heartKingFoundationCard = card;
                    }
                } else if (card.suit === Suit.Spades) {
                    if (spadeKings.length < 2) {
                        spadeKings.push(card);
                    }
                } else if (card.suit === Suit.Diamonds) {
                    if (diamondKings.length < 2) {
                        diamondKings.push(card);
                    }
                } else if (card.suit === Suit.Clubs) {
                    if (clubKings.length < 2) {
                        clubKings.push(card);
                    }
                }
            } else if (card.rank === Rank.Ace && card.suit === Suit.Hearts) {
                if (!heartAce) {
                    heartAce = card;
                }
            }
        }

        // Push starting cards to foundations and Sultan
        this.sultan.push(sultanCard ?? Debug.error());
        (this.foundations[0] ?? Debug.error()).push(spadeKings[0] ?? Debug.error());
        (this.foundations[1] ?? Debug.error()).push(diamondKings[0] ?? Debug.error());
        (this.foundations[2] ?? Debug.error()).push(clubKings[0] ?? Debug.error());
        (this.foundations[3] ?? Debug.error()).push(spadeKings[1] ?? Debug.error());
        (this.foundations[4] ?? Debug.error()).push(clubKings[1] ?? Debug.error());
        (this.foundations[5] ?? Debug.error()).push(diamondKings[1] ?? Debug.error());
        (this.foundations[6] ?? Debug.error()).push(heartAce ?? Debug.error());
        (this.foundations[7] ?? Debug.error()).push(heartKingFoundationCard ?? Debug.error());

        // Make starting cards face up
        (sultanCard ?? Debug.error()).faceUp = true;
        (spadeKings[0] ?? Debug.error()).faceUp = true;
        (diamondKings[0] ?? Debug.error()).faceUp = true;
        (clubKings[0] ?? Debug.error()).faceUp = true;
        (spadeKings[1] ?? Debug.error()).faceUp = true;
        (clubKings[1] ?? Debug.error()).faceUp = true;
        (diamondKings[1] ?? Debug.error()).faceUp = true;
        (heartAce ?? Debug.error()).faceUp = true;
        (heartKingFoundationCard ?? Debug.error()).faceUp = true;

        // Shuffle remaining cards in the stock
        this.stock.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 1 card face up to each reserve pile
        for (let i = 0; i < 8; ++i) {
            const card = this.stock.peek();
            if (card) {
                (this.reserves[i] ?? Debug.error()).push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        if (card.pile === this.stock && this.canDrawFromStock_()) {
            yield* this.doDrawFromStock_();
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *cardSecondary_(card: Card) {
        if (card.pile.peek() === card && card.faceUp) {
            if (card.pile === this.waste || this.reserves.indexOf(card.pile) >= 0) {
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

    protected *pilePrimary_(pile: Pile) {
        if (pile === this.stock) {
            if (this.stock.length === 0 && this.waste.length > 0) {
                if (this.restocks_ < this.options.restocksAllowed) {
                    this.restocks_++;
                    for (let i = this.waste.length; i-- > 0; ) {
                        const card = this.waste.at(i);
                        card.faceUp = false;
                    }
                    yield DelayHint.OneByOne;
                    for (let i = this.waste.length; i-- > 0; ) {
                        const card = this.waste.at(i);
                        this.stock.push(card);
                    }
                    yield DelayHint.OneByOne;
                    yield* this.doAutoMoves_();
                    return;
                }
            } else if (this.stock.length > 0) {
                yield* this.doDrawFromStock_();
                yield* this.doAutoMoves_();
                return;
            }
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (card.pile.peek() === card && card.faceUp) {
            if (card.pile === this.waste || this.reserves.indexOf(card.pile) >= 0) {
                return { canDrag: true, extraCards: [] };
            }
        }
        return { canDrag: false, extraCards: [] };
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

    private isKingFoundationDrop_(card: Card, foundation: Pile) {
        const topCard = foundation.peek();
        if (!topCard) return false;

        if (topCard.suit !== card.suit) return false;

        const topVal = this.getCardValue_(topCard);
        const cardVal = this.getCardValue_(card);

        if (topVal === 13) {
            return cardVal === 1; // Ace on King
        } else {
            return cardVal === topVal + 1; // build up
        }
    }

    private isAceFoundationDrop_(card: Card, foundation: Pile) {
        const topCard = foundation.peek();
        if (!topCard) return false;

        if (topCard.suit !== card.suit) return false;

        const topVal = this.getCardValue_(topCard);
        const cardVal = this.getCardValue_(card);

        return cardVal === topVal + 1; // build up
    }

    private isFoundationDrop_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        const index = this.foundations.indexOf(pile);
        if (index < 0) return false;

        if (index === 6) {
            return this.isAceFoundationDrop_(card, pile);
        } else {
            return this.isKingFoundationDrop_(card, pile);
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
            // First: refill empty reserve slots immediately from top of waste or stock
            for (let i = 0; i < 8; ++i) {
                const reserve = this.reserves[i] ?? Debug.error();
                if (reserve.length === 0) {
                    let card = this.waste.peek();
                    if (card) {
                        reserve.push(card);
                        card.faceUp = true;
                        yield DelayHint.Quick;
                        continue mainLoop;
                    } else {
                        card = this.stock.peek();
                        if (card) {
                            reserve.push(card);
                            card.faceUp = true;
                            yield DelayHint.Quick;
                            continue mainLoop;
                        }
                    }
                }
            }

            // Second: auto play top card of waste or reserve slots to foundations
            if (this.options.autoMoveToFoundation > 0) {
                const wasteCard = this.waste.peek();
                if (wasteCard) {
                    for (const foundation of this.foundations) {
                        if (this.isFoundationDrop_(wasteCard, foundation)) {
                            foundation.push(wasteCard);
                            yield DelayHint.Quick;
                            continue mainLoop;
                        }
                    }
                }

                for (let i = 0; i < 8; ++i) {
                    const reserveCard = (this.reserves[i] ?? Debug.error()).peek();
                    if (reserveCard) {
                        for (const foundation of this.foundations) {
                            if (this.isFoundationDrop_(reserveCard, foundation)) {
                                foundation.push(reserveCard);
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
