import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const scale = 0.6;
const margin = 1 * scale;
const sizeY = 20 * scale;
const sizeX = sizeY / 1.555555555555;

export class GamePresenter extends GamePresenterBase<IGame> {
    private readonly gridPiles_: PileView[] = [];
    private readonly discardPile_: PileView;

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "maze",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // create grid piles:
        for (let i = 0; i < 52; ++i) {
            const pileView = this.createPileView_(game.gridPiles[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 100;
            this.gridPiles_.push(pileView);
        }

        // create discard pile:
        {
            const pileView = this.createPileView_(game.discardPile);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.discardPile_ = pileView;
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
        const xPos = (col: number) => (col - 6) * (sizeX + margin);
        const yPos = (row: number) => (row - 1.5) * (sizeY + margin);

        for (let r = 0; r < 4; ++r) {
            for (let c = 0; c < 13; ++c) {
                const pile = this.game_.gridPiles[r * 13 + c] ?? error();
                const pileView = this.getPileView_(pile);
                pileView.rect = new Rect(sizeX, sizeY, xPos(c), yPos(r));
            }
        }

        {
            const pile = this.game_.discardPile;
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, 0, yPos(0) - (sizeY + margin) * 1.2);
        }
    }
}
