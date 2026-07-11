import { error } from "~CardLib/Debug";
import { GamePresenterBase } from "~CardLib/Presenter/GamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { PileView } from "~CardLib/View/PileView";
import { Rect } from "~CardLib/View/Rect";
import { Rank } from "~CardLib/Model/Rank";
import { IGame } from "../Model/IGame";
import { Game } from "../Model/Game";

const scale = 0.3; // shrink the viewport footprint
const margin = 1 * scale;
const sizeY = 20 * scale;
const sizeX = sizeY / 1.555555555555;

export class GamePresenter extends GamePresenterBase<IGame> {
    private readonly stockPile_: PileView;
    private readonly wastePile_: PileView;
    private readonly foundationPiles_: PileView[] = [];
    private readonly tableauPiles_: PileView[] = [];
    private readonly overlays_: HTMLElement[] = [];

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "calculation",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: IGame, rootView: IView) {
        super(game, rootView);

        // create tableaux piles: Stacks 0, 1, 2, 3
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pileView = this.createPileView_(game.tableaux[i] ?? error());
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.tableauPiles_.push(pileView);
        }

        // create foundations piles: Stacks 4, 5, 6, 7
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = game.foundations[i] ?? error();
            const pileView = this.createPileView_(pile);
            pileView.showFrame = true;
            pileView.zIndex = 800;
            this.foundationPiles_.push(pileView);

            // create text overlays for dynamic arithmetic progression steps
            const overlay = document.createElement("div");
            overlay.className = "calculationOverlay";
            pileView.element.appendChild(overlay);
            this.overlays_.push(overlay);
        }

        // create discard/trash pile: Stack 8
        {
            const pileView = this.createPileView_(game.waste);
            pileView.showFrame = true;
            pileView.zIndex = 50;
            this.wastePile_ = pileView;
        }

        // create stock/main pile: Stack 9
        {
            const pileView = this.createPileView_(game.stock);
            pileView.showFrame = true;
            this.stockPile_ = pileView;
        }

        // create cards:
        for (const card of game.cards) {
            this.createCardView_(card);
        }

        this.layoutPiles_();
        this.updateOverlays_();
        this.relayoutAll_();

        // Listen for cards changed on foundations to update progression step overlays
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const oldCardsChanged = pile.cardsChanged;
            pile.cardsChanged = () => {
                oldCardsChanged();
                this.updateOverlays_();
            };
        }
    }

    protected onResize_() {
        this.layoutPiles_();
        this.relayoutAll_();
    }

    private getRankStr_(rank: Rank) {
        switch (rank) {
            case Rank.Ace: return "A";
            case Rank.Two: return "2";
            case Rank.Three: return "3";
            case Rank.Four: return "4";
            case Rank.Five: return "5";
            case Rank.Six: return "6";
            case Rank.Seven: return "7";
            case Rank.Eight: return "8";
            case Rank.Nine: return "9";
            case Rank.Ten: return "10";
            case Rank.Jack: return "J";
            case Rank.Queen: return "Q";
            case Rank.King: return "K";
            default: return "";
        }
    }

    private updateOverlays_() {
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const overlay = this.overlays_[i] ?? error();
            const seq = Game.sequences[i] ?? error();
            const nextRank = pile.length < 13 ? seq[pile.length] : undefined;
            const step = i + 1;
            if (nextRank !== undefined) {
                overlay.textContent = `+${step}: ${this.getRankStr_(nextRank)}`;
            } else {
                overlay.textContent = `+${step}: Done`;
            }
        }
    }

    private layoutPiles_() {
        const tableSize = 7; // framework layout size

        let vExpand = 1;
        if (window.matchMedia("screen and (max-aspect-ratio: 100/130)").matches) {
            vExpand = 1.5;
        }

        const xPos = (colIndex: number) => {
            return (colIndex - 0.5 * (tableSize - 1)) * (sizeX + margin);
        };

        // Vertically center the 2-row layout elegantly:
        const topY = vExpand * -10;
        const bottomY = topY + sizeY + 3;

        // Row 1 (Top): Foundations 4, 5, 6, 7 aligned horizontally in columns 0, 1, 2, 3
        for (let i = 0; i < this.game_.foundations.length; ++i) {
            const pile = this.game_.foundations[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(i), topY);
        }

        // Row 2 (Bottom): Tableau 0, 1, 2, 3 in columns 0, 1, 2, 3
        for (let i = 0; i < this.game_.tableaux.length; ++i) {
            const pile = this.game_.tableaux[i] ?? error();
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(i), bottomY);
            pileView.fanYDown = 3.5 * scale;
            pileView.fanYUp = vExpand * 3.5 * scale;
        }

        // Waste/Trash Stack 8: column 4, Row 2 (Bottom)
        {
            const pile = this.game_.waste;
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(4), bottomY);
            pileView.fanYDown = 3.5 * scale;
            pileView.fanYUp = vExpand * 3.5 * scale;
        }

        // Stock Stack 9: column 5, Row 2 (Bottom)
        {
            const pile = this.game_.stock;
            const pileView = this.getPileView_(pile);
            pileView.rect = new Rect(sizeX, sizeY, xPos(5), bottomY);
        }
    }
}
