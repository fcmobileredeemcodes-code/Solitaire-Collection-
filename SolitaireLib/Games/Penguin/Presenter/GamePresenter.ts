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

    private readonly tableauPiles_: PileView[] = [];
    private readonly flipperPiles_: PileView[] = [];
    private readonly foundationPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "penguin",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // Tableau piles 0-6:
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pileView = this.createPileView_(game.tableaux[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.tableauPiles_.push(pileView);
        }

        // Flipper cells 7-13:
        for (let i = 0; i < this.game_.flippers.length; ++i) {
            const pileView = this.createPileView_(game.flippers[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.flipperPiles_.push(pileView);
        }

        // Foundations 14-17:
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);
        }

        // Create cards:
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        const { sizeX, sizeY } = this.calculateCardSize(11, margin);
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const tableSize = 11;
        const scale = this.sizeY / 20;
        const scaledMargin = margin * scale;

        let vExpand = 1;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            vExpand = 1.5;
        }

        const xPos = (colIndex: number) => {
            return (colIndex - 0.5 * (tableSize - 1)) * (this.sizeX + scaledMargin);
        };

        const topY = vExpand * -35 * scale + scaledMargin;
        const bottomY = topY + this.sizeY + scaledMargin * 2;

        // Row 1 (Top): Flippers on left side (columns 0-6), Foundations on right side (columns 7-10)
        for (let i = 0; i < this.game_.flippers.length; ++i) {
            const pile = this.game_.flippers[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i), topY);
        }

        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i + 7), topY);
        }

        // Row 2 (Bottom): Tableau stacks 0-6 arranged horizontally directly beneath flippers (columns 0-6)
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i), bottomY);
            pileView.fanYDown = 3.5 * scale;
            pileView.fanYUp = vExpand * 3.5 * scale;
        }
    }
}
