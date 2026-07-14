import { error } from "~CardLib/Debug";
import { IPile } from "~CardLib/Model/IPile";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

export class GamePresenter extends GamePresenterBase<IGame> {
    private sizeY = 20;
    private sizeX = 20 / 1.555555555555;

    private readonly stockPile_: PileView;
    private readonly wastePile_: PileView;
    private readonly foundationPiles_: PileView[] = [];
    private readonly quiltPiles_: PileView[][] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "crazyquilt",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // Create Stock pile view
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            this.stockPile_ = pileView;
        }

        // Create Waste pile view
        {
            const pileView = this.createPileView_(game.waste);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.wastePile_ = pileView;
        }

        // Create 8 Foundation pile views
        for (let i = 0; i < game.foundations.length; ++i) {
            const pile = game.foundations[i] ?? error();
            const pileView = this.createPileView_(pile);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);
        }

        // Create 8x8 Quilt grid pile views
        for (let r = 0; r < 8; ++r) {
            const row: PileView[] = [];
            const gameRow = game.quilt[r] ?? error();
            for (let c = 0; c < 8; ++c) {
                const pile = gameRow[c] ?? error();
                const pileView = this.createPileView_(pile);
                pileView.showFrame = true;
                pileView.zIndex = 100 + r * 10;

                // Rotate the empty pile frame if landscape
                const isLandscape = (r + c) % 2 !== 0;
                if (isLandscape) {
                    pileView.element.style.transform = "rotate(90deg)";
                }

                row.push(pileView);
            }
            this.quiltPiles_.push(row);
        }

        // Create Card views
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        // Since we have 10 piles in width for the top row, pass 10 columns
        const { sizeX, sizeY } = this.calculateCardSize(10, 0.5);

        let cappedSizeY = Math.min(10.5, sizeY);
        const pxPerRem = this.rootView_.context.pxPerRem;
        const clientHeight = this.rootView_.element.clientHeight;
        if (pxPerRem && !isNaN(pxPerRem) && isFinite(pxPerRem) && clientHeight > 0) {
            const fontSizeInPx = 1 / pxPerRem;
            const H_em = clientHeight / fontSizeInPx;
            // 9 vertical rows of card layout. With some safe margin/padding, 10.0 is a perfect ratio.
            const maxVerticalSizeY = H_em / 10.0;
            cappedSizeY = Math.min(cappedSizeY, maxVerticalSizeY);
        }
        this.sizeY = cappedSizeY;
        this.sizeX = cappedSizeY / 1.5555555555555;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const scale = this.sizeY / 20;
        const scaledMargin = 0.5 * scale;

        // Center the top row of 10 piles
        const topRowSize = 10;
        const xPosTop = (i: number) => {
            return (i - 0.5 * (topRowSize - 1)) * (this.sizeX + scaledMargin);
        };

        const avgSize = (this.sizeX + this.sizeY) / 2;
        const gap = 0.15 * scale;
        const spacing = avgSize + gap;

        // Center of entire 9-row layout is perfectly centered at y = 0
        const yCenterOffset = 0;

        // Position of top row (Row 0 of 9 total rows)
        const yTop = -4 * spacing + yCenterOffset;

        // Positions of 8 quilt rows (Row 1 to 8 of 9 total rows)
        const xPosQuilt = (c: number) => {
            return (c - 3.5) * spacing;
        };
        const yPosQuilt = (r: number) => {
            return (r - 3) * spacing + yCenterOffset;
        };

        // Stock pile rect
        this.stockPile_.rect = new Rect(this.sizeX, this.sizeY, xPosTop(0), yTop);

        // Waste pile rect
        this.wastePile_.rect = new Rect(this.sizeX, this.sizeY, xPosTop(1), yTop);

        // Foundation pile rects
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.foundationPiles_[i] ?? error();
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPosTop(2 + i), yTop);
        }

        // Quilt pile rects
        for (let r = 0; r < 8; ++r) {
            const row = this.quiltPiles_[r] ?? error();
            for (let c = 0; c < 8; ++c) {
                const pileView = row[c] ?? error();
                pileView.rect = new Rect(this.sizeX, this.sizeY, xPosQuilt(c), yPosQuilt(r));
            }
        }
    }

    protected relayoutPile_(pileView: PileView, pile: IPile) {
        super.relayoutPile_(pileView, pile);

        // Check if this is a landscape pile
        const isLandscape = this.isPileLandscape_(pile);
        for (let i = 0; i < pile.length; ++i) {
            const card = pile.at(i);
            const cardView = this.getCardView_(card);
            if (isLandscape) {
                cardView.element.style.transform = "rotate(90deg)";
            } else {
                cardView.element.style.transform = "";
            }
        }
    }

    private isPileLandscape_(pile: IPile): boolean {
        for (let r = 0; r < 8; ++r) {
            const row = this.game_.quilt[r];
            if (row) {
                const c = row.indexOf(pile);
                if (c >= 0) {
                    return (r + c) % 2 !== 0;
                }
            }
        }
        return false;
    }
}
