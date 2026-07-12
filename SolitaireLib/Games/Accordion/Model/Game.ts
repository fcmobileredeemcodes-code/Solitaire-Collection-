import prand from "pure-rand";
import { Card } from "~CardLib/Model/Card";
import * as DeckUtils from "~CardLib/Model/DeckUtils";
import { DelayHint } from "~CardLib/Model/DelayHint";
import { GameBase } from "~CardLib/Model/GameBase";
import { Pile } from "~CardLib/Model/Pile";
import { GameOptions } from "./GameOptions";
import { IGame } from "./IGame";

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;

    constructor(options: GameOptions) {
        super();
        this.options = options;

        // Create 52 piles
        for (let i = 0; i < 52; ++i) {
            const pile = new Pile(this);
            this.piles.push(pile);
        }

        // Create standard deck in the first pile
        this.cards = DeckUtils.createStandard52Deck(this.piles[0]);
    }

    protected doGetWon_(): boolean {
        const nonEvPiles = this.piles.filter(p => p.length > 0);
        return nonEvPiles.length === 1 && nonEvPiles[0].length === 52;
    }

    public get wonCards() {
        const wonCards: Card[] = [];
        const nonEvPiles = this.piles.filter(p => p.length > 0);
        if (nonEvPiles.length === 1) {
            for (const card of nonEvPiles[0]) {
                wonCards.push(card);
            }
        }
        return wonCards;
    }

    protected *restart_(rng: prand.RandomGenerator) {
        const firstPile = this.piles[0];

        // Gather all cards into piles[0]
        for (let i = 1; i < 52; ++i) {
            const pile = this.piles[i];
            while (pile.length > 0) {
                firstPile.push(pile.peek()!);
            }
        }

        // Set faceUp to true for all cards
        for (const card of firstPile) {
            card.faceUp = true;
        }

        firstPile.sort();
        firstPile.shuffle(rng);

        yield DelayHint.Settle;

        // Distribute 1 card to each pile
        for (let i = 1; i < 52; ++i) {
            const card = firstPile.peek();
            if (card) {
                this.piles[i].push(card);
                yield DelayHint.Quick;
            }
        }
    }

    protected *cardPrimary_(card: Card) {
        const sourcePile = card.pile;
        if (sourcePile.peek() !== card) return;

        const nonEvPiles = this.piles.filter(p => p.length > 0);
        const sourceIdx = nonEvPiles.indexOf(sourcePile);
        if (sourceIdx < 0) return;

        const targets: Pile[] = [];
        if (sourceIdx >= 3) {
            const t = nonEvPiles[sourceIdx - 3];
            if (this.isValidMove_(sourcePile, t)) {
                targets.push(t);
            }
        }
        if (sourceIdx >= 1) {
            const t = nonEvPiles[sourceIdx - 1];
            if (this.isValidMove_(sourcePile, t)) {
                targets.push(t);
            }
        }

        if (targets.length > 0) {
            const target = targets[0];
            const cardsToMove = [...sourcePile];
            for (const c of cardsToMove) {
                target.push(c);
            }
            yield DelayHint.OneByOne;
        }
    }

    protected *cardSecondary_(card: Card) {}

    protected *pilePrimary_(pile: Pile) {}

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (card.pile.peek() === card) {
            return { canDrag: true, extraCards: [] };
        }
        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        if (card.pile.peek() !== card) return false;
        return this.isValidMove_(card.pile, pile);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        const sourcePile = card.pile;
        if (this.isValidMove_(sourcePile, pile)) {
            const cardsToMove = [...sourcePile];
            for (const c of cardsToMove) {
                pile.push(c);
            }
            yield DelayHint.OneByOne;
        }
    }

    private isValidMove_(sourcePile: Pile, targetPile: Pile): boolean {
        if (sourcePile === targetPile) return false;
        if (sourcePile.length === 0 || targetPile.length === 0) return false;

        const nonEvPiles = this.piles.filter(p => p.length > 0);
        const sourceIdx = nonEvPiles.indexOf(sourcePile);
        const targetIdx = nonEvPiles.indexOf(targetPile);

        if (sourceIdx < 0 || targetIdx < 0) return false;

        const distance = sourceIdx - targetIdx;
        if (distance !== 1 && distance !== 3) return false;

        const sourceTop = sourcePile.peek();
        const targetTop = targetPile.peek();
        if (!sourceTop || !targetTop) return false;

        return sourceTop.suit === targetTop.suit || sourceTop.rank === targetTop.rank;
    }
}
