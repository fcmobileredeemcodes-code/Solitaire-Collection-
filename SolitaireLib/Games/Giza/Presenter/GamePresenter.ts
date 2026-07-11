import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const scale = 0.6;
const marginX = 1.5 * scale;
const marginY = -7 * scale;
const sizeY = 20 * scale;
const sizeX = sizeY / 1.555555555555;

export class GamePresenter extends GamePresenterBase<IGame> {
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

        // create foundation pile:
        {
            const pileView = this.createPileView_(game.foundation);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPile_ = pileView;
        }

        // create pyramid piles:
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

        // create columns piles:
        for (let i = 0; i < game.columns.length; ++i) {
            const pile = game.columns[i] ?? error();
            const pileView = this.createPileView_(pile);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.columnPiles_.push(pileView);
        }

        // create cards:
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    protected onResize_() {
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const xPosPyramid = (x: number, xMax: number) => (x - 0.5 * (xMax - 1)) * (sizeX + marginX);
        const yPosPyramid = (y: number) => (y - 3.0) * (sizeY + marginY);

        const xPosColumns = (colIdx: number) => (colIdx - 0.5 * (8 - 1)) * (sizeX + marginX);
        const columnsY = yPosPyramid(6) + sizeY + 2.0 * scale;

        // Foundation pile (placed at top-right, aligned with the rightmost column)
        {
            const pileView = this.foundationPile_;
            pileView.rect = new Rect(sizeX, sizeY, xPosColumns(7), yPosPyramid(0));
        }

        // Layout pyramid
        for (let y = 0; y < this.game_.pyramid.length; ++y) {
            const gameRow = this.game_.pyramid[y] ?? error();
            for (let x = 0; x < gameRow.length; ++x) {
                const row = this.pyramidPiles_[y] ?? error();
                const pileView = row[x] ?? error();
                pileView.rect = new Rect(sizeX, sizeY, xPosPyramid(x, gameRow.length), yPosPyramid(y));
            }
        }

        // Layout columns (tableaux)
        for (let i = 0; i < this.game_.columns.length; ++i) {
            const pile = this.game_.columns[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPosColumns(i), columnsY);
            pileView.fanYDown = 3.0 * scale;
        }
    }
}
