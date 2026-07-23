import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game } from "../Model/Game";
import { Rect } from "~CardLib/View/Rect";
import { Suit } from "~CardLib/Model/Suit";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "hearts",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: Game, rootView: IView) {
        super(game, rootView);

        // Listen for pass confirmation button clicks in the modal
        this.modalBody_.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target && target.id === "confirmPassButton") {
                e.preventDefault();
                e.stopPropagation();
                if (this.game_.humanPassedCards.length === 3) {
                    void this.doOperation_(() => this.game_.confirmPass_());
                }
            }
        });
    }

    protected override relayoutAll_() {
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

        // Position hand piles and played piles
        const playedOffset = cardHeight * 0.75;

        const handPositions = [
            new Rect(cardWidth * 7, cardHeight, 0, heightRem / 2 - cardHeight / 2 - 1.5), // South (Human Hand)
            new Rect(cardWidth, cardHeight * 4, -widthRem / 2 + cardWidth / 2 + 1.5, 0), // West Hand
            new Rect(cardWidth * 7, cardHeight, 0, -heightRem / 2 + cardHeight / 2 + 1.5), // North Hand
            new Rect(cardWidth, cardHeight * 4, widthRem / 2 - cardWidth / 2 - 1.5, 0), // East Hand
        ];

        const playedPositions = [
            new Rect(cardWidth, cardHeight, 0, playedOffset), // South Played
            new Rect(cardWidth, cardHeight, -playedOffset, 0), // West Played
            new Rect(cardWidth, cardHeight, 0, -playedOffset), // North Played
            new Rect(cardWidth, cardHeight, playedOffset, 0), // East Played
        ];

        // Layout PileViews
        for (let i = 0; i < 4; ++i) {
            const handPile = this.game_.handPiles[i];
            const playedPile = this.game_.playedPiles[i];

            if (handPile) {
                const pv = this.pileToPileView_.get(handPile);
                if (pv) {
                    pv.rect = handPositions[i];
                    this.layoutHandCustom_(handPile, pv, i, cardWidth, cardHeight);
                }
            }

            if (playedPile) {
                const pv = this.pileToPileView_.get(playedPile);
                if (pv) {
                    pv.rect = playedPositions[i];
                    this.layoutPlayedCustom_(playedPile, pv, cardWidth, cardHeight);
                }
            }
        }

        // Layout Deck Pile (off-screen)
        const deckPile = (this.game_ as any).deckPile;
        if (deckPile) {
            const pv = this.pileToPileView_.get(deckPile);
            if (pv) {
                pv.rect = new Rect(cardWidth, cardHeight, -20, -20);
                for (let i = 0; i < deckPile.length; ++i) {
                    const card = deckPile.at(i);
                    const cv = this.cardToCardView_.get(card);
                    if (cv) {
                        cv.rect = pv.rect;
                        cv.faceUp = false;
                        cv.zIndex = i;
                    }
                }
            }
        }

        // Layout AvatarViews
        const avatarPositions = [
            { x: cx - 4.5, y: heightRem - cardHeight - 6.5 }, // South Avatar
            { x: 2.5, y: cy - cardHeight / 2 - 4.5 }, // West Avatar
            { x: cx - 4.5, y: cardHeight + 4.5 }, // North Avatar
            { x: widthRem - 11.5, y: cy - cardHeight / 2 - 4.5 }, // East Avatar
        ];

        for (let i = 0; i < 4; ++i) {
            const av = this.avatarViews_[i];
            const player = this.game_.players[i];

            av.element.style.left = `${avatarPositions[i].x}rem`;
            av.element.style.top = `${avatarPositions[i].y}rem`;

            av.updateStatus(
                this.game_.scoreTracker.getTricks(player),
                this.game_.scoreTracker.getScore(player)
            );
            av.setActive(i === this.game_.activePlayerIndex && !this.game_.isPassingPhase);

            if (this.game_.won) {
                // In Hearts, lowest score wins!
                const scores = this.game_.players.map(p => this.game_.scoreTracker.getScore(p));
                const minScore = Math.min(...scores);
                const isWinner = this.game_.scoreTracker.getScore(player) === minScore;
                av.setWinner(isWinner);
            }
        }

        // Update Center Status Panel & Modal
        this.centerStatusPanel_.innerHTML = `
            <div style="font-size: 1.4vh; opacity: 0.85;">ROUND ${this.game_.roundNumber}</div>
            <div style="font-size: 2.2vh; font-weight: bold; color: #ff4d4d; margin-top: 0.1rem;">
                No Trump
            </div>
            ${(!this.game_.isPassingPhase && this.game_.waitingForHumanPlay) ? `<div style="font-size: 1.3vh; color: #ffcc00; margin-top: 0.3rem; animation: pulse 1.5s infinite;">YOUR TURN</div>` : ""}
        `;

        this.centerStatusPanel_.style.left = `${cx - 7}rem`;
        this.centerStatusPanel_.style.top = `${cy - 2.5}rem`;
        this.centerStatusPanel_.style.width = "14rem";

        if (this.game_.isPassingPhase) {
            const passRotation = (this.game_.roundNumber - 1) % 4;
            const directions = ["Left", "Right", "Across"];
            const dirText = directions[passRotation] || "";
            const selectedCount = this.game_.humanPassedCards.length;
            const confirmEnabled = selectedCount === 3;

            this.showModal_(
                "Passing Phase",
                `<div style="font-size: 1.6vh; margin-top: 0.2rem; color: #fff;">Pass 3 cards to the <strong>${dirText}</strong></div>
                <div style="font-size: 1.3vh; color: #ccc; margin-top: 0.4rem; margin-bottom: 0.4rem;">Selected: ${selectedCount} / 3</div>
                <button id="confirmPassButton" class="tt-modal-button ${confirmEnabled ? 'btn-green' : ''}" ${confirmEnabled ? "" : "disabled"}>Confirm Pass</button>`
            );
        } else {
            this.hideModal_();
        }

        // Update logs panel
        this.logPanel_.innerHTML = this.game_.gameLog
            .slice(-10)
            .map(log => `<div style="margin-bottom: 0.2rem;">${log}</div>`)
            .reverse()
            .join("");
    }

    private layoutHandCustom_(pile: any, pv: any, playerIndex: number, cardWidth: number, cardHeight: number) {
        const count = pile.length;
        if (count === 0) return;

        const rect = pv.rect;

        if (playerIndex === 0) {
            // South (Human)
            const maxHandWidth = rect.sizeX;
            const stepX = count > 1 ? Math.min(cardWidth * 0.7, (maxHandWidth - cardWidth) / (count - 1)) : 0;
            const startX = rect.x - (stepX * (count - 1)) / 2;

            for (let i = 0; i < count; ++i) {
                const card = pile.at(i);
                const cv = this.cardToCardView_.get(card);
                if (!cv) continue;

                cv.rect = new Rect(cardWidth, cardHeight, startX + i * stepX, rect.y);
                cv.faceUp = card.faceUp;
                cv.zIndex = 200 + i;

                if (this.game_.isPassingPhase) {
                    const isSelected = this.game_.humanPassedCards.includes(card);
                    const canSelectMore = this.game_.humanPassedCards.length < 3;

                    if (isSelected) {
                        cv.element.style.filter = "brightness(1.15) drop-shadow(0 0 8px #ffd700)";
                        cv.element.style.cursor = "pointer";
                        cv.element.style.transform = "translateY(-1.8rem)";
                    } else if (canSelectMore) {
                        cv.element.style.filter = "none";
                        cv.element.style.cursor = "pointer";
                        cv.element.style.transform = "none";
                    } else {
                        cv.element.style.filter = "brightness(0.6)";
                        cv.element.style.cursor = "not-allowed";
                        cv.element.style.transform = "none";
                    }
                } else if (this.game_.waitingForHumanPlay) {
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
            // North
            const maxHandWidth = rect.sizeX;
            const stepX = count > 1 ? Math.min(cardWidth * 0.4, (maxHandWidth - cardWidth) / (count - 1)) : 0;
            const startX = rect.x - (stepX * (count - 1)) / 2;

            for (let i = 0; i < count; ++i) {
                const card = pile.at(i);
                const cv = this.cardToCardView_.get(card);
                if (!cv) continue;

                cv.rect = new Rect(cardWidth, cardHeight, startX + i * stepX, rect.y);
                cv.faceUp = card.faceUp;
                cv.zIndex = 200 + i;
                cv.element.style.filter = "none";
                cv.element.style.cursor = "default";
                cv.element.style.transform = "none";
            }
        } else {
            // East/West
            const maxHandHeight = rect.sizeY;
            const stepY = count > 1 ? Math.min(cardHeight * 0.15, (maxHandHeight - cardHeight) / (count - 1)) : 0;
            const startY = rect.y - (stepY * (count - 1)) / 2;

            for (let i = 0; i < count; ++i) {
                const card = pile.at(i);
                const cv = this.cardToCardView_.get(card);
                if (!cv) continue;

                cv.rect = new Rect(cardWidth, cardHeight, rect.x, startY + i * stepY);
                cv.faceUp = card.faceUp;
                cv.zIndex = 200 + i;
                cv.element.style.filter = "none";
                cv.element.style.cursor = "default";
                cv.element.style.transform = "none";
            }
        }
    }

    private layoutPlayedCustom_(pile: any, pv: any, cardWidth: number, cardHeight: number) {
        const rect = pv.rect;
        for (let i = 0; i < pile.length; ++i) {
            const card = pile.at(i);
            const cv = this.cardToCardView_.get(card);
            if (!cv) continue;

            cv.rect = new Rect(cardWidth, cardHeight, rect.x, rect.y);
            cv.faceUp = card.faceUp;
            cv.zIndex = 150 + i;
            cv.element.style.filter = "none";
            cv.element.style.cursor = "default";
            cv.element.style.transform = "none";
        }
    }
}
