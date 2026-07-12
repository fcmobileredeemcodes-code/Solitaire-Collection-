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

    private readonly stockPile_: PileView;
    private readonly wastePile_: PileView;
    private readonly sultanPile_: PileView;
    private readonly foundationPiles_: PileView[] = [];
    private readonly reservePiles_: PileView[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "sultan",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        this.updateSizes_();

        // Create reserve piles
        for (let i = 0; i < this.game_.reserves.length; ++i) {
            const pileView = this.createPileView_(game.reserves[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 100;
            this.reservePiles_.push(pileView);
        }

        // Create active foundation piles
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pileView = this.createPileView_(game.foundations[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 200;
            this.foundationPiles_.push(pileView);
        }

        // Create decorative Sultan pile
        {
            const pileView = this.createPileView_(game.sultan);
            pileView.showFrame = true;
            pileView.zIndex = 200;
            this.sultanPile_ = pileView;
        }

        // Create stock pile
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.stockPile_ = pileView;
        }

        // Create waste pile
        {
            const pileView = this.createPileView_(game.waste);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.wastePile_ = pileView;
        }

        // Create card views for all cards
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.relayoutAll_();
    }

    private updateSizes_() {
        let { sizeX, sizeY } = this.calculateCardSize(5, margin);
        if (sizeY > 16) {
            sizeY = 16;
            sizeX = sizeY / 1.5555555555555;
        }
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }

    protected onResize_() {
        this.updateSizes_();
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private layoutPiles_() {
        const currentScale = this.sizeY / 20;
        const scaledMargin = margin * currentScale;

        // Position helpers to compute x/y centered around layout center (5 columns, 4 rows)
        const xPos = (col: number) => (col - 2) * (this.sizeX + scaledMargin);
        const yPos = (row: number) => (row - 1.5) * (this.sizeY + scaledMargin);

        // Lay out Left reserves (col 0, rows 0-3)
        for (let i = 0; i < 4; ++i) {
            const pile = this.game_.reserves[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(0), yPos(i));
        }

        // Lay out Right reserves (col 4, rows 0-3)
        for (let i = 0; i < 4; ++i) {
            const pile = this.game_.reserves[i + 4] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(4), yPos(i));
        }

        // Lay out 3x3 Grid:
        // Row 0 (col 1, 2, 3): foundations 0, 1, 2
        for (let i = 0; i < 3; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i + 1), yPos(0));
        }

        // Row 1 (col 1, 2, 3): foundation 3, Sultan, foundation 4
        {
            // foundation 3
            const f3 = this.game_.foundations[3] ?? error();
            const f3View = this.getPileView_(f3);
            f3View.rect = new Rect(this.sizeX, this.sizeY, xPos(1), yPos(1));

            // Sultan (center)
            const sultanView = this.getPileView_(this.game_.sultan);
            sultanView.rect = new Rect(this.sizeX, this.sizeY, xPos(2), yPos(1));

            // foundation 4
            const f4 = this.game_.foundations[4] ?? error();
            const f4View = this.getPileView_(f4);
            f4View.rect = new Rect(this.sizeX, this.sizeY, xPos(3), yPos(1));
        }

        // Row 2 (col 1, 2, 3): foundations 5, 6, 7
        for (let i = 0; i < 3; ++i) {
            const pile = this.game_.foundations[i + 5] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(this.sizeX, this.sizeY, xPos(i + 1), yPos(2));
        }

        // Row 3 (col 1, 2): stock, waste
        {
            const stockView = this.getPileView_(this.game_.stock);
            stockView.rect = new Rect(this.sizeX, this.sizeY, xPos(1), yPos(3));

            const wasteView = this.getPileView_(this.game_.waste);
            wasteView.rect = new Rect(this.sizeX, this.sizeY, xPos(2), yPos(3));
        }
    }
}
