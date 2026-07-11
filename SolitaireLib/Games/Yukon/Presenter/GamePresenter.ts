import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const margin = 1;

export class GamePresenter extends GamePresenterBase<IGame> {
    private readonly tableauPiles_: PileView[] = [];
    private readonly foundationPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "yukon",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // create tableaux piles:
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pileView = this.createPileView_(game.tableaux[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.tableauPiles_.push(pileView);
        }

        // create foundation piles:
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);
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

    /**
     * Positions all tableau and foundation piles dynamically.
     * Computes card size using the shared responsive method: calculateCardSize(8, margin).
     * Preserves Yukon's custom vertical foundation stacking logic using the newly-computed dynamic values.
     */
    private layoutPiles_() {
        const tableSize = 8;

        // Call the shared responsive sizing method, passing correct max-column count (8 columns)
        const { sizeX, sizeY } = this.calculateCardSize(tableSize, margin);

        const scale = sizeY / 20;
        const scaledMargin = margin * scale;

        let vExpand = 1;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            vExpand = 1.5;
        }
        const xPos = (colIndex: number) => {
            return (colIndex - 0.5 * (tableSize - 1)) * (sizeX + scaledMargin);
        };

        const topY = vExpand * -35 * scale + scaledMargin;

        // Tableaus 0-6: spaced out across the left side
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(i), topY);
            pileView.fanYDown = 3.5 * scale;
            pileView.fanYUp = vExpand * 3.5 * scale;
        }

        // Stack 7 (Foundation 0) on the far right
        {
            const pile = this.game_.foundations[0] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(7), topY);
        }

        // Foundations 8-10 (Foundations 1-3) positioned vertically directly underneath Stack 7.
        // We preserve Yukon's vertical stacking logic: topY + i * (sizeY + margin)
        // using the newly-computed dynamic sizeY and dynamic scaled margin.
        for (let i = 1; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(7), topY + i * (sizeY + scaledMargin));
        }
    }
}
