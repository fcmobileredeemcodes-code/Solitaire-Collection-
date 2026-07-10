import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const scale = 0.7;
const margin = 1 * scale;
const sizeY = 20 * scale;
const sizeX = sizeY / 1.555555555555;

export class GamePresenter extends GamePresenterBase<IGame> {
    private readonly stockPile_: PileView;
    private readonly foundationPile_: PileView;
    private readonly tableauPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "acesup",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // create piles:
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            this.stockPile_ = pileView;
        }
        {
            const pileView = this.createPileView_(game.foundation);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPile_ = pileView;
        }
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pileView = this.createPileView_(game.tableaux[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.tableauPiles_.push(pileView);
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
        const aspect = this.rootView_.element.clientWidth / this.rootView_.element.clientHeight;
        const tableSize = aspect < 1.15 ? 8 : 9; // Grid sizing of 7 + 1 or 7 + 2 columns
        const colStart = tableSize === 8 ? 1 : 1.5;

        let vExpand = 1;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            vExpand = 1.5;
        }

        const xPos = (colIndex: number) => {
            return (colIndex - 0.5 * (tableSize - 1)) * (sizeX + margin);
        };

        const topY = vExpand * -35 + margin;

        // Foundation (Stack 4) is placed at the starting horizontal position
        {
            const pile = this.game_.foundation;
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(colStart), topY);
        }

        // Tableau piles (0-3) are positioned iteratively to the right of the foundation, fanning down
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(colStart + 1 + i), topY);
            pileView.fanYDown = 3.5 * scale;
            pileView.fanYUp = vExpand * 3.5 * scale;
        }

        // Stock (Stack 5) is placed to the right of Tableau 3
        {
            const pile = this.game_.stock;
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(colStart + 5), topY);
        }
    }
}
