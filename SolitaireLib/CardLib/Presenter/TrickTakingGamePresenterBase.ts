import * as Debug from "../Debug";
import { DelayHint } from "../Model/DelayHint";
import { ICard } from "../Model/ICard";
import { IPile } from "../Model/IPile";
import { CardView } from "../View/CardView";
import { TrickTakingCardView } from "../View/TrickTakingCardView";
import { PileView } from "../View/PileView";
import { Rect } from "../View/Rect";
import { IGamePresenter } from "./IGamePresenter";
import { TrickTakingGameBase } from "../Model/TrickTakingGameBase";
import { AvatarView } from "./AvatarView";
import { Card } from "../Model/Card";
import { Pile } from "../Model/Pile";
import { Suit } from "../Model/Suit";
import { IView } from "../View/IView";

export abstract class TrickTakingGamePresenterBase<TGame extends TrickTakingGameBase> implements IGamePresenter {
    protected readonly game_: TGame;
    protected readonly rootView_: IView;

    protected abstract get saveDataKey_(): string;

    private readonly newGameButton_ = document.getElementById("newGameButton");
    private readonly undoButton_ = document.getElementById("undoButton");
    private readonly redoButton_ = document.getElementById("redoButton");

    protected cardViews_: CardView[] = [];
    protected cardToCardView_ = new Map<ICard, CardView>();
    protected pileViews_: PileView[] = [];
    protected pileToPileView_ = new Map<IPile, PileView>();

    protected avatarViews_: AvatarView[] = [];
    protected centerStatusPanel_!: HTMLElement;
    protected logPanel_!: HTMLElement;

    protected modalBackdrop_!: HTMLElement;
    protected modalContainer_!: HTMLElement;
    protected modalTitle_!: HTMLElement;
    protected modalBody_!: HTMLElement;

    constructor(game: TGame, rootView: IView) {
        this.game_ = game;
        this.rootView_ = rootView;

        // Hide solitaire-specific Undo/Redo buttons
        if (this.undoButton_) this.undoButton_.style.display = "none";
        if (this.redoButton_) this.redoButton_.style.display = "none";

        this.rootView_.element.classList.add("trickTakingGame");

        game.wonChanged = () => {
            this.onGameWonChanged_();
        };

        this.newGameButton_?.addEventListener("click", this.onNewGameButtonClick_);
        window.addEventListener("resize", this.onWindowResize_);
        window.addEventListener("orientationchange", this.onWindowResize_);
        window.addEventListener("keydown", this.onWindowKeyDown_);

        this.createStatusAndLogPanels_();
        this.createModal_();
    }

    public dispose() {
        this.rootView_.dispose();
        this.newGameButton_?.removeEventListener("click", this.onNewGameButtonClick_);
        window.removeEventListener("resize", this.onWindowResize_);
        window.removeEventListener("orientationchange", this.onWindowResize_);
        window.removeEventListener("keydown", this.onWindowKeyDown_);

        for (const av of this.avatarViews_) {
            av.dispose();
        }
        this.centerStatusPanel_.remove();
        this.logPanel_.remove();
        this.modalBackdrop_.remove();
    }

    private createModal_() {
        this.modalBackdrop_ = document.createElement("div");
        this.modalBackdrop_.className = "tt-modal-backdrop";

        this.modalContainer_ = document.createElement("div");
        this.modalContainer_.className = "tt-modal-container";

        this.modalTitle_ = document.createElement("div");
        this.modalTitle_.className = "tt-modal-title";

        this.modalBody_ = document.createElement("div");
        this.modalBody_.className = "tt-modal-body";

        this.modalContainer_.appendChild(this.modalTitle_);
        this.modalContainer_.appendChild(this.modalBody_);
        this.modalBackdrop_.appendChild(this.modalContainer_);
        this.rootView_.element.appendChild(this.modalBackdrop_);
    }

    protected showModal_(title: string, bodyHtml: string) {
        this.modalTitle_.innerHTML = title;
        this.modalBody_.innerHTML = bodyHtml;
        this.modalBackdrop_.style.display = "flex";
    }

    protected hideModal_() {
        this.modalBackdrop_.style.display = "none";
    }

    public start() {
        const saveData = window.localStorage.getItem(this.saveDataKey_);

        // Setup views
        this.initializeViews_();

        if (saveData && this.game_.deserialize(saveData)) {
            this.relayoutAll_();
        } else {
            this.restart_();
        }
    }

    private createStatusAndLogPanels_() {
        // Center panel for Round and Trump info
        this.centerStatusPanel_ = document.createElement("div");
        this.centerStatusPanel_.className = "centerStatusPanel";
        this.centerStatusPanel_.style.position = "absolute";
        this.centerStatusPanel_.style.display = "flex";
        this.centerStatusPanel_.style.flexDirection = "column";
        this.centerStatusPanel_.style.alignItems = "center";
        this.centerStatusPanel_.style.justifyContent = "center";
        this.centerStatusPanel_.style.pointerEvents = "none";
        this.centerStatusPanel_.style.color = "white";
        this.centerStatusPanel_.style.fontFamily = "inherit";
        this.centerStatusPanel_.style.zIndex = "50";
        this.centerStatusPanel_.style.textAlign = "center";
        this.centerStatusPanel_.style.background = "rgba(0, 0, 0, 0.4)";
        this.centerStatusPanel_.style.padding = "0.5rem 1.2rem";
        this.centerStatusPanel_.style.borderRadius = "0.6rem";
        this.centerStatusPanel_.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
        this.rootView_.element.appendChild(this.centerStatusPanel_);

        // Log panel on left side
        this.logPanel_ = document.createElement("div");
        this.logPanel_.className = "gameLogPanel";
        this.logPanel_.style.position = "absolute";
        this.logPanel_.style.left = "1.5rem";
        this.logPanel_.style.bottom = "1.5rem";
        this.logPanel_.style.width = "18rem";
        this.logPanel_.style.maxHeight = "15vh";
        this.logPanel_.style.overflowY = "auto";
        this.logPanel_.style.background = "rgba(0, 0, 0, 0.65)";
        this.logPanel_.style.color = "#eee";
        this.logPanel_.style.fontFamily = "monospace";
        this.logPanel_.style.fontSize = "1.3vh";
        this.logPanel_.style.padding = "0.6rem";
        this.logPanel_.style.borderRadius = "0.5rem";
        this.logPanel_.style.boxShadow = "0 4px 6px rgba(0,0,0,0.3)";
        this.logPanel_.style.zIndex = "80";
        this.logPanel_.style.display = "flex";
        this.logPanel_.style.flexDirection = "column-reverse";
        this.rootView_.element.appendChild(this.logPanel_);
    }

    private initializeViews_() {
        for (const pile of this.game_.piles) {
            const pv = new PileView(this.rootView_);
            this.pileViews_.push(pv);
            this.pileToPileView_.set(pile, pv);
        }

        for (const card of this.game_.cards) {
            const cv = new TrickTakingCardView(this.rootView_, card.suit, card.colour, card.rank);
            cv.click = () => this.cardPrimary_(card);
            cv.dblClick = () => this.cardSecondary_(card);
            this.cardViews_.push(cv);
            this.cardToCardView_.set(card, cv);
        }

        const numPlayers = this.game_.players.length;
        for (let i = 0; i < numPlayers; ++i) {
            const player = this.game_.players[i];
            const seat = this.getSeatForPlayer_(i, numPlayers);
            const av = new AvatarView(this.rootView_, player, seat);
            this.avatarViews_.push(av);
        }
    }

    protected getSeatForPlayer_(index: number, numPlayers: number): "South" | "West" | "North" | "East" {
        if (numPlayers === 3) {
            // For 3 players: Human is South (0), left is West (1), right is East (2). No North player.
            const seats3: ("South" | "West" | "East")[] = ["South", "West", "East"];
            return seats3[index] || "South";
        }
        // Default 4 players: South (0), West (1), North (2), East (3)
        const seats4: ("South" | "West" | "North" | "East")[] = ["South", "West", "North", "East"];
        return seats4[index] || "South";
    }

    private cardPrimary_(card: ICard) {
        void this.doOperation_(() => this.game_.cardPrimary(card));
    }

    private cardSecondary_(card: ICard) {
        void this.doOperation_(() => this.game_.cardSecondary(card));
    }

    private readonly onNewGameButtonClick_ = (e: UIEvent) => {
        e.preventDefault();
        this.restart_();
    };

    private readonly onWindowResize_ = (e: UIEvent) => {
        this.relayoutAll_();
    };

    private readonly onWindowKeyDown_ = (e: KeyboardEvent) => {
        if (e.key === "n") {
            this.restart_();
            e.stopPropagation();
            e.preventDefault();
        }
    };

    private restart_() {
        void this.doOperation_(() => this.game_.restart(Date.now()));
    }

    private readonly operations_: (() => Generator<DelayHint, void>)[] = [];

    private async doOperation_(operation: () => Generator<DelayHint, void>) {
        this.operations_.push(operation);

        if (this.operations_.length === 1) {
            while (this.operations_.length > 0) {
                let waitCount = 0;

                const op = this.operations_[0] ?? Debug.error();
                for (const delay of op()) {
                    this.relayoutAll_();
                    if (this.operations_.length > 1) {
                        waitCount = Math.max(200, waitCount);
                    }
                    await this.waitForDelay_(delay, waitCount++);
                }

                this.operations_.shift();

                try {
                    window.localStorage.setItem(this.saveDataKey_, this.game_.serialize());
                } catch (error) {
                    console.error("Failed to serialize game state.", error);
                }
            }
        }
        this.relayoutAll_();
    }

    private async waitForDelay_(delay: DelayHint, waitCount: number) {
        const speedUp = Math.pow(0.99, waitCount);

        switch (delay) {
            case DelayHint.None:
                return;
            case DelayHint.Quick:
                await new Promise((resolve) => setTimeout(resolve, speedUp * 60));
                return;
            case DelayHint.OneByOne:
                await new Promise((resolve) => setTimeout(resolve, speedUp * 350));
                return;
            case DelayHint.Settle:
                await new Promise((resolve) => setTimeout(resolve, speedUp * 900));
                return;
        }
    }

    protected relayoutAll_() {
        const clientWidth = this.rootView_.element.clientWidth;
        const clientHeight = this.rootView_.element.clientHeight;
        if (clientWidth <= 0 || clientHeight <= 0) return;

        const pxPerRem = this.rootView_.context.pxPerRem;
        if (!pxPerRem) return;
        const widthRem = clientWidth * pxPerRem;
        const heightRem = clientHeight * pxPerRem;

        // Determine dynamic card sizes:
        const cardHeight = Math.max(5, Math.min(heightRem * 0.16, 8));
        const cardWidth = cardHeight / 1.55555;

        // Center offsets
        const cx = widthRem / 2;
        const cy = heightRem / 2 - 1.5;

        // Position hand piles and played piles using CENTERED coordinate system: (0,0) is screen center
        const playedOffset = cardHeight * 0.75;

        const numPlayers = this.game_.players.length;

        // Visual position mapping index based on seat
        const seatMapping = {
            "South": 0,
            "West": 1,
            "North": 2,
            "East": 3,
        };

        const handPositions = [
            new Rect(cardWidth * 7, cardHeight, 0, heightRem / 2 - cardHeight / 2 - 1.5), // South (Human Hand)
            new Rect(cardWidth, cardHeight * 4, -widthRem / 2 + cardWidth / 2 + 1.5, 0), // West Hand
            new Rect(cardWidth * 7, cardHeight, 0, -heightRem / 2 + cardHeight / 2 + 1.5), // North Hand
            new Rect(cardWidth, cardHeight * 4, widthRem / 2 - cardWidth / 2 - 1.5, 0), // East Hand
        ];

        const playedPositions = [
            new Rect(cardWidth, cardHeight, 0, playedOffset), // South Played (offset down)
            new Rect(cardWidth, cardHeight, -playedOffset, 0), // West Played (offset left)
            new Rect(cardWidth, cardHeight, 0, -playedOffset), // North Played (offset up)
            new Rect(cardWidth, cardHeight, playedOffset, 0), // East Played (offset right)
        ];

        // Layout PileViews
        for (let i = 0; i < numPlayers; ++i) {
            const handPile = this.game_.handPiles[i];
            const playedPile = this.game_.playedPiles[i];
            const seat = this.getSeatForPlayer_(i, numPlayers);
            const posIdx = seatMapping[seat];

            if (handPile) {
                const pv = this.getPileView_(handPile);
                pv.rect = handPositions[posIdx];
                this.layoutHand_(handPile, pv, posIdx, cardWidth, cardHeight);
            }

            if (playedPile) {
                const pv = this.getPileView_(playedPile);
                pv.rect = playedPositions[posIdx];
                this.layoutPlayed_(playedPile, pv, cardWidth, cardHeight);
            }
        }

        // Layout Deck Pile (always off-screen)
        const deckPile = (this.game_ as any).deckPile;
        if (deckPile) {
            const pv = this.getPileView_(deckPile);
            pv.rect = new Rect(cardWidth, cardHeight, -20, -20);
            for (let i = 0; i < deckPile.length; ++i) {
                const card = deckPile.at(i);
                const cv = this.getCardView_(card);
                cv.rect = pv.rect;
                cv.faceUp = false;
                cv.zIndex = i;
            }
        }

        // Layout AvatarViews
        const avatarPositions = [
            { x: cx - 4.5, y: heightRem - cardHeight - 6.5 }, // South Avatar
            { x: 2.5, y: cy - cardHeight / 2 - 4.5 }, // West Avatar
            { x: cx - 4.5, y: cardHeight + 4.5 }, // North Avatar
            { x: widthRem - 11.5, y: cy - cardHeight / 2 - 4.5 }, // East Avatar
        ];

        for (let i = 0; i < numPlayers; ++i) {
            const av = this.avatarViews_[i];
            const player = this.game_.players[i];
            const seat = this.getSeatForPlayer_(i, numPlayers);
            const posIdx = seatMapping[seat];

            // Set position
            av.element.style.left = `${avatarPositions[posIdx].x}rem`;
            av.element.style.top = `${avatarPositions[posIdx].y}rem`;

            // Status details
            const lockupLeft = this.game_.skippedTricks ? this.game_.skippedTricks[i] : 0;
            av.updateStatus(
                this.game_.scoreTracker.getTricks(player),
                this.game_.scoreTracker.getScore(player),
                lockupLeft
            );
            av.setActive(i === this.game_.activePlayerIndex);

            if (this.game_.won) {
                const winningScore = this.game_.winningScore;
                const isWinner = this.game_.scoreTracker.getScore(player) >= winningScore;
                av.setWinner(isWinner);
            }
        }

        // Update Center Status Panel using HTML Entities for correct UTF-8 rendering
        const suitSymbols = {
            [Suit.Spades]: "&spades; Spades",
            [Suit.Hearts]: "&hearts; Hearts",
            [Suit.Diamonds]: "&diams; Diamonds",
            [Suit.Clubs]: "&clubs; Clubs",
            [Suit.None]: "No Trump",
        };
        const suitColors = {
            [Suit.Spades]: "#ffffff",
            [Suit.Hearts]: "#ff4d4d",
            [Suit.Diamonds]: "#ff4d4d",
            [Suit.Clubs]: "#ffffff",
            [Suit.None]: "#ffd700",
        };
        const trumpSuit = this.game_.trumpSuit;
        const trumpText = suitSymbols[trumpSuit] || "No Trump";
        const trumpColor = suitColors[trumpSuit] || "#ffffff";

        this.centerStatusPanel_.innerHTML = `
            <div style="font-size: 1.4vh; opacity: 0.85;">ROUND ${this.game_.roundNumber}</div>
            <div style="font-size: 2.2vh; font-weight: bold; color: ${trumpColor}; margin-top: 0.1rem;">
                Trump: ${trumpText}
            </div>
            ${this.game_.waitingForHumanPlay ? `<div style="font-size: 1.3vh; color: #ffcc00; margin-top: 0.3rem; animation: pulse 1.5s infinite;">YOUR TURN</div>` : ""}
        `;

        // Position Center Status Panel
        this.centerStatusPanel_.style.left = `${cx - 6}rem`;
        this.centerStatusPanel_.style.top = `${cy - 2}rem`;
        this.centerStatusPanel_.style.width = "12rem";

        // Update Logs Panel
        this.logPanel_.innerHTML = this.game_.gameLog
            .slice(-10)
            .map(log => `<div style="margin-bottom: 0.2rem;">${log}</div>`)
            .reverse()
            .join("");
    }

    private layoutHand_(pile: Pile, pv: PileView, playerIndex: number, cardWidth: number, cardHeight: number) {
        const count = pile.length;
        if (count === 0) return;

        const rect = pv.rect;

        if (playerIndex === 0) {
            // Human (South) - horizontal fan, cards overlap fanned
            const maxHandWidth = rect.sizeX;
            const stepX = count > 1 ? Math.min(cardWidth * 0.7, (maxHandWidth - cardWidth) / (count - 1)) : 0;
            const startX = rect.x - (stepX * (count - 1)) / 2;

            for (let i = 0; i < count; ++i) {
                const card = pile.at(i);
                const cv = this.getCardView_(card);
                cv.rect = new Rect(cardWidth, cardHeight, startX + i * stepX, rect.y);
                cv.faceUp = card.faceUp;
                cv.zIndex = 200 + i;

                if (this.game_.waitingForHumanPlay) {
                    const legalCards = this.game_.getLegalCards_(pile);
                    if (legalCards.includes(card)) {
                        cv.element.style.filter = "brightness(1.15) drop-shadow(0 0 6px #ffd700)";
                        cv.element.style.cursor = "pointer";
                        cv.element.style.transform = "translateY(-0.8rem)";
                    } else {
                        cv.element.style.filter = "brightness(0.65)";
                        cv.element.style.cursor = "not-allowed";
                        cv.element.style.transform = "none";
                    }
                } else {
                    cv.element.style.filter = "none";
                    cv.element.style.cursor = "default";
                    cv.element.style.transform = "none";
                }
            }
        } else if (playerIndex === 2) {
            // North (AI) - horizontal fan, cards overlap smaller, face down
            const maxHandWidth = rect.sizeX;
            const stepX = count > 1 ? Math.min(cardWidth * 0.4, (maxHandWidth - cardWidth) / (count - 1)) : 0;
            const startX = rect.x - (stepX * (count - 1)) / 2;

            for (let i = 0; i < count; ++i) {
                const card = pile.at(i);
                const cv = this.getCardView_(card);
                cv.rect = new Rect(cardWidth, cardHeight, startX + i * stepX, rect.y);
                cv.faceUp = card.faceUp;
                cv.zIndex = 200 + i;
                cv.element.style.filter = "none";
                cv.element.style.cursor = "default";
                cv.element.style.transform = "none";
            }
        } else {
            // West (1) and East (3) - vertically fanned
            const maxHandHeight = rect.sizeY;
            const stepY = count > 1 ? Math.min(cardHeight * 0.15, (maxHandHeight - cardHeight) / (count - 1)) : 0;
            const startY = rect.y - (stepY * (count - 1)) / 2;

            for (let i = 0; i < count; ++i) {
                const card = pile.at(i);
                const cv = this.getCardView_(card);
                cv.rect = new Rect(cardWidth, cardHeight, rect.x, startY + i * stepY);
                cv.faceUp = card.faceUp;
                cv.zIndex = 200 + i;
                cv.element.style.filter = "none";
                cv.element.style.cursor = "default";
                cv.element.style.transform = "none";
            }
        }
    }

    private layoutPlayed_(pile: Pile, pv: PileView, cardWidth: number, cardHeight: number) {
        const rect = pv.rect;
        for (let i = 0; i < pile.length; ++i) {
            const card = pile.at(i);
            const cv = this.getCardView_(card);
            cv.rect = new Rect(cardWidth, cardHeight, rect.x, rect.y);
            cv.faceUp = card.faceUp;
            cv.zIndex = 150 + i;
            cv.element.style.filter = "none";
            cv.element.style.cursor = "default";
            cv.element.style.transform = "none";
        }
    }

    private getCardView_(card: ICard) {
        const cv = this.cardToCardView_.get(card);
        if (!cv) Debug.error();
        return cv;
    }

    private getPileView_(pile: IPile) {
        const pv = this.pileToPileView_.get(pile);
        if (!pv) Debug.error();
        return pv;
    }

    private async onGameWonChanged_() {
        if (this.game_.won) {
            const numPlayers = this.game_.players.length;
            const winningScore = this.game_.winningScore;
            for (let i = 0; i < numPlayers; ++i) {
                const player = this.game_.players[i];
                const score = this.game_.scoreTracker.getScore(player);
                if (score >= winningScore) {
                    this.avatarViews_[i].setWinner(true);
                }
            }
        }
    }
}
