import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game } from "../Model/Game";
import { Rect } from "~CardLib/View/Rect";
import { Suit } from "~CardLib/Model/Suit";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "spades",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: Game, rootView: IView) {
        super(game, rootView);

        // Listen for bid button clicks in the modal
        this.modalBody_.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target && target.classList.contains("bidButton")) {
                e.preventDefault();
                e.stopPropagation();
                const bidVal = parseInt(target.getAttribute("data-bid") || "0", 10);
                void this.doOperation_(() => this.game_.submitHumanBid_(bidVal));
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

            av.setActive(
                (this.game_.isBiddingPhase && i === this.game_.biddingPlayerIndex) ||
                (!this.game_.isBiddingPhase && i === this.game_.activePlayerIndex)
            );

            // Update status text with team scoring info
            const bidVal = this.game_.bids[i];
            const bidStr = bidVal === null ? "?" : (bidVal === 0 ? "Nil" : bidVal.toString());
            const indTricks = this.game_.individualTricksWon[i];

            const isTeamA = player.teamId === "TeamA";
            const teamBid = isTeamA
                ? (this.game_.bids[0] ?? 0) + (this.game_.bids[2] ?? 0)
                : (this.game_.bids[1] ?? 0) + (this.game_.bids[3] ?? 0);
            const teamTricks = isTeamA
                ? this.game_.scoreTracker.getTricksByKey("TeamA")
                : this.game_.scoreTracker.getTricksByKey("TeamB");
            const teamScore = isTeamA
                ? this.game_.scoreTracker.getScoreByKey("TeamA")
                : this.game_.scoreTracker.getScoreByKey("TeamB");
            const teamBags = isTeamA ? this.game_.bags.TeamA : this.game_.bags.TeamB;

            const statusEl = av.element.querySelector(".avatarStatus") as HTMLElement;
            if (statusEl) {
                statusEl.innerHTML = `
                    Bid: ${bidStr} | Won: ${indTricks}<br/>
                    Team Bid: ${teamBid} | Team Won: ${teamTricks}<br/>
                    Score: ${teamScore} (Bags: ${teamBags})
                `;
            }

            if (this.game_.won) {
                const scoreA = this.game_.scoreTracker.getScoreByKey("TeamA");
                const scoreB = this.game_.scoreTracker.getScoreByKey("TeamB");
                const isWinner = isTeamA ? (scoreA >= 500 && scoreA > scoreB) : (scoreB >= 500 && scoreB > scoreA);
                av.setWinner(isWinner);
            }
        }

        // Update Center Status Panel & Modal
        this.centerStatusPanel_.innerHTML = `
            <div style="font-size: 1.4vh; opacity: 0.85;">ROUND ${this.game_.roundNumber}</div>
            <div style="font-size: 2.2vh; font-weight: bold; color: #ffffff; margin-top: 0.1rem;">
                Trump: &spades; Spades
            </div>
            ${(!this.game_.isBiddingPhase && this.game_.waitingForHumanPlay) ? `<div style="font-size: 1.3vh; color: #ffcc00; margin-top: 0.3rem; animation: pulse 1.5s infinite;">YOUR TURN</div>` : ""}
        `;

        this.centerStatusPanel_.style.left = `${cx - 8}rem`;
        this.centerStatusPanel_.style.top = `${cy - 3}rem`;
        this.centerStatusPanel_.style.width = "16rem";

        if (this.game_.isBiddingPhase) {
            const biddingPlayer = this.game_.players[this.game_.biddingPlayerIndex];

            if (this.game_.waitingForHumanBid) {
                let buttonsHtml = "";
                for (let b = 0; b <= 13; ++b) {
                    const label = b === 0 ? "Nil" : b.toString();
                    buttonsHtml += `
                        <button class="bidButton tt-modal-button" data-bid="${b}">${label}</button>
                    `;
                }

                this.showModal_(
                    "Bidding Phase",
                    `<div style="margin-bottom: 0.6rem;">Choose your bid (0 is Nil):</div>
                     <div style="display: flex; flex-wrap: wrap; justify-content: center; max-width: 18rem;">
                         ${buttonsHtml}
                     </div>`
                );
            } else {
                this.showModal_(
                    "Bidding Phase",
                    `<div>Waiting for <strong>${biddingPlayer.name}</strong> to bid...</div>`
                );
            }
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
            // South (Human Hand)
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

                if (!this.game_.isBiddingPhase && this.game_.waitingForHumanPlay) {
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
