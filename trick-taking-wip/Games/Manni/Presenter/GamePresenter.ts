import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game } from "../Model/Game";
import { Rect } from "~CardLib/View/Rect";
import { Suit } from "~CardLib/Model/Suit";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "manni",
            version: 1,
            options: this.game_.options.saveKey,
        });
    }

    private readonly trumpCyclePanel_: HTMLElement;

    constructor(game: Game, rootView: IView) {
        super(game, rootView);

        this.trumpCyclePanel_ = document.createElement("div");
        this.trumpCyclePanel_.className = "trumpCyclePanel";
        this.trumpCyclePanel_.style.position = "absolute";
        this.trumpCyclePanel_.style.color = "#ccc";
        this.trumpCyclePanel_.style.fontFamily = "inherit";
        this.trumpCyclePanel_.style.fontSize = "1.2vh";
        this.trumpCyclePanel_.style.fontWeight = "bold";
        this.trumpCyclePanel_.style.textAlign = "center";
        this.trumpCyclePanel_.style.zIndex = "40";
        this.trumpCyclePanel_.style.pointerEvents = "none";
        this.rootView_.element.appendChild(this.trumpCyclePanel_);

        // Listen for exchange phase action clicks in the modal
        this.modalBody_.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target && target.id === "confirmExchangeButton") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.submitHumanExchange_([...this.game_.cardsSelectedForExchange]));
            } else if (target && target.id === "declineExchangeButton") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.submitHumanExchange_([]));
            }
        });
    }

    public override dispose() {
        super.dispose();
        this.trumpCyclePanel_.remove();
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

        // Intentional 3-player triangular layout:
        // South remains at bottom center.
        // West/East are positioned higher up (shifted towards top-left / top-right) to form an even triangle.
        const handPositions = [
            new Rect(cardWidth * 7, cardHeight, 0, heightRem / 2 - cardHeight / 2 - 1.5), // South (Human Hand)
            new Rect(cardWidth, cardHeight * 4, -widthRem / 2 + cardWidth / 2 + 2, -heightRem / 6), // West Hand (shifted up)
            new Rect(cardWidth * 7, cardHeight, 0, -heightRem / 2 + cardHeight / 2 + 1.5), // North Hand (unused in 3p)
            new Rect(cardWidth, cardHeight * 4, widthRem / 2 - cardWidth / 2 - 2, -heightRem / 6), // East Hand (shifted up)
        ];

        const playedPositions = [
            new Rect(cardWidth, cardHeight, 0, playedOffset), // South Played (offset down)
            new Rect(cardWidth, cardHeight, -playedOffset, -playedOffset * 0.4), // West Played (shifted up)
            new Rect(cardWidth, cardHeight, 0, -playedOffset), // North Played (unused in 3p)
            new Rect(cardWidth, cardHeight, playedOffset, -playedOffset * 0.4), // East Played (shifted up)
        ];

        // Layout PileViews for Player Hands and Played Piles
        for (let i = 0; i < numPlayers; ++i) {
            const handPile = this.game_.handPiles[i];
            const playedPile = this.game_.playedPiles[i];
            const seat = this.getSeatForPlayer_(i, numPlayers);
            const posIdx = seatMapping[seat];

            if (handPile) {
                const pv = this.pileToPileView_.get(handPile);
                if (pv) {
                    pv.rect = handPositions[posIdx];
                    this.layoutHandCustom_(handPile, pv, i, cardWidth, cardHeight);
                }
            }

            if (playedPile) {
                const pv = this.pileToPileView_.get(playedPile);
                if (pv) {
                    pv.rect = playedPositions[posIdx];
                    this.layoutPlayedCustom_(playedPile, pv, cardWidth, cardHeight);
                }
            }
        }

        // Layout Deck Pile (always off-screen)
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

        // Layout Manni Pile - positioned horizontally centered near top of center board
        const manniPile = this.game_.manniPile;
        if (manniPile) {
            const pv = this.pileToPileView_.get(manniPile);
            if (pv) {
                // Layout horizontally fanned (overlap nicely) in the middle of table, slightly offset up
                const count = manniPile.length;
                pv.rect = new Rect(cardWidth * 6, cardHeight, 0, -playedOffset * 1.5);

                const maxManniWidth = cardWidth * 6;
                const stepX = count > 1 ? Math.min(cardWidth * 0.25, (maxManniWidth - cardWidth) / (count - 1)) : 0;
                const startX = pv.rect.x - (stepX * (count - 1)) / 2;

                for (let i = 0; i < count; ++i) {
                    const card = manniPile.at(i);
                    const cv = this.cardToCardView_.get(card);
                    if (cv) {
                        cv.rect = new Rect(cardWidth, cardHeight, startX + i * stepX, pv.rect.y);
                        cv.faceUp = card.faceUp;
                        cv.zIndex = 50 + i;
                        cv.element.style.filter = "none";
                        cv.element.style.cursor = "default";
                        cv.element.style.transform = "none";
                    }
                }
            }
        }

        // Layout Trump Indicator Piles - positioned horizontally fanned near bottom right of center board
        // Order: Hearts, Spades, Diamonds, Clubs
        const trumpPilesXStart = cx + cardWidth * 1.5;
        const trumpPilesY = cy + playedOffset * 1.5;
        const indicatorGap = cardWidth * 1.1;

        for (let i = 0; i < 4; ++i) {
            const tp = this.game_.trumpIndicatorPiles[i];
            const pv = this.pileToPileView_.get(tp);
            if (pv) {
                pv.rect = new Rect(cardWidth, cardHeight, trumpPilesXStart + i * indicatorGap - widthRem / 2, trumpPilesY - heightRem / 2);
                for (let c = 0; c < tp.length; ++c) {
                    const card = tp.at(c);
                    const cv = this.cardToCardView_.get(card);
                    if (cv) {
                        cv.rect = pv.rect;
                        cv.faceUp = card.faceUp;
                        cv.zIndex = 10 + c;
                        // Glow active trump indicator card
                        if (card.faceUp) {
                            cv.element.style.filter = "brightness(1.1) drop-shadow(0 0 10px #ffd700)";
                        } else {
                            cv.element.style.filter = "brightness(0.65)";
                        }
                        cv.element.style.cursor = "default";
                        cv.element.style.transform = "none";
                    }
                }
            }
        }

        // Layout Trump Cycle Panel above indicator cards
        this.trumpCyclePanel_.style.left = `${trumpPilesXStart}rem`;
        this.trumpCyclePanel_.style.top = `${trumpPilesY - 1.2}rem`;
        this.trumpCyclePanel_.style.width = `${indicatorGap * 4}rem`;
        this.trumpCyclePanel_.innerHTML = "TRUMP INDICATORS";

        // Layout AvatarViews
        // Shift West/East avatars higher up (e.g. y = cy - cardHeight / 2 - 6.5) to align with hands and look triangular
        const avatarPositions = [
            { x: cx - 4.5, y: heightRem - cardHeight - 6.5 }, // South Avatar
            { x: 2.5, y: cy - cardHeight / 2 - 6.5 }, // West Avatar (shifted up)
            { x: cx - 4.5, y: cardHeight + 4.5 }, // North Avatar (unused in 3p)
            { x: widthRem - 11.5, y: cy - cardHeight / 2 - 6.5 }, // East Avatar (shifted up)
        ];

        for (let i = 0; i < numPlayers; ++i) {
            const av = this.avatarViews_[i];
            const player = this.game_.players[i];
            const seat = this.getSeatForPlayer_(i, numPlayers);
            const posIdx = seatMapping[seat];

            // Set position
            av.element.style.left = `${avatarPositions[posIdx].x}rem`;
            av.element.style.top = `${avatarPositions[posIdx].y}rem`;

            // Status details with Exchange and Score clarity
            if (this.game_.isExchangePhase) {
                const count = this.game_.exchangesCount[i];
                if (count !== null) {
                    av.updateStatus(0, this.game_.scoreTracker.getScore(player));
                    av.element.querySelector(".avatarStatus")!.innerHTML = count > 0 ? `<span style="color: #00ff00; font-weight: bold;">Exchanged ${count}</span>` : `<span style="color: #aaa;">Kept Hand</span>`;
                } else {
                    av.updateStatus(0, this.game_.scoreTracker.getScore(player));
                    av.element.querySelector(".avatarStatus")!.innerHTML = i === this.game_.currentExchangingPlayerIndex ? `<span style="color: #ffcc00; font-weight: bold; animation: pulse 1s infinite;">Deciding...</span>` : `<span style="color: #777;">Waiting</span>`;
                }
            } else {
                const tricks = this.game_.scoreTracker.getTricks(player);
                const score = this.game_.scoreTracker.getScore(player);
                const roundPoints = Math.max(0, tricks - 4);
                const ptsStr = roundPoints > 0 ? ` (+${roundPoints} pt)` : "";
                av.element.querySelector(".avatarStatus")!.innerHTML = `Tricks: ${tricks}${ptsStr}<br/>Score: ${score}`;
            }

            av.setActive(i === this.game_.activePlayerIndex && !this.game_.isExchangePhase);

            // Highlight current player in exchange phase too
            if (this.game_.isExchangePhase && i === this.game_.currentExchangingPlayerIndex) {
                av.setActive(true);
            }

            if (this.game_.won) {
                const winningScore = this.game_.winningScore;
                const isWinner = this.game_.scoreTracker.getScore(player) >= winningScore;
                av.setWinner(isWinner);
            }
        }

        // Update Center Status Panel & Modal
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
            ${(!this.game_.isExchangePhase && this.game_.waitingForHumanPlay) ? `<div style="font-size: 1.3vh; color: #ffcc00; margin-top: 0.3rem; animation: pulse 1.5s infinite;">YOUR TURN</div>` : ""}
        `;

        this.centerStatusPanel_.style.left = `${cx - 8}rem`;
        this.centerStatusPanel_.style.top = `${cy - 2.5}rem`;
        this.centerStatusPanel_.style.width = "16rem";

        if (this.game_.isExchangePhase) {
            const humanIdx = this.game_.players.findIndex(p => p.isHuman);
            const isHumanTurn = this.game_.currentExchangingPlayerIndex === humanIdx;
            const roles = ["1st to Act", "2nd to Act", "Dealer (3rd to Act)"];
            const activeRole = roles[this.game_.exchangeStep] || "Exchanging";

            if (isHumanTurn) {
                const selectedCount = this.game_.cardsSelectedForExchange.length;
                const order = [
                    this.game_.currentExchangingPlayerIndex,
                    (this.game_.currentExchangingPlayerIndex + 1) % 3,
                    (this.game_.currentExchangingPlayerIndex + 2) % 3
                ];
                const currentOrderIdx = order.indexOf(this.game_.currentExchangingPlayerIndex);
                const maxAllowed = [7, 5, this.game_.manniPile.length];
                const maxExchangeLimit = maxAllowed[currentOrderIdx] || 7;

                this.showModal_(
                    "Exchange Phase",
                    `<div style="font-size: 1.5vh; font-weight: bold; margin-bottom: 0.4rem;">Your Turn (${activeRole})</div>
                    <div style="margin-bottom: 0.4rem;">Select up to <strong>${maxExchangeLimit} cards</strong> to exchange.</div>
                    <div style="font-size: 1.3vh; color: #ccc; margin-bottom: 0.4rem;">Selected: ${selectedCount} / ${maxExchangeLimit}</div>
                    <div style="display: flex; gap: 0.5rem; justify-content: center; width: 100%;">
                        <button id="confirmExchangeButton" class="tt-modal-button btn-green">Exchange</button>
                        <button id="declineExchangeButton" class="tt-modal-button btn-red">Decline</button>
                    </div>`
                );
            } else {
                const activePlayer = this.game_.players[this.game_.currentExchangingPlayerIndex];
                this.showModal_(
                    "Exchange Phase",
                    `<div><strong>${activePlayer ? activePlayer.name : "AI"}</strong> (${activeRole}) is deciding...</div>`
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
            // Human (South)
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

                if (this.game_.isExchangePhase) {
                    const isSelected = this.game_.cardsSelectedForExchange.includes(card);
                    // Determine limit
                    const order = [
                        this.game_.currentExchangingPlayerIndex,
                        (this.game_.currentExchangingPlayerIndex + 1) % 3,
                        (this.game_.currentExchangingPlayerIndex + 2) % 3
                    ];
                    const currentOrderIdx = order.indexOf(this.game_.currentExchangingPlayerIndex);
                    const maxAllowed = [7, 5, this.game_.manniPile.length];
                    const maxExchangeLimit = maxAllowed[currentOrderIdx] || 7;

                    const canSelectMore = this.game_.cardsSelectedForExchange.length < maxExchangeLimit;
                    const isHumanTurn = this.game_.currentExchangingPlayerIndex === 0;

                    if (isHumanTurn) {
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
                    } else {
                        cv.element.style.filter = "none";
                        cv.element.style.cursor = "default";
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
        } else {
            // AI West (1) / AI East (2)
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
