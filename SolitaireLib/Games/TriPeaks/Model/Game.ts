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

const BLOCKERS: Record<number, number[]> = {
    0: [3, 4],
    1: [5, 6],
    2: [7, 8],
    3: [9, 10],
    4: [10, 11],
    5: [12, 13],
    6: [13, 14],
    7: [15, 16],
    8: [16, 17],
    9: [18, 19],
    10: [19, 20],
    11: [20, 21],
    12: [21, 22],
    13: [22, 23],
    14: [23, 24],
    15: [24, 25],
    16: [25, 26],
    17: [26, 27],
};

export class Game extends GameBase implements IGame {
    public readonly options: GameOptions;
    public readonly stock = new Pile(this);
    public readonly waste = new Pile(this);
    public readonly peaks: Pile[] = [];

    constructor(options: GameOptions) {
        super();

        this.options = options;

        for (let i = 0; i < 28; ++i) {
            const pile = new Pile(this);
            this.peaks.push(pile);
            this.piles.push(pile);
        }

        this.piles.push(this.waste);
        this.piles.push(this.stock);

        this.cards = DeckUtils.createStandard52Deck(this.stock);
    }

    protected doGetWon_() {
        // won when all peaks cards are successfully cleared
        let sum = 0;
        for (const pile of this.peaks) {
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

        // Deal 1 card to each of the 28 peak piles
        for (let i = 0; i < 28; ++i) {
            const pile = this.peaks[i] ?? Debug.error();
            const card = this.stock.peek();
            if (card) {
                pile.push(card);
                // Row 4 is face up initially, Rows 1-3 are face down
                if (i >= 18) {
                    card.faceUp = true;
                } else {
                    card.faceUp = false;
                }
                yield DelayHint.Quick;
            }
        }

        // Deal 1 card from the stock to the waste pile to begin
        const firstWasteCard = this.stock.peek();
        if (firstWasteCard) {
            this.waste.push(firstWasteCard);
            firstWasteCard.faceUp = true;
            yield DelayHint.OneByOne;
        }

        yield* this.doAutoMoves_();
    }

    protected *cardPrimary_(card: Card) {
        // Click a peak card to play onto waste if valid
        if (this.peaks.indexOf(card.pile) >= 0) {
            if (this.isValidMove_(card)) {
                this.waste.push(card);
                card.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
            }
            return;
        }

        // Click top stock card to deal 1 to waste
        if (this.stock.peek() === card) {
            const topStock = this.stock.peek();
            if (topStock) {
                this.waste.push(topStock);
                topStock.faceUp = true;
                yield DelayHint.OneByOne;
                yield* this.doAutoMoves_();
            }
            return;
        }
    }

    protected *cardSecondary_(card: Card) {}

    protected *pilePrimary_(pile: Pile) {
        // Clicking empty stock does nothing
        if (pile === this.stock && this.stock.length === 0) {
            return;
        }
    }

    protected *pileSecondary_(pile: Pile) {}

    protected canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] } {
        if (this.peaks.indexOf(card.pile) >= 0 && this.isFree_(card)) {
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
            yield* this.doAutoMoves_();
        }
    }

    private isFree_(card: Card) {
        if (!card.faceUp) return false;

        const pileIndex = this.peaks.indexOf(card.pile);
        if (pileIndex < 0) {
            return true;
        }

        if (card.pile.peek() !== card) return false;

        const blockers = BLOCKERS[pileIndex];
        if (blockers) {
            for (const blockerIndex of blockers) {
                const blockerPile = this.peaks[blockerIndex];
                if (blockerPile && blockerPile.length > 0) {
                    return false;
                }
            }
        }

        return true;
    }

    private isValidMove_(card: Card) {
        if (this.peaks.indexOf(card.pile) < 0) return false;
        if (!this.isFree_(card)) return false;

        const topWaste = this.waste.peek();
        if (!topWaste) return true;

        const val = this.getCardValue_(card);
        const wasteVal = this.getCardValue_(topWaste);

        const diff = Math.abs(val - wasteVal);
        return diff === 1 || diff === 12;
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
        if (!this.options.autoReveal) return;

        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < 28; ++i) {
                const pile = this.peaks[i];
                if (pile) {
                    const card = pile.peek();
                    if (card && !card.faceUp) {
                        let blocked = false;
                        const blockers = BLOCKERS[i];
                        if (blockers) {
                            for (const blockerIndex of blockers) {
                                const blockerPile = this.peaks[blockerIndex];
                                if (blockerPile && blockerPile.length > 0) {
                                    blocked = true;
                                    break;
                                }
                            }
                        }
                        if (!blocked) {
                            yield DelayHint.OneByOne;
                            card.faceUp = true;
                            changed = true;
                        }
                    }
                }
            }
        }
    }
}
