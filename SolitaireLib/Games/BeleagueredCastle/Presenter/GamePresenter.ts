import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const margin = 1;

export class GamePresenter extends GamePresenterBase<IGame> {
    private sizeY = 20;
    private sizeX = 20 / 1.555555555555;

    private readonly foundationPiles_: PileView[] = [];
    private readonly tableauPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "beleagueredcastle",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // create piles:
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);
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

    private updateSizes_() {
        const { sizeX, sizeY } = this.calculateCardSize(7, margin);
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const scale = this.sizeY / 20;
        const scaledMarginX = margin * scale;
        const scaledMarginY = margin * scale;

        // Position helper for rows (0 to 3)
        const yPos = (rowIdx: number) => {
            return (rowIdx - 1.5) * (this.sizeY + scaledMarginY);
        };

        // Middle foundation column is at X = 0
        const foundationX = 0;

        // Left tableau piles are placed to the left of the foundation fanned left
        const leftTableauX = -this.sizeX - scaledMarginX;

        // Right tableau piles are placed to the right of the foundation fanned right
        const rightTableauX = this.sizeX + scaledMarginX;

        // Apply layouts to foundations
        for (let i = 0; i < 4; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, foundationX, yPos(i));
        }

        // Apply layouts to left tableaux (indices 0 to 3) fanned to the left (negative fanXUp)
        for (let i = 0; i < 4; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, leftTableauX, yPos(i));
            pileView.fanXUp = -2.5 * scale;
            pileView.fanXDown = -2.5 * scale;
        }

        // Apply layouts to right tableaux (indices 4 to 7) fanned to the right (positive fanXUp)
        for (let i = 0; i < 4; ++i) {
            const pile = this.game_.tableaux[i + 4] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, rightTableauX, yPos(i));
            pileView.fanXUp = 2.5 * scale;
            pileView.fanXDown = 2.5 * scale;
        }
    }
}
