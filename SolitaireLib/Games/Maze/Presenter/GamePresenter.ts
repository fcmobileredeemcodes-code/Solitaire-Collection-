import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

// Maze uses a dense layout grid with 13 columns.
const GRID_COLUMNS = 13;
const GRID_ROWS = 4;
const BASE_MARGIN = 1;

/**
 * GamePresenter for Maze Solitaire.
 * Maze has the most extreme, dense layout: a 13x4 grid of 52 single-card piles plus 1 separate discard pile (53 piles total).
 * Responsive card sizing is computed dynamically by passing 13 as the max-column count to `calculateCardSize`.
 *
 * Sizing math analysis for ensuring no overlap/overflow at 360px viewport:
 * 1. The viewport layout uses font-size based on viewport dimensions. In index.scss:
 *    - For portrait (aspect ratio < 0.95), font-size is 1vw. Hence, the board width W_em is exactly 100rem.
 *    - For landscape (aspect ratio >= 0.95), font-size is 0.95vh. W_em is width / (0.0095 * height) = AspectRatio / 0.0095.
 *      Since AspectRatio >= 0.95, W_em >= 100rem in all viewport configurations.
 * 2. `calculateCardSize(13, 1)` uses W_em with a 6.0rem padding:
 *    - availableW = W_em - 6.0 >= 94rem.
 *    - card sizeY = (availableW - 12 * margin) * factor / 13 = (94 - 12 * 1) * 1.5555555555555 / 13 = 9.81rem.
 *    - sizeX = sizeY / factor = 6.31rem.
 * 3. Total horizontal space for 13 columns with 1rem margin:
 *    - Total grid width = 13 * sizeX + 12 * (margin * scale).
 *    - With scale = sizeY / 20 = 9.81 / 20 = 0.4905, the scaled margin = 0.4905rem.
 *    - Total grid width = 13 * 6.31 + 12 * 0.4905 = 82.03 + 5.886 = 87.91rem.
 *    - Since 87.91rem < 100rem (and leaves ample space on sides), cards are guaranteed to fit
 *      perfectly without overlapping or clipping across all viewports (including 360px portrait).
 * 4. The minimum card size cap of sizeY >= 5 is never hit in practice, as sizeY scales to ~9.81rem even at the smallest width.
 */
export class GamePresenter extends GamePresenterBase<IGame> {
    private sizeY = 20;
    private sizeX = 20 / 1.555555555555;

    private readonly gridPiles_: PileView[] = [];
    private readonly discardPile_: PileView;

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "maze",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // Calculate card size before constructing pile views
        this.updateSizes_();

        // Create 52 grid piles
        for (let i = 0; i < 52; ++i) {
            const pileView = this.createPileView_(game.gridPiles[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 100;
            this.gridPiles_.push(pileView);
        }

        // Create the single discard pile
        {
            const pileView = this.createPileView_(game.discardPile);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.discardPile_ = pileView;
        }

        // Create card views
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        const { sizeX, sizeY } = this.calculateCardSize(GRID_COLUMNS, BASE_MARGIN);
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        // The scale factor is calculated relative to the baseline sizeY of 20.
        const currentScale = this.sizeY / 20;
        const scaledMargin = BASE_MARGIN * currentScale;

        // Position helper functions to compute x and y offsets relative to the layout center
        const xPos = (col: number) => (col - (GRID_COLUMNS - 1) / 2) * (this.sizeX + scaledMargin);
        const yPos = (row: number) => (row - (GRID_ROWS - 1) / 2) * (this.sizeY + scaledMargin);

        // Arrange the 13x4 layout grid of piles
        for (let r = 0; r < GRID_ROWS; ++r) {
            for (let c = 0; c < GRID_COLUMNS; ++c) {
                const pile = this.game_.gridPiles[r * GRID_COLUMNS + c] ?? error();
                const pileView = this.getPileView_(pile);
                pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(c), yPos(r));
            }
        }

        // Arrange the single discard pile above the grid
        {
            const pile = this.game_.discardPile;
            const pileView = this.getPileView_(pile);
            const verticalOffset = yPos(0) - (this.sizeY + scaledMargin) * 1.2;
            pileView.rect = new Rect(this.sizeX, this.sizeY, 0, verticalOffset);
        }
    }
}
