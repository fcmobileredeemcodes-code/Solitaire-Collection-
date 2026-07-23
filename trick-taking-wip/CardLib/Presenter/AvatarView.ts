import { IView } from "../View/IView";
import { ViewContext } from "../View/ViewContext";
import { IPlayer } from "../Model/IPlayer";

export class AvatarView implements IView {
    public readonly context: ViewContext;
    public readonly element: HTMLElement;
    private readonly player_: IPlayer;
    private readonly nameElement_: HTMLElement;
    private readonly statusElement_: HTMLElement;

    constructor(parent: IView, player: IPlayer, seat: "South" | "West" | "North" | "East") {
        this.context = parent.context;
        this.player_ = player;

        this.element = document.createElement("div");
        this.element.className = `avatarView seat${seat}`;

        // Apply inline styles to guarantee exact appearance without index.html / css dependencies
        this.element.style.position = "absolute";
        this.element.style.display = "flex";
        this.element.style.flexDirection = "column";
        this.element.style.alignItems = "center";
        this.element.style.justifyContent = "center";
        this.element.style.padding = "0.5rem 1rem";
        this.element.style.borderRadius = "0.8rem";
        this.element.style.background = "rgba(0, 0, 0, 0.65)";
        this.element.style.color = "white";
        this.element.style.fontFamily = "inherit";
        this.element.style.fontSize = "1.6vh";
        this.element.style.transition = "all 0.3s ease-in-out";
        this.element.style.zIndex = "5";
        this.element.style.border = "2px solid transparent";
        this.element.style.width = "9rem";
        this.element.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.4)";
        this.element.style.pointerEvents = "none";

        // Avatar Icon
        const icon = document.createElement("div");
        icon.className = `avatarIcon seat${seat}`;
        icon.style.marginBottom = "0.2rem";
        this.element.appendChild(icon);

        // Player Name
        this.nameElement_ = document.createElement("div");
        this.nameElement_.className = "avatarName";
        this.nameElement_.textContent = player.name;
        this.nameElement_.style.fontWeight = "bold";
        this.nameElement_.style.textAlign = "center";
        this.element.appendChild(this.nameElement_);

        // Player Status (Tricks won / Total Score)
        this.statusElement_ = document.createElement("div");
        this.statusElement_.className = "avatarStatus";
        this.statusElement_.textContent = "Tricks: 0 | Score: 0";
        this.statusElement_.style.opacity = "0.85";
        this.statusElement_.style.fontSize = "1.3vh";
        this.statusElement_.style.marginTop = "0.2rem";
        this.statusElement_.style.textAlign = "center";
        this.element.appendChild(this.statusElement_);

        parent.element.appendChild(this.element);
    }

    public updateStatus(tricks: number, score: number, skippedTricks?: number, bid?: number | null) {
        let text = "";
        if (bid !== undefined && bid !== null) {
            text = `Bid: ${bid} | Won: ${tricks}<br/>Score: ${score}`;
        } else {
            text = `Tricks: ${tricks} | Score: ${score}`;
        }
        if (skippedTricks && skippedTricks > 0) {
            text += `<br/><span style="color: #ff4d4d; font-weight: bold; animation: pulse 1.5s infinite;">Locked up: ${skippedTricks} left</span>`;
            this.statusElement_.innerHTML = text;
        } else {
            this.statusElement_.innerHTML = text;
        }
    }

    public setActive(active: boolean) {
        if (active) {
            this.element.style.borderColor = "#ffcc00"; // Glow border
            this.element.style.boxShadow = "0 0 15px #ffcc00";
            this.element.style.transform = "scale(1.06)";
            this.element.style.background = "rgba(40, 40, 0, 0.85)";
        } else {
            this.element.style.borderColor = "transparent";
            this.element.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.4)";
            this.element.style.transform = "scale(1)";
            this.element.style.background = "rgba(0, 0, 0, 0.65)";
        }
    }

    public setWinner(winner: boolean) {
        if (winner) {
            this.element.style.background = "rgba(46, 117, 89, 0.9)";
            this.element.style.borderColor = "#00ff00";
            this.element.style.boxShadow = "0 0 20px #00ff00";
        }
    }

    public dispose() {
        this.element.remove();
    }
}
