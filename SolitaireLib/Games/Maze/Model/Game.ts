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
    public readonly gridPiles: Pile[] = [];
    public readonly discardPile = new Pile(this);

    constructor(options: GameOptions) {
        super();
        this.options = options;

        for (let i = 0; i < 52; ++i) {
            const pile = new Pile(this);
            this.gridPiles.push(pile);
            this.piles.push(pile);
        }

        this.piles.push(this.discardPile);

        this.cards = DeckUtils.createStandard52Deck(this.discardPile);
    }

    protected doGetWon_() {
        for (let r = 0; r < 4; ++r) {
            // Check if column 12 is empty and columns 0..11 are Ace..Queen:
            let opt1 = true;
            if (this.gridPiles[r * 13 + 12].length !== 0) {
                opt1 = false;
            } else {
                const firstCard = this.gridPiles[r * 13].peek();
                if (!firstCard || firstCard.rank !== Rank.Ace) {
                    opt1 = false;
                } else {
                    const suit = firstCard.suit;
                    for (let c = 0; c < 12; ++c) {
                        const card = this.gridPiles[r * 13 + c].peek();
                        if (!card || card.suit !== suit || this.getCardValue_(card) !== c + 1) {
                            opt1 = false;
                            break;
                        }
                    }
                }
            }

            // Check if column 0 is empty and columns 1..12 are Ace..Queen:
            let opt2 = true;
            if (this.gridPiles[r * 13].length !== 0) {
                opt2 = false;
            } else {
                const firstCard = this.gridPiles[r * 13 + 1].peek();
                if (!firstCard || firstCard.rank !== Rank.Ace) {
                    opt2 = false;
                } else {
                    const suit = firstCard.suit;
                    for (let c = 1; c < 13; ++c) {
                        const card = this.gridPiles[r * 13 + c].peek();
                        if (!card || card.suit !== suit || this.getCardValue_(card) !== c) {
                            opt2 = false;
                            break;
                        }
                    }
                }
            }

            if (!opt1 && !opt2) {
                return false;
            }
        }
        return true;
    }

    public get wonCards() {
        return [...this.cards];
    }

    protected *restart_(rng: prand.RandomGenerator) {
        // Collect all cards into discardPile
        for (const card of this.cards) {
            card.faceUp = false;
        }

        for (const pile of this.gridPiles) {
            for (let i = pile.length; i-- > 0; ) {
                const card = pile.at(i);
                card.faceUp = false;
                this.discardPile.push(card);
            }
        }

        // Sort then shuffle the discardPile:
        this.discardPile.sort();
        this.discardPile.shuffle(rng);

        yield DelayHint.Settle;

        // Deal 52 cards face up to stacks 0-51:
        for (let i = 0; i < 52; ++i) {
            const card = this.discardPile.peek();
            if (card) {
                this.gridPiles[i].push(card);
                card.faceUp = true;
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;

        // Locate and move the four Kings to discardPile:
        for (let i = 0; i < 52; ++i) {
            const pile = this.gridPiles[i];
            const card = pile.peek();
            if (card && card.rank === Rank.King) {
                card.faceUp = false;
                this.discardPile.push(card);
                yield DelayHint.Quick;
            }
        }

        yield DelayHint.OneByOne;
    }

    protected *cardPrimary_(card: Card): Generator<DelayHint, void> {
        // Double-click/single-click can auto-move to a valid empty slot:
        for (const pile of this.gridPiles) {
            if (pile.length === 0 && this.previewDrop_(card, pile)) {
                pile.push(card);
                yield DelayHint.OneByOne;
                return;
            }
        }
    }

    protected *cardSecondary_(card: Card): Generator<DelayHint, void> {
        yield* this.cardPrimary_(card);
    }

    protected *pilePrimary_(pile: Pile): Generator<DelayHint, void> {}
    protected *pileSecondary_(pile: Pile): Generator<DelayHint, void> {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        const isGrid = this.gridPiles.indexOf(card.pile) >= 0;
        return {
            canDrag: isGrid && card.pile.peek() === card,
            extraCards: [],
        };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        if (card.pile === pile) return false;
        const pileIdx = this.gridPiles.indexOf(pile);
        if (pileIdx < 0) return false;
        if (pile.length > 0) return false;

        const col = pileIdx % 13;

        // Left neighbor check
        if (col > 0) {
            const leftPile = this.gridPiles[pileIdx - 1];
            const leftCard = leftPile.peek();
            if (
                leftCard &&
                card.suit === leftCard.suit &&
                this.getCardValue_(card) === this.getCardValue_(leftCard) + 1
            ) {
                return true;
            }
        }

        // Right neighbor check
        if (col < 12) {
            const rightPile = this.gridPiles[pileIdx + 1];
            const rightCard = rightPile.peek();
            if (
                rightCard &&
                card.suit === rightCard.suit &&
                this.getCardValue_(card) === this.getCardValue_(rightCard) - 1
            ) {
                return true;
            }
        }

        return false;
    }

    protected *dropCard_(card: Card, pile: Pile) {
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
                return 0;
        }
    }
}
