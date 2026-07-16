import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game, getSameColorSuit } from "../Model/Game";
import { Rect } from "~CardLib/View/Rect";
import { Suit } from "~CardLib/Model/Suit";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "euchre",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: Game, rootView: IView) {
        super(game, rootView);

        // Listen for bid/discard events in the modal
        this.modalBody_.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target) return;

            if (target.classList.contains("bidActionButton")) {
                e.preventDefault();
                e.stopPropagation();

                const action = target.getAttribute("data-action") as "pass" | "order-up" | "name-suit";
                const suitAttr = target.getAttribute("data-suit");
                const suit = suitAttr ? parseInt(suitAttr, 10) as Suit : undefined;

                // Check "Alone" checkbox
                const aloneCheckbox = this.modalBody_.querySelector("#aloneCheckbox") as HTMLInputElement;
                const isAlone = aloneCheckbox ? aloneCheckbox.checked : false;

                let finalAction: "pass" | "order-up" | "name-suit" | "alone" = action;
                if (isAlone && (action === "order-up" || action === "name-suit")) {
                    finalAction = "alone";
                }

                void this.doOperation_(() => this.game_.submitHumanBid_({
                    action: finalAction,
                    chosenSuit: suit
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
            new Rect(cardWidth * 6, cardHeight, 0, heightRem / 2 - cardHeight / 2 - 1.5), // South (Human Hand)
            new Rect(cardWidth, cardHeight * 3, -widthRem / 2 + cardWidth / 2 + 1.5, 0), // West Hand
            new Rect(cardWidth * 6, cardHeight, 0, -heightRem / 2 + cardHeight / 2 + 1.5), // North Hand
            new Rect(cardWidth, cardHeight * 3, widthRem / 2 - cardWidth / 2 - 1.5, 0), // East Hand
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

            const isSittingOut = this.game_.sittingOutThisTrick[i];
            const isDealer = i === this.game_.dealerIndex;

            if (isSittingOut) {
                av.element.style.opacity = "0.25";
                const statusEl = av.element.querySelector(".avatarStatus") as HTMLElement;
                if (statusEl) {
                    statusEl.innerHTML = `<span style="color: #ff4d4d; font-weight: bold;">SITTING OUT</span>`;
                }
                av.setActive(false);
            } else {
                av.element.style.opacity = "1";
                av.setActive(
                    (this.game_.isBiddingPhase && i === this.game_.biddingPlayerIndex) ||
                    (!this.game_.isBiddingPhase && i === this.game_.activePlayerIndex)
                );

                const isTeamA = player.teamId === "TeamA";
                const teamTricks = isTeamA
                    ? this.game_.scoreTracker.getTricksByKey("TeamA")
                    : this.game_.scoreTracker.getTricksByKey("TeamB");
                const teamScore = isTeamA
                    ? this.game_.scoreTracker.getScoreByKey("TeamA")
                    : this.game_.scoreTracker.getScoreByKey("TeamB");

                const makerPlayer = this.game_.players[this.game_.makerPlayerIndex];
                const isMakerTeam = makerPlayer ? (makerPlayer.teamId === player.teamId) : false;
                const isMaker = i === this.game_.makerPlayerIndex;

                let roleText = "";
                if (isDealer) roleText += ` <span style="color: #ffcc00; font-weight: bold;">[Dealer]</span>`;
                if (isMaker) roleText += ` <span style="color: #00ff66; font-weight: bold;">[Maker]</span>`;
                else if (isMakerTeam) roleText += ` <span style="color: #66ffbb;">[Partner]</span>`;

                const statusEl = av.element.querySelector(".avatarStatus") as HTMLElement;
                if (statusEl) {
                    statusEl.innerHTML = `
                        ${roleText}<br/>
                        Tricks: ${this.game_.scoreTracker.getTricks(player)} (Team: ${teamTricks})<br/>
                        Team Score: ${teamScore}/10
                    `;
                }
            }

            if (this.game_.won) {
                const scoreA = this.game_.scoreTracker.getScoreByKey("TeamA");
                const scoreB = this.game_.scoreTracker.getScoreByKey("TeamB");
                const isWinner = isSittingOut ? false : (player.teamId === "TeamA" ? (scoreA >= 10 && scoreA > scoreB) : (scoreB >= 10 && scoreB > scoreA));
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

        let makerLogStr = "";
        const makerPlayer = this.game_.players[this.game_.makerPlayerIndex];
        if (makerPlayer) {
            const makerTeamLabel = makerPlayer.teamId === "TeamA" ? "Team A (You)" : "Team B (Opps)";
            makerLogStr = `<div style="font-size: 1.2vh; color: #66ffbb; margin-top: 0.1rem;">Makers: ${makerTeamLabel}</div>`;
        }

        this.centerStatusPanel_.innerHTML = `
            <div style="font-size: 1.4vh; opacity: 0.85;">ROUND ${this.game_.roundNumber}</div>
            <div style="font-size: 2.1vh; font-weight: bold; color: ${trumpColor}; margin-top: 0.1rem;">
                Trump: ${trumpText}
            </div>
            ${makerLogStr}
            ${(!this.game_.isBiddingPhase && !this.game_.waitingForHumanDiscard && this.game_.waitingForHumanPlay) ? `<div style="font-size: 1.3vh; color: #ffcc00; margin-top: 0.3rem; animation: pulse 1.5s infinite;">YOUR TURN</div>` : ""}
        `;

        this.centerStatusPanel_.style.left = `${cx - 8}rem`;
        this.centerStatusPanel_.style.top = `${cy - 3}rem`;
        this.centerStatusPanel_.style.width = "16rem";

        if (this.game_.isBiddingPhase) {
            const biddingPlayer = this.game_.players[this.game_.biddingPlayerIndex];

            if (this.game_.waitingForHumanBid) {
                let buttonsHtml = "";
                const isDealer = this.game_.biddingPlayerIndex === this.game_.dealerIndex;

                if (this.game_.biddingRound === 1) {
                    const proposedSuit = this.game_.proposedTrumpCard!.suit;
                    const proposedSuitName = this.getSuitSymbolHtml_(proposedSuit);

                    buttonsHtml += `
                        <button class="bidActionButton tt-modal-button btn-green" data-action="order-up">Order Up ${proposedSuitName}</button>
                        <button class="bidActionButton tt-modal-button btn-red" data-action="pass">Pass</button>
                    `;

                    this.showModal_(
                        "Bidding Round 1",
                        `<div style="margin-bottom: 0.5rem;">Order up ${proposedSuitName}?</div>
                         <div style="margin-bottom: 0.5rem;">
                             <label class="tt-modal-checkbox-label">
                                 <input type="checkbox" id="aloneCheckbox"> Go Alone
                             </label>
                         </div>
                         <div style="display: flex; justify-content: center; gap: 0.5rem;">
                             ${buttonsHtml}
                         </div>`
                    );
                } else {
                    // Round 2
                    const forbiddenSuit = this.game_.proposedTrumpCard!.suit;
                    const availableSuits = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs].filter(s => s !== forbiddenSuit);

                    for (const s of availableSuits) {
                        const name = this.getSuitSymbolHtml_(s);
                        buttonsHtml += `
                            <button class="bidActionButton tt-modal-button btn-blue" data-action="name-suit" data-suit="${s}">${name}</button>
                        `;
                    }

                    if (!isDealer) {
                        buttonsHtml += `
                            <button class="bidActionButton tt-modal-button btn-red" data-action="pass">Pass</button>
                        `;
                    }

                    this.showModal_(
                        "Bidding Round 2",
                        `<div style="margin-bottom: 0.5rem;">
                             ${isDealer ? "<strong>Stick the Dealer!</strong> You must name a trump suit:" : "Name a trump suit or pass:"}
                         </div>
                         <div style="margin-bottom: 0.5rem;">
                             <label class="tt-modal-checkbox-label">
                                 <input type="checkbox" id="aloneCheckbox"> Go Alone
                             </label>
                         </div>
                         <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 0.4rem; max-width: 18rem;">
                             ${buttonsHtml}
                         </div>`
                    );
                }
            } else {
                this.showModal_(
                    "Bidding Phase",
                    `<div>Waiting for <strong>${biddingPlayer.name}</strong> to bid...</div>`
                );
            }
        } else if (this.game_.waitingForHumanDiscard) {
            this.showModal_(
                "Discarding",
                `<div style="font-weight: bold; margin-bottom: 0.4rem;">You picked up the proposed card!</div>
                 <div>Click a card in your hand to discard.</div>`
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

    private getSuitSymbolHtml_(suit: Suit): string {
        const suitSymbols = {
            [Suit.Spades]: '<span style="color: #fff;">&spades;</span>',
            [Suit.Hearts]: '<span style="color: #ff4d4d;">&hearts;</span>',
            [Suit.Diamonds]: '<span style="color: #ff4d4d;">&diams;</span>',
            [Suit.Clubs]: '<span style="color: #fff;">&clubs;</span>',
            [Suit.None]: "",
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

                const isDiscarding = this.game_.waitingForHumanDiscard;
                const isMyTurn = !this.game_.isBiddingPhase && !isDiscarding && this.game_.waitingForHumanPlay;

                if (isDiscarding) {
                    cv.element.style.filter = "brightness(1.15) drop-shadow(0 0 6px #00ff66)";
                    cv.element.style.cursor = "pointer";
                    cv.element.style.transform = "translateY(-0.8rem)";
                } else if (isMyTurn) {
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
