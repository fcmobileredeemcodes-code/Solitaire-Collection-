import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const margin = 1;

export class GamePresenter extends GamePresenterBase<IGame> {
    private readonly stockPile_: PileView | undefined;
    private readonly wastePile_: PileView | undefined;
    private readonly foundationPiles_: PileView[] = [];
    private readonly tableauPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "clockengine",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        if (game.stock) {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            this.stockPile_ = pileView;
        }

        if (game.waste) {
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
        const tableSize = this.game_.options.engineMode === "grandfather" ? 8 : 6;
        const { sizeX, sizeY } = this.calculateCardSize(tableSize, margin);

        const scale = sizeY / 20;
        const scaledMargin = margin * scale;

        let vExpand = 1;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            vExpand = 1.5;
        }

        if (this.game_.options.engineMode === "grandfather") {
            const radiusX = sizeX * 1.8;
            const radiusY = sizeY * 1.5;
            
            const clockCenterY = vExpand * -15 * scale;
            
            // Layout 12 foundations in a circle
            // Index 0 is Hour 1, Index 11 is Hour 12
            for (let i = 0; i < 12; i++) {
                const hour = i + 1;
                // 12 o'clock is 0 rad, 3 o'clock is pi/2, etc.
                const angle = (hour * Math.PI) / 6;
                const x = Math.sin(angle) * radiusX;
                const y = -Math.cos(angle) * radiusY + clockCenterY;
                
                const pile = this.game_.foundations[i] ?? error();
                const pileView = this.getPileView_(pile);
                pileView.rect = new Rect(sizeX, sizeY, x, y);
            }
            
            // Layout 8 tableaus below the clock
            const tableauStartY = clockCenterY + radiusY + sizeY + scaledMargin;
            const xPos = (i: number) => {
                return (i - 0.5 * (8 - 1)) * (sizeX + scaledMargin);
            };
            for (let i = 0; i < 8; i++) {
                const pile = this.game_.tableaux[i] ?? error();
                const pileView = this.getPileView_(pile);
                pileView.rect = new Rect(sizeX, sizeY, xPos(i), tableauStartY);
                pileView.fanYDown = 3.5 * scale;
                pileView.fanYUp = vExpand * 3.5 * scale;
            }
        } else {
            // Simplicity Mode
            const xPos = (i: number) => {
                return (i - 0.5 * (tableSize - 1)) * (sizeX + scaledMargin);
            };

            const topY = vExpand * -35 * scale + scaledMargin;

            if (this.game_.stock && this.stockPile_) {
                this.stockPile_.rect = new Rect(sizeX, sizeY, xPos(0), topY);
            }
            if (this.game_.waste && this.wastePile_) {
                this.wastePile_.rect = new Rect(sizeX, sizeY, xPos(1), topY);
                this.wastePile_.fanXUp = 3 * scale;
            }

            for (let i = 0; i < this.game_.foundations.length; ++i) {
                const pile = this.game_.foundations[i] ?? error();
                const pileView = this.getPileView_(pile);
                pileView.rect = new Rect(
                    sizeX,
                    sizeY,
                    xPos(tableSize - this.game_.foundations.length + i),
                    topY
                );
            }

            for (let i = 0; i < this.game_.tableaux.length; ++i) {
                const pile = this.game_.tableaux[i] ?? error();
                const pileView = this.getPileView_(pile);
                pileView.rect = new Rect(
                    sizeX,
                    sizeY,
                    xPos(i), 
                    topY + sizeY + scaledMargin * 2
                );
                pileView.fanYDown = 3.5 * scale;
                pileView.fanYUp = vExpand * 3.5 * scale;
            }
        }
    }
}
