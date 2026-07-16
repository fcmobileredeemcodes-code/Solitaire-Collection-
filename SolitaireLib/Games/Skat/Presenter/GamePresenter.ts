import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game, SkatContractType, SkatAnnouncement } from "../Model/Game";
import { Rect } from "~CardLib/View/Rect";
import { Suit } from "~CardLib/Model/Suit";
import { Card } from "~CardLib/Model/Card";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "skat",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    // State for human actions
    public selectedDiscardCards: Card[] = [];

    // Temporary UI form selections for Contract
    public selectedContractType: SkatContractType = "Suit";
    public selectedTrumpSuit: Suit = Suit.Clubs;
    public selectedAnnouncement: SkatAnnouncement = "None";

    constructor(game: Game, rootView: IView) {
        super(game, rootView);

        // Listen for actions in the modal
        this.modalBody_.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target) return;

            // Bidding actions
            if (target.id === "bidProposeButton") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.submitHumanBidAction_("bid"));
            } else if (target.id === "bidPassButton") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.submitHumanBidAction_("pass"));
            } else if (target.id === "bidYesButton") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.submitHumanBidAction_("yes"));
            }

            // Declarer choice actions
            else if (target.id === "chooseSkatPickup") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.declareSkatGame_());
            } else if (target.id === "chooseHandGame") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.declareHandGame_());
            }

            // Discard action
            else if (target.id === "confirmDiscardButton") {
                e.preventDefault();
                e.stopPropagation();
                if (this.selectedDiscardCards.length === 2) {
                    const cardsToDiscard = [...this.selectedDiscardCards];
                    this.selectedDiscardCards = [];
                    void this.doOperation_(() => this.game_.submitHumanDiscard_(cardsToDiscard));
                }
            }

            // Contract actions
            else if (target.id === "declareContractButton") {
                e.preventDefault();
                e.stopPropagation();
                void this.doOperation_(() => this.game_.submitHumanContract_(
                    this.selectedContractType,
                    this.selectedTrumpSuit,
                    this.selectedAnnouncement
                ));
            }
        });

        // Contract form change listeners in the modal
        this.modalBody_.addEventListener("change", (e) => {
            const target = e.target as HTMLSelectElement | HTMLInputElement;
            if (!target) return;

            if (target.id === "contractTypeSelect") {
                this.selectedContractType = target.value as SkatContractType;
                this.relayoutAll_();
            } else if (target.id === "trumpSuitSelect") {
                this.selectedTrumpSuit = parseInt(target.value) as Suit;
                this.relayoutAll_();
            } else if (target.id === "announcementSelect") {
                this.selectedAnnouncement = target.value as SkatAnnouncement;
                this.relayoutAll_();
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
            new Rect(cardWidth * 9, cardHeight, 0, heightRem / 2 - cardHeight / 2 - 1.5), // South (Human Hand)
            new Rect(cardWidth, cardHeight * 4, -widthRem / 2 + cardWidth / 2 + 1.5, 0), // West Hand
            new Rect(cardWidth, cardHeight * 4, widthRem / 2 - cardWidth / 2 - 1.5, 0), // East Hand
        ];

        const playedPositions = [
            new Rect(cardWidth, cardHeight, 0, playedOffset), // South Played
            new Rect(cardWidth, cardHeight, -playedOffset, 0), // West Played
            new Rect(cardWidth, cardHeight, playedOffset, 0), // East Played
        ];

        // Layout PileViews
        for (let i = 0; i < 3; ++i) {
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

        // Layout Skat Pile (visually in center, but below center status panel, face-down)
        const skatPile = this.game_.skatPile;
        if (skatPile) {
            const pv = this.pileToPileView_.get(skatPile);
            if (pv) {
                // If it's the game end, we reveal the Skat! Otherwise it's face-down
                const showSkat = this.game_.won || (this.game_.roundNumber > 1 && this.game_.isBiddingPhase);
                pv.rect = new Rect(cardWidth * 2.2, cardHeight, 0, -playedOffset - 1.5);

                for (let i = 0; i < skatPile.length; ++i) {
                    const card = skatPile.at(i);
                    const cv = this.cardToCardView_.get(card);
                    if (cv) {
                        const offsetStep = cardWidth * 1.1;
                        cv.rect = new Rect(cardWidth, cardHeight, pv.rect.x - (offsetStep / 2) + i * offsetStep, pv.rect.y);
                        cv.faceUp = showSkat || card.faceUp;
                        cv.zIndex = 50 + i;
                        cv.element.style.filter = "none";
                        cv.element.style.cursor = "default";
                        cv.element.style.transform = "none";
                    }
                }
            }
        }

        // Layout AvatarViews (South, West, East)
        const avatarPositions = [
            { x: cx - 4.5, y: heightRem - cardHeight - 6.5 }, // South Avatar
            { x: 2.5, y: cy - cardHeight / 2 - 4.5 }, // West Avatar
            { x: widthRem - 11.5, y: cy - cardHeight / 2 - 4.5 }, // East Avatar
        ];

        for (let i = 0; i < 3; ++i) {
            const av = this.avatarViews_[i];
            const player = this.game_.players[i];

            av.element.style.left = `${avatarPositions[i].x}rem`;
            av.element.style.top = `${avatarPositions[i].y}rem`;

            const isDealer = i === this.game_.dealerIndex;
            const isDeclarer = i === this.game_.declarerIndex;

            let roleStr = "";
            if (isDealer) roleStr += " (Dealer)";
            if (isDeclarer) roleStr += " (Declarer)";

            av.updateStatus(
                this.game_.scoreTracker.getTricks(player),
                this.game_.scoreTracker.getScore(player)
            );
            av.setActive(i === this.game_.activePlayerIndex && !this.game_.isBiddingPhase && !this.game_.isSkatPickupPhase && !this.game_.isContractSelectionPhase);

            if (this.game_.won) {
                // Highest score wins!
                const scores = this.game_.players.map(p => this.game_.scoreTracker.getScore(p));
                const maxScore = Math.max(...scores);
                const isWinner = this.game_.scoreTracker.getScore(player) === maxScore;
                av.setWinner(isWinner);
            }
        }

        // Update Center Status Panel with Skat-specific screens and Modal
        this.updateCenterStatusHTML_(cx, cy);

        // Update logs panel
        this.logPanel_.innerHTML = this.game_.gameLog
            .slice(-10)
            .map(log => `<div style="margin-bottom: 0.2rem;">${log}</div>`)
            .reverse()
            .join("");
    }

    private updateCenterStatusHTML_(cx: number, cy: number) {
        const isPlayPhase = !this.game_.isBiddingPhase && !this.game_.isSkatPickupPhase && !this.game_.waitingForHumanDiscard && !this.game_.isContractSelectionPhase;

        if (isPlayPhase) {
            const isHumanTurn = this.game_.waitingForHumanPlay;
            const contractLabel = this.game_.getContractDisplayName_();
            const declarerName = this.game_.players[this.game_.declarerIndex]?.name || "";

            const runningPointsA = this.game_.roundCardPoints[0];
            const runningPointsB = this.game_.roundCardPoints[1];
            const runningPointsC = this.game_.roundCardPoints[2];

            this.centerStatusPanel_.innerHTML = `
                <div style="font-size: 1.1vh; opacity: 0.85; color: #ffcc00; font-weight: bold; text-transform: uppercase;">Skat: ${contractLabel}</div>
                <div style="font-size: 1.2vh; color: #aaa; margin-top: 0.1rem;">Declarer: ${declarerName} (Bid: ${this.game_.currentBid})</div>
                <div style="font-size: 1.1vh; color: #eee; margin-top: 0.2rem; background: rgba(255,255,255,0.1); padding: 0.2rem; border-radius: 0.2rem;">
                    Card Pts: You ${runningPointsA} | West ${runningPointsB} | East ${runningPointsC}
                </div>
                ${isHumanTurn ? `<div style="font-size: 1.3vh; color: #00ff66; margin-top: 0.3rem; animation: pulse 1.5s infinite; font-weight: bold;">YOUR TURN</div>` : ""}
            `;
            this.centerStatusPanel_.style.left = `${cx - 8}rem`;
            this.centerStatusPanel_.style.top = `${cy - 2.5}rem`;
            this.centerStatusPanel_.style.width = "16rem";
        } else {
            this.centerStatusPanel_.innerHTML = `
                <div style="font-size: 1.1vh; opacity: 0.85; color: #ffcc00; font-weight: bold; text-transform: uppercase;">Skat</div>
                <div style="font-size: 1.2vh; color: #aaa; margin-top: 0.1rem;">Bidding & Setup Phase</div>
            `;
            this.centerStatusPanel_.style.left = `${cx - 8}rem`;
            this.centerStatusPanel_.style.top = `${cy - 2.5}rem`;
            this.centerStatusPanel_.style.width = "16rem";
        }

        if (this.game_.isBiddingPhase) {
            const currentBidVal = this.game_.currentBid;
            const proposedVal = this.game_.proposedBid;
            const isHumanTurn = this.game_.waitingForHumanBid;

            const nextValidBid = this.game_.getNextValidBid_(currentBidVal);

            let biddingControlsHTML = "";
            if (isHumanTurn) {
                if (this.game_.biddingState === "active_to_propose") {
                    biddingControlsHTML = `
                        <div style="display: flex; gap: 0.5rem; margin-top: 0.4rem;">
                            <button id="bidProposeButton" class="tt-modal-button btn-green">Bid ${nextValidBid}</button>
                            <button id="bidPassButton" class="tt-modal-button btn-red">Pass</button>
                        </div>
                    `;
                } else {
                    biddingControlsHTML = `
                        <div style="display: flex; gap: 0.5rem; margin-top: 0.4rem;">
                            <button id="bidYesButton" class="tt-modal-button btn-green">Yes (Hold ${proposedVal})</button>
                            <button id="bidPassButton" class="tt-modal-button btn-red">Pass</button>
                        </div>
                    `;
                }
            } else {
                biddingControlsHTML = `<div style="font-size: 1.2vh; color: #aaa; margin-top: 0.4rem;">AI Deciding...</div>`;
            }

            const stateText = this.game_.biddingState === "active_to_propose" ? "Your turn to propose a bid." : `AI proposed ${proposedVal}. Hold or pass?`;

            this.showModal_(
                "Bidding Phase",
                `<div style="font-size: 1.5vh; margin-top: 0.2rem; color: #fff;">Current High Bid: <strong>${currentBidVal || "None (18)"}</strong></div>
                 <div style="font-size: 1.2vh; color: #ccc; margin-top: 0.2rem; margin-bottom: 0.4rem;">${stateText}</div>
                 ${biddingControlsHTML}`
            );
        }

        else if (this.game_.isSkatPickupPhase) {
            const isHumanDeclarer = this.game_.declarerIndex === 0;
            if (isHumanDeclarer) {
                this.showModal_(
                    "You Won Bidding! (" + this.game_.currentBid + ")",
                    `<div style="font-size: 1.4vh; margin-top: 0.2rem; color: #fff; margin-bottom: 0.6rem;">Do you want to pick up the face-down Skat?</div>
                     <div style="display: flex; gap: 0.5rem;">
                         <button id="chooseSkatPickup" class="tt-modal-button btn-green">Pick Up Skat</button>
                         <button id="chooseHandGame" class="tt-modal-button btn-blue">Hand Game (+1 mult)</button>
                     </div>`
                );
            } else {
                this.showModal_(
                    "Skat Pickup",
                    `<div style="font-size: 1.4vh; color: #ccc;">AI Declarer choice...</div>`
                );
            }
        }

        else if (this.game_.waitingForHumanDiscard) {
            const selectedCount = this.selectedDiscardCards.length;
            const confirmEnabled = selectedCount === 2;

            this.showModal_(
                "Discard Phase",
                `<div style="font-size: 1.4vh; margin-top: 0.2rem; color: #fff; margin-bottom: 0.4rem;">Select exactly <strong>2 cards</strong> to discard back to Skat</div>
                 <div style="font-size: 1.2vh; color: #ccc; margin-top: 0.1rem; margin-bottom: 0.4rem;">Selected: ${selectedCount} / 2</div>
                 <button id="confirmDiscardButton" class="tt-modal-button ${confirmEnabled ? 'btn-green' : ''}" ${confirmEnabled ? "" : "disabled"}>Confirm Discard</button>`
            );
        }

        else if (this.game_.isContractSelectionPhase) {
            const isHuman = this.game_.waitingForHumanContract;
            if (isHuman) {
                let suitSelectHTML = "";
                if (this.selectedContractType === "Suit") {
                    suitSelectHTML = `
                        <div style="margin-top: 0.4rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <label style="font-size: 1.2vh; color: #ccc;">Trump Suit: </label>
                            <select id="trumpSuitSelect" class="tt-modal-select">
                                <option value="${Suit.Clubs}" ${this.selectedTrumpSuit === Suit.Clubs ? "selected" : ""}>♣ Clubs</option>
                                <option value="${Suit.Spades}" ${this.selectedTrumpSuit === Suit.Spades ? "selected" : ""}>♠ Spades</option>
                                <option value="${Suit.Hearts}" ${this.selectedTrumpSuit === Suit.Hearts ? "selected" : ""}>♥ Hearts</option>
                                <option value="${Suit.Diamonds}" ${this.selectedTrumpSuit === Suit.Diamonds ? "selected" : ""}>♦ Diamonds</option>
                            </select>
                        </div>
                    `;
                }

                let announceHTML = "";
                if (this.game_.isHandGame) {
                    announceHTML = `
                        <div style="margin-top: 0.4rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <label style="font-size: 1.2vh; color: #ccc;">Announce: </label>
                            <select id="announcementSelect" class="tt-modal-select">
                                <option value="None" ${this.selectedAnnouncement === "None" ? "selected" : ""}>None</option>
                                <option value="Schneider" ${this.selectedAnnouncement === "Schneider" ? "selected" : ""}>Schneider</option>
                                <option value="Schwarz" ${this.selectedAnnouncement === "Schwarz" ? "selected" : ""}>Schwarz</option>
                                <option value="Ouvert" ${this.selectedAnnouncement === "Ouvert" ? "selected" : ""}>Ouvert</option>
                            </select>
                        </div>
                    `;
                } else if (this.selectedContractType === "Null") {
                    announceHTML = `
                        <div style="margin-top: 0.4rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <label style="font-size: 1.2vh; color: #ccc;">Null Mode: </label>
                            <select id="announcementSelect" class="tt-modal-select">
                                <option value="None" ${this.selectedAnnouncement === "None" ? "selected" : ""}>Normal Null</option>
                                <option value="Ouvert" ${this.selectedAnnouncement === "Ouvert" ? "selected" : ""}>Null Ouvert</option>
                            </select>
                        </div>
                    `;
                }

                this.showModal_(
                    "Select Contract",
                    `<div style="margin-top: 0.3rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <label style="font-size: 1.2vh; color: #ccc;">Type: </label>
                        <select id="contractTypeSelect" class="tt-modal-select">
                            <option value="Suit" ${this.selectedContractType === "Suit" ? "selected" : ""}>Suit Game</option>
                            <option value="Grand" ${this.selectedContractType === "Grand" ? "selected" : ""}>Grand</option>
                            <option value="Null" ${this.selectedContractType === "Null" ? "selected" : ""}>Null</option>
                        </select>
                    </div>
                    ${suitSelectHTML}
                    ${announceHTML}
                    <button id="declareContractButton" class="tt-modal-button btn-green" style="margin-top: 0.8rem; width: 100%;">Declare Contract</button>`
                );
            } else {
                this.showModal_(
                    "Select Contract",
                    `<div style="font-size: 1.4vh; color: #ccc;">AI Declaring Contract...</div>`
                );
            }
        }

        else {
            this.hideModal_();
        }
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

                if (this.game_.waitingForHumanDiscard) {
                    const isSelected = this.selectedDiscardCards.includes(card);
                    const canSelectMore = this.selectedDiscardCards.length < 2;

                    if (isSelected) {
                        cv.element.style.filter = "brightness(1.15) drop-shadow(0 0 8px #ff4d4d)";
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

                    // Card selection handler for discard
                    cv.click = () => {
                        const idx = this.selectedDiscardCards.indexOf(card);
                        if (idx >= 0) {
                            this.selectedDiscardCards.splice(idx, 1);
                        } else if (this.selectedDiscardCards.length < 2) {
                            this.selectedDiscardCards.push(card);
                        }
                        this.relayoutAll_();
                    };
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

                    cv.click = () => {
                        void this.doOperation_(() => this.game_.cardPrimary(card));
                    };
                } else {
                    cv.element.style.filter = "none";
                    cv.element.style.cursor = "default";
                    cv.element.style.transform = "none";
                    cv.click = null;
                }
            }
        } else {
            // AI Hands (West: 1, East: 2) - vertically fanned
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
