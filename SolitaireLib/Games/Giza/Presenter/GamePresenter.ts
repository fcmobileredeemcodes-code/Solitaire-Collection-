import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

// Baseline margins used for card layouts.
// These margin ratios will be dynamically scaled according to the calculated card size.
const marginX = 1.5;
const marginY = -7;

export class GamePresenter extends GamePresenterBase<IGame> {
    // Current dynamic dimensions of cards, updated on initial load and window resize.
    private sizeY = 20;
    private sizeX = 20 / 1.555555555555;

    private readonly foundationPile_: PileView;
    private readonly pyramidPiles_: PileView[][] = [];
    private readonly columnPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "giza",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // Perform the initial sizing calculation.
        this.updateSizes_();

        // Create foundation pile:
        {
            const pileView = this.createPileView_(game.foundation);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPile_ = pileView;
        }

        // Create pyramid piles:
        for (let y = 0; y < game.pyramid.length; ++y) {
            const piles = game.pyramid[y] ?? error();
            const pileViews: PileView[] = [];
            for (const pile of piles) {
                const pileView = this.createPileView_(pile);
                pileView.zIndex = 100 * y;
                pileViews.push(pileView);
            }
            this.pyramidPiles_.push(pileViews);
        }

        // Create columns piles (tableau):
        for (let i = 0; i < game.columns.length; ++i) {
            const pile = game.columns[i] ?? error();
            const pileView = this.createPileView_(pile);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.columnPiles_.push(pileView);
        }

        // Create card views:
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    /**
     * Updates card dimensions based on responsive container sizing.
     * Giza's layout is composed of:
     * 1. A 7-row pyramid with a base of 7 cards/columns.
     * 2. An 8-column tableau directly beneath the pyramid.
     * The wider of the two is the 8-column tableau (8 columns).
     * Thus, the max-column count determining the layout's width is 8.
     */
    private updateSizes_() {
        const maxColumns = 8;
        const { sizeX, sizeY } = this.calculateCardSize(maxColumns, marginX);
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    /**
     * Arranges the pyramid and tableau columns dynamically within the viewport.
     * All positions scale proportionally based on the current card dimensions,
     * ensuring perfect alignment across desktop and mobile devices.
     */
    private layoutPiles_() {
        // Calculate the scaling factor relative to the baseline size of 20
        const scale = this.sizeY / 20;
        const scaledMarginX = marginX * scale;
        const scaledMarginY = marginY * scale;

        // Position helper for pyramid elements, centered relative to each row's width
        const xPosPyramid = (x: number, xMax: number) => (x - 0.5 * (xMax - 1)) * (this.sizeX + scaledMarginX);
        const yPosPyramid = (y: number) => (y - 3.0) * (this.sizeY + scaledMarginY);

        // Position helper for tableau columns, centered relative to the 8 columns
        const xPosColumns = (colIdx: number) => (colIdx - 0.5 * (8 - 1)) * (this.sizeX + scaledMarginX);
        const columnsY = yPosPyramid(6) + this.sizeY + 2.0 * scale;

        // Layout foundation pile (placed at top-right, aligned with the rightmost column)
        {
            const pileView = this.foundationPile_;
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPosColumns(7), yPosPyramid(0));
        }

        // Layout pyramid piles
        for (let y = 0; y < this.game_.pyramid.length; ++y) {
            const gameRow = this.game_.pyramid[y] ?? error();
            for (let x = 0; x < gameRow.length; ++x) {
                const row = this.pyramidPiles_[y] ?? error();
                const pileView = row[x] ?? error();
                pileView.rect = new Rect(this.sizeX, this.sizeY, xPosPyramid(x, gameRow.length), yPosPyramid(y));
            }
        }

        // Layout tableau columns
        for (let i = 0; i < this.game_.columns.length; ++i) {
            const pile = this.game_.columns[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPosColumns(i), columnsY);
            pileView.fanYDown = 3.0 * scale;
        }
    }
}
