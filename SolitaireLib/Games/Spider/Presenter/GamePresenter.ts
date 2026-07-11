import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const scale = 1.0;
const margin = 1 * scale;
const sizeY = 20 * scale;
const sizeX = sizeY / 1.555555555555;

export class GamePresenter extends GamePresenterBase<IGame> {
    private readonly stockPile_: PileView;
    private readonly foundationPiles_: PileView[] = [];
    private readonly tableauPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "spider",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // Create tableaux piles (0 to 9)
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pileView = this.createPileView_(game.tableaux[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.tableauPiles_.push(pileView);
        }

        // Create foundation piles (10 to 17)
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);
        }

        // Create stock pile (18)
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.stockPile_ = pileView;
        }

        // Create cards
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
        // Horizontal spacing calculated for a 10-column grid layout (columns 0-9)
        const tableSize = 10;

        let vExpand = 1;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            vExpand = 1.5;
        }

        const xPos = (colIndex: number) => {
            return (colIndex - 0.5 * (tableSize - 1)) * (sizeX + margin);
        };

        const topY = vExpand * -35 + margin;
        const bottomY = topY + sizeY + margin * 2;

        // Row 1 (Top): Foundations 10-17 placed horizontally from left to right (columns 0-7)
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(i), topY);
        }

        // Row 1 (Top): Stock 18 is placed at the far right (column 9)
        {
            const pile = this.game_.stock;
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(9), topY);
        }

        // Row 2 (Bottom): Tableau stacks 0-9 arranged beneath
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(i), bottomY);
            // Tableau columns in Spider can grow quite long, so we use appropriate cascading spacing
            pileView.fanYDown = 3.5;
            pileView.fanYUp = vExpand * 3.5;
        }
    }
}
