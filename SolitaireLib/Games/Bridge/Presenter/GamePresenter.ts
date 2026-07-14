import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game } from "../Model/Game";
import { Rect } from "~CardLib/View/Rect";
import { Suit } from "~CardLib/Model/Suit";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    private selectedLevel_: number | null = null;

    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "bridge",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: Game, rootView: IView) {
        super(game, rootView);

        // Listen for bid actions using event delegation
        this.centerStatusPanel_.style.pointerEvents = "auto";
        this.centerStatusPanel_.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target) return;

            if (target.classList.contains("bridgeLevelButton")) {
                e.preventDefault();
                e.stopPropagation();
                const level = parseInt(target.getAttribute("data-level") || "1", 10);
                this.selectedLevel_ = level;
                this.relayoutAll_();
            } else if (target.classList.contains("bridgeStrainButton")) {
                e.preventDefault();
                e.stopPropagation();
                const strainAttr = target.getAttribute("data-strain");
                const suit = strainAttr === "no-trump" ? "no-trump" : parseInt(strainAttr || "0", 10) as Suit;

                const bid = {
                    level: this.selectedLevel_ || 1,
                    suit: suit,
                    isPass: false,
                    isDouble: false,
                    isRedouble: false,
                };
                this.selectedLevel_ = null;
                void this.doOperation_(() => this.game_.submitHumanBid_(bid));
            } else if (target.classList.contains("bridgePassButton")) {
                e.preventDefault();
                e.stopPropagation();
                this.selectedLevel_ = null;
                void this.doOperation_(() => this.game_.submitHumanBid_({
                    level: 0,
                    suit: Suit.None,
                    isPass: true,
                    isDouble: false,
                    isRedouble: false,
                }));
            } else if (target.classList.contains("bridgeDoubleButton")) {
                e.preventDefault();
                e.stopPropagation();
                this.selectedLevel_ = null;
                void this.doOperation_(() => this.game_.submitHumanBid_({
                    level: 0,
                    suit: Suit.None,
                    isPass: false,
                    isDouble: true,
                    isRedouble: false,
                }));
            } else if (target.classList.contains("bridgeRedoubleButton")) {
                e.preventDefault();
                e.stopPropagation();
                this.selectedLevel_ = null;
                void this.doOperation_(() => this.game_.submitHumanBid_({
                    level: 0,
                    suit: Suit.None,
                    isPass: false,
                    isDouble: false,
                    isRedouble: true,
                }));
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
            new Rect(cardWidth * 8, cardHeight, 0, heightRem / 2 - cardHeight / 2 - 1.5), // South (Human Hand)
            new Rect(cardWidth, cardHeight * 4.5, -widthRem / 2 + cardWidth / 2 + 1.5, 0), // West Hand
            new Rect(cardWidth * 8, cardHeight, 0, -heightRem / 2 + cardHeight / 2 + 1.5), // North Hand (Dummy Hand)
            new Rect(cardWidth, cardHeight * 4.5, widthRem / 2 - cardWidth / 2 - 1.5, 0), // East Hand
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

            const isDealer = i === this.game_.dealerIndex;
            const isDeclarer = i === this.game_.declarerIndex;
            const isDummy = i === this.game_.dummyIndex;

            av.setActive(
                (this.game_.isBiddingPhase && i === this.game_.biddingPlayerIndex) ||
                (!this.game_.isBiddingPhase && i === this.game_.activePlayerIndex)
            );

            // Partnership Tricks and Scores
            const isTeamA = player.teamId === "TeamA";
            const teamTricks = isTeamA
                ? this.game_.scoreTracker.getTricksByKey("TeamA")
                : this.game_.scoreTracker.getTricksByKey("TeamB");

            const bScore = isTeamA ? this.game_.belowTheLineScore.TeamA : this.game_.belowTheLineScore.TeamB;
            const aScore = isTeamA ? this.game_.aboveTheLineScore.TeamA : this.game_.aboveTheLineScore.TeamB;
            const gWon = isTeamA ? this.game_.gamesWon.TeamA : this.game_.gamesWon.TeamB;
            const totalScore = bScore + aScore;

            const isVulnerable = gWon >= 1;

            let roleText = "";
            if (isDealer) roleText += ` <span style="color: #ffcc00; font-weight: bold;">[Dealer]</span>`;
            if (isDeclarer) roleText += ` <span style="color: #00ff66; font-weight: bold;">[Declarer]</span>`;
            else if (isDummy) roleText += ` <span style="color: #ff4d4d; font-weight: bold;">[Dummy]</span>`;

            const statusEl = av.element.querySelector(".avatarStatus") as HTMLElement;
            if (statusEl) {
                statusEl.innerHTML = `
                    ${roleText}<br/>
                    Tricks won: ${this.game_.scoreTracker.getTricks(player)} (Team: ${teamTricks})<br/>
                    Below: ${bScore} | Above: ${aScore}<br/>
                    Games: ${gWon}/2 ${isVulnerable ? '<span style="color:#ff3333;font-weight:bold;">(VUL)</span>' : ''}<br/>
                    Total Score: ${totalScore}
                `;
            }

            if (this.game_.won) {
                const wonMatch = isTeamA ? (this.game_.gamesWon.TeamA === 2) : (this.game_.gamesWon.TeamB === 2);
                av.setWinner(wonMatch);
            }
        }

        // Update Center Status Panel
        if (this.game_.isBiddingPhase) {
            const biddingPlayer = this.game_.players[this.game_.biddingPlayerIndex];

            if (this.game_.waitingForHumanBid) {
                let levelButtonsHtml = "";
                for (let l = 1; l <= 7; ++l) {
                    const isSelected = (this.selectedLevel_ === l);
                    levelButtonsHtml += `
                        <button class="bridgeLevelButton" data-level="${l}" style="
                            background: ${isSelected ? '#ffcc00' : '#444'};
                            color: ${isSelected ? '#000' : '#fff'};
                            border: none; padding: 0.35rem 0.55rem; margin: 0.1rem;
                            border-radius: 0.25rem; font-size: 1.3vh; font-weight: bold; cursor: pointer;
                        ">${l}</button>
                    `;
                }

                let strainButtonsHtml = "";
                if (this.selectedLevel_ !== null) {
                    const strains = [
                        { label: "♣", val: Suit.Clubs, color: "#fff" },
                        { label: "♦", val: Suit.Diamonds, color: "#ff4d4d" },
                        { label: "♥", val: Suit.Hearts, color: "#ff4d4d" },
                        { label: "♠", val: Suit.Spades, color: "#fff" },
                        { label: "NT", val: "no-trump", color: "#ffd700" }
                    ];

                    for (const str of strains) {
                        const candidateBid = {
                            level: this.selectedLevel_,
                            suit: str.val,
                            isPass: false,
                            isDouble: false,
                            isRedouble: false,
                            bidderIndex: 0
                        };

                        const lastBid = this.game_.getLastNonPassBid();
                        const isLegal = !lastBid || (this.game_.compareBids(candidateBid, lastBid) > 0);

                        if (isLegal) {
                            strainButtonsHtml += `
                                <button class="bridgeStrainButton" data-strain="${str.val}" style="
                                    background: #222; color: ${str.color}; border: 1px solid ${str.color};
                                    padding: 0.35rem 0.6rem; margin: 0.1rem;
                                    border-radius: 0.25rem; font-size: 1.3vh; font-weight: bold; cursor: pointer;
                                ">${str.label}</button>
                            `;
                        }
                    }
                }

                const canDouble = this.game_.canDouble(0);
                const canRedouble = this.game_.canRedouble(0);

                let actionButtonsHtml = `
                    <button class="bridgePassButton" style="
                        background: #ff4d4d; color: #fff; border: none; padding: 0.4rem 0.8rem; margin: 0.15rem;
                        border-radius: 0.3rem; font-size: 1.3vh; font-weight: bold; cursor: pointer;
                    ">Pass</button>
                `;

                if (canDouble) {
                    actionButtonsHtml += `
                        <button class="bridgeDoubleButton" style="
                            background: #33a3ff; color: #fff; border: none; padding: 0.4rem 0.8rem; margin: 0.15rem;
                            border-radius: 0.3rem; font-size: 1.3vh; font-weight: bold; cursor: pointer;
                        ">Double</button>
                    `;
                }

                if (canRedouble) {
                    actionButtonsHtml += `
                        <button class="bridgeRedoubleButton" style="
                            background: #b84dff; color: #fff; border: none; padding: 0.4rem 0.8rem; margin: 0.15rem;
                            border-radius: 0.3rem; font-size: 1.3vh; font-weight: bold; cursor: pointer;
                        ">Redouble</button>
                    `;
                }

                this.centerStatusPanel_.innerHTML = `
                    <div style="font-size: 1.3vh; opacity: 0.85; font-weight: bold; color: #ffcc00; letter-spacing: 0.05rem;">YOUR BID</div>
                    <div style="font-size: 1.3vh; color: #fff; margin-top: 0.2rem;">Choose Level:</div>
                    <div style="display: flex; justify-content: center; margin-top: 0.2rem;">
                        ${levelButtonsHtml}
                    </div>
                    ${this.selectedLevel_ !== null ? `
                        <div style="font-size: 1.3vh; color: #fff; margin-top: 0.3rem;">Choose Strain:</div>
                        <div style="display: flex; justify-content: center; margin-top: 0.2rem;">
                            ${strainButtonsHtml || '<span style="color:#ff4d4d;font-size:1.2vh;">No legal strains for this level</span>'}
                        </div>
                    ` : ""}
                    <div style="display: flex; justify-content: center; margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.4rem;">
                        ${actionButtonsHtml}
                    </div>
                `;
            } else {
                this.centerStatusPanel_.innerHTML = `
                    <div style="font-size: 1.3vh; opacity: 0.85; font-weight: bold; color: #ffcc00; letter-spacing: 0.05rem;">BIDDING PHASE</div>
                    <div style="font-size: 1.5vh; margin-top: 0.2rem; color: #fff;">Waiting for <strong>${biddingPlayer.name}</strong> to bid...</div>
                `;
            }
        } else {
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
            const trumpText = this.game_.contract ? (this.game_.contract.suit === "no-trump" ? "No Trump" : suitSymbols[trumpSuit]) : "No Trump";
            const trumpColor = this.game_.contract ? (this.game_.contract.suit === "no-trump" ? "#ffd700" : suitColors[trumpSuit]) : "#ffffff";

            let contractInfoStr = "";
            if (this.game_.contract) {
                const lastBid = this.game_.contract;
                const declPlayer = this.game_.players[this.game_.declarerIndex];
                const declTeamLabel = declPlayer ? (declPlayer.teamId === "TeamA" ? "Team A (You)" : "Team B (Opps)") : "";

                let suffix = "";
                if (this.game_.isRedoubled) suffix = " <span style='color:#b84dff;font-weight:bold;'>[Redoubled]</span>";
                else if (this.game_.isDoubled) suffix = " <span style='color:#33a3ff;font-weight:bold;'>[Doubled]</span>";

                contractInfoStr = `
                    <div style="font-size: 1.2vh; color: #66ffbb; margin-top: 0.1rem;">Declarer: ${declTeamLabel}</div>
                    <div style="font-size: 1.3vh; color: #fff; margin-top: 0.1rem;">Contract Level: ${lastBid.level} ${suffix}</div>
                `;
            }

            const activePlayer = this.game_.players[this.game_.activePlayerIndex];
            const turnLabel = this.game_.waitingForHumanPlay
                ? (this.game_.activePlayerIndex === this.game_.dummyIndex ? `<div style="font-size: 1.3vh; color: #ff3333; margin-top: 0.3rem; animation: pulse 1.5s infinite; font-weight:bold;">PLAY FROM DUMMY</div>` : `<div style="font-size: 1.3vh; color: #ffcc00; margin-top: 0.3rem; animation: pulse 1.5s infinite;">YOUR TURN</div>`)
                : `<div style="font-size: 1.3vh; color: #aaa; margin-top: 0.3rem;">Turn: ${activePlayer ? activePlayer.name : ""}</div>`;

            this.centerStatusPanel_.innerHTML = `
                <div style="font-size: 1.4vh; opacity: 0.85;">ROUND ${this.game_.roundNumber}</div>
                <div style="font-size: 2.1vh; font-weight: bold; color: ${trumpColor}; margin-top: 0.1rem;">
                    Trump: ${trumpText}
                </div>
                ${contractInfoStr}
                ${turnLabel}
            `;
        }

        this.centerStatusPanel_.style.left = `${cx - 8}rem`;
        this.centerStatusPanel_.style.top = `${cy - 4}rem`;
        this.centerStatusPanel_.style.width = "16rem";

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

                const isMyTurn = !this.game_.isBiddingPhase && this.game_.waitingForHumanPlay && (this.game_.activePlayerIndex === 0);

                if (isMyTurn) {
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
            // North (Dummy Hand / AI)
            const maxHandWidth = rect.sizeX;
            const stepX = count > 1 ? Math.min(cardWidth * 0.5, (maxHandWidth - cardWidth) / (count - 1)) : 0;
            const startX = rect.x - (stepX * (count - 1)) / 2;

            for (let i = 0; i < count; ++i) {
                const card = pile.at(i);
                const cv = this.cardToCardView_.get(card);
                if (!cv) continue;

                cv.rect = new Rect(cardWidth, cardHeight, startX + i * stepX, rect.y);
                cv.faceUp = card.faceUp;
                cv.zIndex = 200 + i;

                // If South (You) is Declarer, and active turn is Dummy (North, index 2), the human plays dummy's cards!
                const isDummyPlayTurn = !this.game_.isBiddingPhase && this.game_.waitingForHumanPlay && (this.game_.activePlayerIndex === 2) && (this.game_.declarerIndex === 0);

                if (isDummyPlayTurn) {
                    const legalCards = this.game_.getLegalCards_(pile);
                    if (legalCards.includes(card)) {
                        cv.element.style.filter = "brightness(1.15) drop-shadow(0 0 6px #ff3333)";
                        cv.element.style.cursor = "pointer";
                        cv.element.style.transform = "translateY(0.8rem)"; // fan down since North is at top of screen
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
            // East/West Hand
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
