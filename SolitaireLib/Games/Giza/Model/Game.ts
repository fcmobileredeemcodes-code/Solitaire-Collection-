import prand from "pure-rand";
import { error } from "~CardLib/Debug";
import { Card } from "~CardLib/Model/Card";
import * as DeckUtils from "~CardLib/Model/DeckUtils";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { GameBase } from "~CardLib/Model/GameBase";
import { Pile } from "~CardLib/Model/Pile";
import { Rank } from "~CardLib/Model/Rank";
import { GameOptions } from "./GameOptions";
import { IGame } from "./IGame";

const PYRAMID_SIZE = 7;

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;
    public readonly pyramid: Pile[][] = [];
    public readonly columns: Pile[] = [];
    public readonly foundation = new Pile(this);
    private readonly pyramidCoords_ = new Map<Pile, { x: number; y: number }>();

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Register piles in the exact layout order (indices 0 to 35)
        // Stacks 0 to 27: Pyramid piles
        for (let y = 0; y < PYRAMID_SIZE; ++y) {
            const row: Pile[] = [];
            this.pyramid.push(row);
            for (let x = 0; x <= y; ++x) {
                const pile = new Pile(this);
                row.push(pile);
                this.pyramidCoords_.set(pile, { x, y });
                this.piles.push(pile);
            }
        }

        // Stacks 28 to 35: Holding/Tableau rows (8 columns of 3 cards each)
        for (let i = 0; i < 8; ++i) {
            const pile = new Pile(this);
            this.columns.push(pile);
            this.piles.push(pile);
        }

        // Stack 36: Foundation/Discard pile
        this.piles.push(this.foundation);

        // Create standard 52-card deck
        this.cards = DeckUtils.createStandard52Deck(this.foundation);
    }

    protected doGetWon_() {
        // won when both pyramid and columns are empty:
        let sum = 0;
        for (const row of this.pyramid) {
            for (const pile of row) {
                sum += pile.length;
            }
        }
        for (const pile of this.columns) {
            sum += pile.length;
        }
        return sum === 0;
    }

    public get wonCards() {
        const wonCards: Card[] = [];
        for (const card of this.foundation) {
            wonCards.push(card);
        }
        wonCards.sort((a, b) => {
            return a.pileIndex - b.pileIndex;
        });
        return wonCards;
    }

    protected *restart_(rng: prand.RandomGenerator) {
        // put all the cards face down back into the foundation (temp pile)
        for (const card of this.foundation) {
            card.faceUp = false;
        }

        for (let pileIndex = this.piles.length; pileIndex-- > 0; ) {
            const pile = this.piles[pileIndex] ?? error();
            if (pile === this.foundation) continue;
            for (let cardIndex = pile.length; cardIndex-- > 0; ) {
                const card = pile.at(cardIndex);
                card.faceUp = false;
                this.foundation.push(card);
            }
        }

        // sort then shuffle the cards in the foundation:
        this.foundation.sort();
        this.foundation.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 28 cards into the pyramid structure, all completely face up
        for (const row of this.pyramid) {
            for (const pile of row) {
                const card = this.foundation.peek();
                if (card) {
                    pile.push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                }
            }
        }

        // Deal the remaining 24 cards into the 8 columns (3 cards per column, fanned down, all face up)
        for (let cardIdx = 0; cardIdx < 24; ++cardIdx) {
            const colIdx = cardIdx % 8;
            const destCol = this.columns[colIdx];
            if (destCol) {
                const card = this.foundation.peek();
                if (card) {
                    destCol.push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                }
            }
        }

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // if the player clicks on an unblocked king, move it to the foundation:
        if (card.rank === Rank.King && this.isFree_(card)) {
            this.foundation.push(card);
            yield* this.doAutoMoves_();
            return;
        }
    }

    protected *cardSecondary_(card: Card) {}

    protected *pilePrimary_(pile: Pile) {}

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        return {
            canDrag: this.isFree_(card),
            extraCards: [],
        };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        return this.is13Move_(card, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (this.is13Move_(card, pile)) {
            this.foundation.push(pile.peek() ?? error());
            this.foundation.push(card);
            yield* this.doAutoMoves_();
        }
    }

    private isFree_(card: Card) {
        if (!card.faceUp) return false;

        // Top card of each holding column is free
        if (this.columns.indexOf(card.pile) >= 0) {
            return card.pile.peek() === card;
        }

        const coords = this.pyramidCoords_.get(card.pile);
        if (coords) {
            if (card.pile.peek() !== card) return false;
            const nextRow = this.pyramid[coords.y + 1];
            if (!nextRow) return true;
            const block0 = nextRow[coords.x] ?? error();
            const block1 = nextRow[coords.x + 1] ?? error();
            return block0.length === 0 && block1.length === 0;
        }

        return false;
    }

    private is13Move_(card: Card, pile: Pile) {
        if (card.pile === pile) return false;
        if (!this.isFree_(card)) return false;
        const otherCard = pile.peek();
        if (!otherCard) return false;
        if (!this.isFree_(otherCard)) return false;
        return this.getCardValue_(card) + this.getCardValue_(otherCard) === 13;
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
                return 0;
        }
    }

    private *doAutoMoves_() {
        mainLoop: while (true) {
            if (this.options.autoPlayKings) {
                for (const row of this.pyramid) {
                    for (const pile of row) {
                        const card = pile.peek();
                        if (card && this.isFree_(card) && this.getCardValue_(card) === 13) {
                            yield DelayHint.OneByOne;
                            this.foundation.push(card);
                            continue mainLoop;
                        }
                    }
                }
                for (const pile of this.columns) {
                    const card = pile.peek();
                    if (card && this.isFree_(card) && this.getCardValue_(card) === 13) {
                        yield DelayHint.OneByOne;
                        this.foundation.push(card);
                        continue mainLoop;
                    }
                }
            }
            break;
        }
    }
}
