import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const margin = 0.6;

export class GamePresenter extends GamePresenterBase<IGame> {
    private sizeY = 20;
    private sizeX = 20 / 1.555555555555;

    private readonly tableauPiles_: PileView[] = [];
    private readonly foundationPiles_: PileView[] = [];
    private readonly bouquetPile_: PileView;

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "flower_garden",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // Tableau piles 0-5 (flower beds):
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pileView = this.createPileView_(game.tableaux[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 100 + i;
            this.tableauPiles_.push(pileView);
        }

        // Foundations 6-9:
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 500 + i;
            this.foundationPiles_.push(pileView);
        }

        // Bouquet (open reserve) 10:
        {
            const pileView = this.createPileView_(game.bouquet);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.bouquetPile_ = pileView;
        }

        // Create cards:
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        const { sizeX, sizeY } = this.calculateCardSize(6, margin);
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const tableSize = 6;

        let vExpand = 1;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            vExpand = 1.5;
        }

        const scale = this.sizeY / 20;
        const scaledMargin = margin * scale;

        const xPos = (colIndex: number) => {
            return (colIndex - 0.5 * (tableSize - 1)) * (this.sizeX + scaledMargin);
        };

        const topY = vExpand * -40 * scale + scaledMargin;
        const middleY = topY + this.sizeY + scaledMargin * 2;
        const bottomY = middleY + this.sizeY + 12 * scale + scaledMargin * 2;

        // Row 1 (Top): Foundations centered (columns 1 to 4)
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i + 1), topY);
        }

        // Row 2 (Middle): Tableau columns 0-5 (flower beds)
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i), middleY);
            pileView.fanYDown = 3.5 * scale;
            pileView.fanYUp = vExpand * 3.5 * scale;
        }

        // Row 3 (Bottom): The bouquet. Fanned out horizontally to fill cols 0 to 5 perfectly.
        {
            const pile = this.game_.bouquet;
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(0), bottomY);

            const bouquetWidth = 5 * (this.sizeX + scaledMargin);
            // Since we have up to 16 cards, we fan across the bouquetWidth horizontally
            pileView.fanXUp = bouquetWidth / 15;
            pileView.fanYUp = 0;
            pileView.fanXDown = bouquetWidth / 15;
            pileView.fanYDown = 0;
        }
    }
}
