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

const TABLEAUX_COUNT = 7;

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;
    public readonly stock = new Pile(this);
    public readonly waste = new Pile(this);
    public readonly tableaux: Pile[] = [];

    constructor(options: GameOptions) {
        super();

        this.options = options;

        // Index mapping: Tableaux (0-6), Waste (7), Stock (8)
        for (let i = 0; i < TABLEAUX_COUNT; ++i) {
            const pile = new Pile(this);
            this.tableaux.push(pile);
            this.piles.push(pile);
        }

        this.piles.push(this.waste);
        this.piles.push(this.stock);

        this.cards = DeckUtils.createStandard52Deck(this.stock);
    }

    protected doGetWon_() {
        // won when all cards from the tableaux are cleared:
        let sum = 0;
        for (const pile of this.tableaux) {
            sum += pile.length;
        }
        return sum === 0;
    }

    public get wonCards() {
        const wonCards: Card[] = [];
        for (const card of this.waste) {
            wonCards.push(card);
        }
        wonCards.sort((a, b) => {
            return a.pileIndex - b.pileIndex;
        });
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

        // Deal 5 cards face up to each of the 7 tableau columns
        for (let j = 0; j < 5; ++j) {
            for (let i = 0; i < this.tableaux.length; ++i) {
                const pile = this.tableaux[i] ?? Debug.error();
                const card = this.stock.peek();
                if (card) {
                    pile.push(card);
                    card.faceUp = true;
                    yield DelayHint.Quick;
                }
            }
        }

        // Deal 1 card from the stock to the waste pile to begin
        const firstWasteCard = this.stock.peek();
        if (firstWasteCard) {
            this.waste.push(firstWasteCard);
            firstWasteCard.faceUp = true;
            yield DelayHint.OneByOne;
        }
    }

    protected *cardPrimary_(card: Card) {
        // Clicking a top tableau card moves it to the waste pile if valid:
        if (this.isValidMove_(card)) {
            this.waste.push(card);
            card.faceUp = true;
            yield DelayHint.OneByOne;
            return;
        }

        // Clicking the top stock card deals 1 card to the waste pile:
        if (this.stock.peek() === card) {
            const topStock = this.stock.peek();
            if (topStock) {
                this.waste.push(topStock);
                topStock.faceUp = true;
                yield DelayHint.OneByOne;
            }
            return;
        }
    }

    protected *cardSecondary_(card: Card) {}

    protected *pilePrimary_(pile: Pile) {
        // If stock is clicked and empty, do nothing
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.tableaux.indexOf(card.pile) >= 0 && card.pile.peek() === card) {
            return { canDrag: true, extraCards: [] };
        }
        return { canDrag: false, extraCards: [] };
    }

    protected previewDrop_(card: Card, pile: Pile): boolean {
        if (pile !== this.waste) return false;
        return this.isValidMove_(card);
    }

    protected *dropCard_(card: Card, pile: Pile) {
        if (pile === this.waste && this.isValidMove_(card)) {
            this.waste.push(card);
            card.faceUp = true;
            yield DelayHint.OneByOne;
        }
    }

    private isValidMove_(card: Card) {
        if (this.tableaux.indexOf(card.pile) < 0) return false;
        if (card.pile.peek() !== card) return false;

        const topWaste = this.waste.peek();
        if (!topWaste) return true;

        const val = this.getCardValue_(card);
        const wasteVal = this.getCardValue_(topWaste);

        return Math.abs(val - wasteVal) === 1;
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
