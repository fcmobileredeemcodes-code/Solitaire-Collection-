import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const margin = 1;

export class GamePresenter extends GamePresenterBase<IGame> {
    private sizeY = 17;
    private sizeX = 17 / 1.555555555555;

    private readonly stockPile_: PileView;
    private readonly wastePile_: PileView;
    private readonly foundationPiles_: PileView[] = [];
    private readonly carpetPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "carpet",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // create piles:
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            this.stockPile_ = pileView;
        }
        {
            const pileView = this.createPileView_(game.waste);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.wastePile_ = pileView;
        }
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);
        }
        for (let i = 0; i < this.game_.carpet.length; ++i) {
            const pileView = this.createPileView_(game.carpet[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.carpetPiles_.push(pileView);
        }

        // create cards:
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        const { sizeX, sizeY } = this.calculateCardSize(6, margin);
        // Cap sizeY to 17 or lower since we have 5 vertical rows (5 or more vertical rows)
        this.sizeY = Math.min(sizeY, 17);
        this.sizeX = this.sizeY / 1.5555555555555;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const scale = this.sizeY / 20;
        const scaledMargin = margin * scale;

        const xPosTop = (colIndex: number) => {
            return (colIndex - 0.5 * (6 - 1)) * (this.sizeX + scaledMargin);
        };

        const xPosCarpet = (colIndex: number) => {
            return (colIndex - 0.5 * (5 - 1)) * (this.sizeX + scaledMargin);
        };

        const yPos = (rowIndex: number) => {
            return (rowIndex - 2.0) * (this.sizeY + scaledMargin * 2.0);
        };

        // Top Row (rowIndex = 0)
        // Stock at col 0, Waste at col 1, Foundations at cols 2 to 5
        this.stockPile_.rect = new Rect(this.sizeX, this.sizeY, xPosTop(0), yPos(0));
        this.wastePile_.rect = new Rect(this.sizeX, this.sizeY, xPosTop(1), yPos(0));

        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPosTop(2 + i), yPos(0));
        }

        // Carpet cells (4x5 grid, rowIndices 1 to 4, colIndices 0 to 4)
        for (let r = 0; r < 4; ++r) {
            for (let c = 0; c < 5; ++c) {
                const index = r * 5 + c;
                const pile = this.game_.carpet[index] ?? error();
                const pileView = this.getPileView_(pile);
                pileView.rect = new Rect(this.sizeX, this.sizeY, xPosCarpet(c), yPos(1 + r));
            }
        }
    }
}
