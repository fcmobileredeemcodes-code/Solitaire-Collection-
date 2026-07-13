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
    private readonly foundationPiles_: PileView[] = [];
    private readonly stockPile_: PileView;

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "colorado",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // Create tableau piles (0-19):
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pileView = this.createPileView_(game.tableaux[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.tableauPiles_.push(pileView);
        }

        // Create foundation piles (20-27):
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);
        }

        // Create stock pile (28):
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.stockPile_ = pileView;
        }

        // Create cards:
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        const { sizeX, sizeY } = this.calculateCardSize(10, margin);
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const tableSize = 10;
        const scale = this.sizeY / 20;
        const scaledMargin = margin * scale;

        const xPos = (colIndex: number) => {
            return (colIndex - 0.5 * (tableSize - 1)) * (this.sizeX + scaledMargin);
        };

        const yPos = (rowIndex: number) => {
            return (rowIndex - 1.0) * (this.sizeY + scaledMargin * 2.0);
        };

        // Row 0 (Top): Stock and Foundations:
        // Stock at column 0:
        {
            const pileView = this.getPileView_(this.game_.stock);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(0), yPos(0));
        }

        // Foundations 0-7 at columns 1..8:
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i + 1), yPos(0));
        }

        // Row 1 (Middle): Tableau piles 0 to 9:
        for (let i = 0; i < 10; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i), yPos(1));
        }

        // Row 2 (Bottom): Tableau piles 10 to 19:
        for (let i = 0; i < 10; ++i) {
            const pile = this.game_.tableaux[i + 10] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i), yPos(2));
        }
    }
}
