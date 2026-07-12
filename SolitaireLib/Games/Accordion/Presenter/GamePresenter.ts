import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IPile } from "~CardLib/Model/IPile";
import { IGame } from "../Model/IGame";

export class GamePresenter extends GamePresenterBase<IGame> {
    private sizeY = 20;
    private sizeX = 20 / 1.555555555555;
    private colsPerRow_ = 13;

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "accordion",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // create pile views
        for (let i = 0; i < 52; ++i) {
            const pile = game.piles[i];
            if (!pile) continue;
            const pileView = this.createPileView_(pile);
            pileView.showFrame = true;
            pileView.zIndex = 100;
        }

        // create card views
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        let cols = 13;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            cols = 7;
        }
        this.colsPerRow_ = cols;
        const { sizeX, sizeY } = this.calculateCardSize(cols, 1);
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
        const scaledMargin = 1 * scale;

        const maxRows = Math.ceil(52 / this.colsPerRow_);
        const xPos = (col: number) => (col - (this.colsPerRow_ - 1) / 2) * (this.sizeX + scaledMargin);
        const yPos = (row: number) => (row - (maxRows - 1) / 2) * (this.sizeY + scaledMargin);

        const nonEvPiles = this.game_.piles.filter(p => p.length > 0);

        for (const pile of this.game_.piles) {
            const pileView = this.getPileView_(pile);
            if (pile.length === 0) {
                pileView.showFrame = false;
                pileView.rect = new Rect(0, 0, 9999, 9999);
                pileView.hitbox = new Rect(0, 0, 0, 0);
            } else {
                const idx = nonEvPiles.indexOf(pile);
                const col = idx % this.colsPerRow_;
                const row = Math.floor(idx / this.colsPerRow_);
                pileView.showFrame = true;
                pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(col), yPos(row));
                pileView.fanXUp = 0;
                pileView.fanXDown = 0;
                pileView.fanYUp = 0;
                pileView.fanYDown = 0;
            }
        }
    }

    private inRelayout_ = false;

    protected override relayoutPile_(pileView: PileView, pile: IPile) {
        if (this.inRelayout_) {
            super.relayoutPile_(pileView, pile);
            return;
        }

        this.inRelayout_ = true;
        try {
            this.layoutPiles_();
            for (const p of this.game_.piles) {
                const pv = this.getPileView_(p);
                super.relayoutPile_(pv, p);
            }
        } finally {
            this.inRelayout_ = false;
        }
    }
}
