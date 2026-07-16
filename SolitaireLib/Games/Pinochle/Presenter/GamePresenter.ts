import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game } from "../Model/Game";
import { Rect } from "~CardLib/View/Rect";
import { Suit } from "~CardLib/Model/Suit";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "pinochle",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: Game, rootView: IView) {
        super(game, rootView);

        // Enable clicks on the modal for bidding, trump naming, and meld confirmation
        this.modalBody_.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target) return;

            if (target.classList.contains("bidActionButton")) {
                e.preventDefault();
                e.stopPropagation();
                const action = target.getAttribute("data-action");
                if (action === "pass") {
                    void (this as any).doOperation_(() => this.game_.submitHumanBid_("pass"));
                } else if (action === "bid") {
                    const amount = parseInt(target.getAttribute("data-amount") || "20", 10);
                    void (this as any).doOperation_(() => this.game_.submitHumanBid_("bid", amount));
                }
            } else if (target.classList.contains("trumpActionButton")) {
                e.preventDefault();
                e.stopPropagation();
                const suit = parseInt(target.getAttribute("data-suit") || "0", 10) as Suit;
                void (this as any).doOperation_(() => this.game_.submitHumanTrump_(suit));
            } else if (target.classList.contains("meldConfirmButton")) {
                e.preventDefault();
                e.stopPropagation();
                void (this as any).doOperation_(() => this.game_.confirmMeldAndPlay_());
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
            new Rect(cardWidth * 7, cardHeight, 0, heightRem / 2 - cardHeight / 2 - 1.5), // South Hand
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
                    pv.rect = handPositions[i]!;
                    this.layoutHandCustom_(handPile, pv, i, cardWidth, cardHeight);
                }
            }

            if (playedPile) {
                const pv = this.pileToPileView_.get(playedPile);
                if (pv) {
                    pv.rect = playedPositions[i]!;
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
            const av = this.avatarViews_[i]!;
            const player = this.game_.players[i]!;

            av.element.style.left = `${avatarPositions[i]!.x}rem`;
            av.element.style.top = `${avatarPositions[i]!.y}rem`;

            const isDealer = i === this.game_.dealerIndex;
            const isAuctionWinner = i === this.game_.auctionWinnerIndex;

            // Highlight active player
            av.setActive(
                (this.game_.isBiddingPhase && i === this.game_.biddingPlayerIndex) ||
                (this.game_.isNamingTrumpPhase && i === this.game_.auctionWinnerIndex) ||
                (!this.game_.isBiddingPhase && !this.game_.isNamingTrumpPhase && !this.game_.isMeldPhase && i === this.game_.activePlayerIndex)
            );

            // Partnership score tracker details
            const isTeamA = player.teamId === "TeamA";
            const teamScore = isTeamA
                ? this.game_.scoreTracker.getScoreByKey("TeamA")
                : this.game_.scoreTracker.getScoreByKey("TeamB");

            const tricksWon = this.game_.tricksWonInRound[isTeamA ? "TeamA" : "TeamB"];
            const trickPts = this.game_.roundTrickPoints[isTeamA ? "TeamA" : "TeamB"];

            let roleText = "";
            if (isDealer) roleText += ` <span style="color: #ffcc00; font-weight: bold;">[Dealer]</span>`;
            if (isAuctionWinner) roleText += ` <span style="color: #00ff66; font-weight: bold;">[Declarer]</span>`;

            const statusEl = av.element.querySelector(".avatarStatus") as HTMLElement;
            if (statusEl) {
                statusEl.innerHTML = `
                    ${roleText}<br/>
                    Tricks Won: ${tricksWon}<br/>
                    Trick Pts: ${trickPts}<br/>
                    Team Score: ${teamScore}/1500
                `;
            }

            // Set winner visualization
            if (this.game_.won) {
                const scoreA = this.game_.scoreTracker.getScoreByKey("TeamA");
                const scoreB = this.game_.scoreTracker.getScoreByKey("TeamB");
                const isWinner = isTeamA ? (scoreA >= 1500 && scoreA > scoreB) : (scoreB >= 1500 && scoreB > scoreA);
                av.setWinner(isWinner);
            }
        }

        // Update Center Status Panel & Modal
        const isPlayPhase = !this.game_.isBiddingPhase && !this.game_.isNamingTrumpPhase && !this.game_.isMeldPhase;
        const trumpColor = {
            [Suit.Spades]: "#ffffff",
            [Suit.Hearts]: "#ff4d4d",
            [Suit.Diamonds]: "#ff4d4d",
            [Suit.Clubs]: "#ffffff",
            [Suit.None]: "#ffd700",
        }[this.game_.trumpSuit] || "#ffffff";

        const winnerPlayer = this.game_.players[this.game_.auctionWinnerIndex];
        const bidWinnerLabel = (winnerPlayer && winnerPlayer.teamId === "TeamA") ? "Team A (You)" : "Team B";

        this.centerStatusPanel_.innerHTML = `
            <div style="font-size: 1.3vh; opacity: 0.85;">ROUND ${this.game_.roundNumber}</div>
            <div style="font-size: 2.1vh; font-weight: bold; color: ${trumpColor}; margin-top: 0.1rem;">
                Trump: ${this.getSuitSymbolHtml_(this.game_.trumpSuit)} ${this.getSuitName_(this.game_.trumpSuit)}
            </div>
            ${(!isPlayPhase) ? "" : `
                <div style="font-size: 1.1vh; opacity: 0.8; margin-top: 0.1rem;">
                    Auction Bid: <strong>${this.game_.finalBid}</strong> by ${bidWinnerLabel}
                </div>
            `}
            ${(isPlayPhase && this.game_.waitingForHumanPlay) ? `<div style="font-size: 1.3vh; color: #ffcc00; margin-top: 0.3rem; animation: pulse 1.5s infinite;">YOUR TURN</div>` : ""}
        `;

        this.centerStatusPanel_.style.left = `${cx - 8}rem`;
        this.centerStatusPanel_.style.top = `${cy - 3}rem`;
        this.centerStatusPanel_.style.width = "16rem";
        this.centerStatusPanel_.style.maxHeight = "none";

        if (this.game_.isBiddingPhase) {
            const biddingPlayer = this.game_.players[this.game_.biddingPlayerIndex];
            const biddingPlayerName = biddingPlayer ? biddingPlayer.name : "";

            if (this.game_.waitingForHumanBid) {
                const nextBid = Math.max(20, this.game_.currentHighestBid + 1);

                let buttonsHtml = `
                    <button class="bidActionButton tt-modal-button btn-red" data-action="pass">Pass</button>
                    <button class="bidActionButton tt-modal-button btn-green" data-action="bid" data-amount="${nextBid}">Bid ${nextBid}</button>
                    <button class="bidActionButton tt-modal-button btn-blue" data-action="bid" data-amount="${nextBid + 5}">Bid ${nextBid + 5}</button>
                    <button class="bidActionButton tt-modal-button btn-purple" data-action="bid" data-amount="${nextBid + 10}">Bid ${nextBid + 10}</button>
                `;

                this.showModal_(
                    "Bidding Auction",
                    `<div style="margin-bottom: 0.5rem; font-size: 1.5vh;">
                        ${this.game_.currentHighestBid > 0 ? `Current bid: <strong>${this.game_.currentHighestBid}</strong>` : "Opening bid (min 20)"}
                     </div>
                     <div style="display: flex; flex-wrap: wrap; justify-content: center; max-width: 18rem;">
                         ${buttonsHtml}
                     </div>`
                );
            } else {
                this.showModal_(
                    "Bidding Auction",
                    `<div>Waiting for <strong>${biddingPlayerName}</strong> to bid...</div>`
                );
            }
        } else if (this.game_.isNamingTrumpPhase) {
            const winner = this.game_.players[this.game_.auctionWinnerIndex];
            const winnerName = winner ? winner.name : "";

            if (this.game_.waitingForHumanTrump) {
                let buttonsHtml = "";
                const suits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
                for (const s of suits) {
                    const symbol = this.getSuitSymbolHtml_(s);
                    buttonsHtml += `
                        <button class="trumpActionButton tt-modal-button btn-blue" data-suit="${s}">${symbol}</button>
                    `;
                }

                this.showModal_(
                    "Choose Trump",
                    `<div style="margin-bottom: 0.5rem;">You won the auction with <strong>${this.game_.finalBid}</strong>!</div>
                     <div style="display: flex; justify-content: center; gap: 0.4rem;">
                         ${buttonsHtml}
                     </div>`
                );
            } else {
                this.showModal_(
                    "Trump Naming",
                    `<div>Waiting for <strong>${winnerName}</strong> to choose Trump...</div>`
                );
            }
        } else if (this.game_.isMeldPhase) {
            const teamAMeldsStr = (this.game_.playerMelds[0] || []).concat(this.game_.playerMelds[2] || [])
                .map(m => `${m.name} (${m.points})`)
                .join(", ") || "No melds";

            const teamBMeldsStr = (this.game_.playerMelds[1] || []).concat(this.game_.playerMelds[3] || [])
                .map(m => `${m.name} (${m.points})`)
                .join(", ") || "No melds";

            this.showModal_(
                "Meld Reveal Phase",
                `<div style="text-align: left; width: 100%; margin-top: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 0.3rem;">
                    <strong>Team A (You):</strong> <span style="color: #66ffbb;">+${this.game_.roundMeldPoints.TeamA} pts</span><br/>
                    <span style="opacity: 0.85; font-size: 1.2vh; line-height: 1.2rem;">${teamAMeldsStr}</span>
                </div>
                <div style="text-align: left; width: 100%; margin-top: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 0.3rem;">
                    <strong>Team B:</strong> <span style="color: #ff9f1c;">+${this.game_.roundMeldPoints.TeamB} pts</span><br/>
                    <span style="opacity: 0.85; font-size: 1.2vh; line-height: 1.2rem;">${teamBMeldsStr}</span>
                </div>
                <button class="meldConfirmButton tt-modal-button btn-green" style="margin-top: 0.8rem; width: 80%;">Start Play</button>`
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

    private getSuitName_(suit: Suit): string {
        const suitNames = {
            [Suit.Spades]: "Spades",
            [Suit.Hearts]: "Hearts",
            [Suit.Diamonds]: "Diamonds",
            [Suit.Clubs]: "Clubs",
            [Suit.None]: "No Trump",
        };
        return suitNames[suit] || "";
    }

    private getSuitSymbolHtml_(suit: Suit): string {
        const suitSymbols = {
            [Suit.Spades]: '<span style="color: #fff;">&spades; Spades</span>',
            [Suit.Hearts]: '<span style="color: #ff4d4d;">&hearts; Hearts</span>',
            [Suit.Diamonds]: '<span style="color: #ff4d4d;">&diams; Diamonds</span>',
            [Suit.Clubs]: '<span style="color: #fff;">&clubs; Clubs</span>',
            [Suit.None]: "None",
        };
        return suitSymbols[suit] || "";
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

                const isMyTurn = !this.game_.isBiddingPhase && !this.game_.isNamingTrumpPhase && !this.game_.isMeldPhase && this.game_.waitingForHumanPlay;

                if (isMyTurn) {
                    const legalCards = this.game_.getLegalCards_(pile);
                    if (legalCards.indexOf(card) >= 0) {
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
