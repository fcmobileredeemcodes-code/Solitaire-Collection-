import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { IGame } from "../Model/IGame";

const scale = 0.6;
const margin = 1.5 * scale;
const sizeY = 20 * scale;
const sizeX = sizeY / 1.555555555555;
const rowOffset = sizeY * 0.45;

function getPeakCoords(index: number): { col: number; row: number } {
    if (index >= 0 && index <= 2) {
        // Row 1
        return { col: 1.5 + index * 3.0, row: 0 };
    } else if (index >= 3 && index <= 8) {
        // Row 2
        const sub = index - 3;
        const peakGroup = Math.floor(sub / 2);
        const localCol = sub % 2; // 0 or 1
        return { col: 1.0 + peakGroup * 3.0 + localCol, row: 1 };
    } else if (index >= 9 && index <= 17) {
        // Row 3
        const sub = index - 9;
        return { col: 0.5 + sub, row: 2 };
    } else {
        // Row 4
        const sub = index - 18;
        return { col: sub, row: 3 };
    }
}

export class GamePresenter extends GamePresenterBase<IGame> {
    private readonly stockPile_: PileView;
    private readonly wastePile_: PileView;
    private readonly peakPiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "tripeaks",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // create stock pile
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            pileView.zIndex = 500;
            this.stockPile_ = pileView;
        }

        // create waste pile
        {
            const pileView = this.createPileView_(game.waste);
            pileView.showFrame = true;
            pileView.zIndex = 600;
            this.wastePile_ = pileView;
        }

        // create peak piles
        for (let i = 0; i < game.peaks.length; ++i) {
            const pile = game.peaks[i] ?? error();
            const pileView = this.createPileView_(pile);
            const coords = getPeakCoords(i);
            pileView.zIndex = 100 * (coords.row + 1);
            this.peakPiles_.push(pileView);
        }

        // create cards
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
        const xPos = (col: number) => (col - 4.5) * (sizeX + margin);
        const yPos = (row: number) => (row - 1.5) * rowOffset;

        // Stock and waste positioned at the bottom centered
        {
            const pileView = this.stockPile_;
            pileView.rect = new Rect(sizeX, sizeY, xPos(3.5), yPos(4.3));
        }
        {
            const pileView = this.wastePile_;
            pileView.rect = new Rect(sizeX, sizeY, xPos(5.5), yPos(4.3));
        }

        // Layout peaks
        for (let i = 0; i < this.game_.peaks.length; ++i) {
            const pileView = this.peakPiles_[i] ?? error();
            const coords = getPeakCoords(i);
            pileView.rect = new Rect(sizeX, sizeY, xPos(coords.col), yPos(coords.row));
        }
    }
}
