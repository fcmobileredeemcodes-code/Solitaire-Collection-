import { IView } from "../View/IView";
import { ViewContext } from "../View/ViewContext";
import { IPlayer } from "../Model/IPlayer";

function getAvatarSvg(seat: string, isHuman: boolean): string {
    if (isHuman) {
        return `
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
                <defs>
                    <radialGradient id="gradHuman" cx="50%" cy="40%" r="50%">
                        <stop offset="0%" stop-color="#729fcf"/>
                        <stop offset="100%" stop-color="#204a87"/>
                    </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="48" fill="url(#gradHuman)" />
                <circle cx="50" cy="40" r="18" fill="#ffffff" opacity="0.95" />
                <path d="M 18 80 C 18 55, 82 55, 82 80 Z" fill="#ffffff" opacity="0.95" />
            </svg>
        `;
    }

    if (seat === "West") {
        return `
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
                <circle cx="50" cy="50" r="48" fill="#e2725b" />
                <circle cx="50" cy="48" r="32" fill="#ffcd94" />
                <path d="M 18 45 Q 50 15 82 45 Q 82 30 70 25 Q 50 20 30 25 Z" fill="#4e3629" />
                <circle cx="38" cy="46" r="4" fill="#333" />
                <circle cx="62" cy="46" r="4" fill="#333" />
                <rect x="28" y="42" width="18" height="8" rx="2" fill="none" stroke="#e63946" stroke-width="3" />
                <rect x="54" y="42" width="18" height="8" rx="2" fill="none" stroke="#e63946" stroke-width="3" />
                <line x1="46" y1="46" x2="54" y2="46" stroke="#e63946" stroke-width="3" />
                <path d="M 42 62 Q 50 70 58 62" fill="none" stroke="#333" stroke-width="3" stroke-linecap="round" />
            </svg>
        `;
    }

    if (seat === "North") {
        return `
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
                <circle cx="50" cy="50" r="48" fill="#ffb703" />
                <circle cx="50" cy="48" r="32" fill="#ffdfba" />
                <path d="M 22 40 C 25 15, 75 15, 78 40 C 65 30, 35 30, 22 40 Z" fill="#6f2dbd" />
                <path d="M 18 44 C 15 48, 25 50, 28 44" fill="#6f2dbd" />
                <path d="M 82 44 C 85 48, 75 50, 72 44" fill="#6f2dbd" />
                <circle cx="38" cy="48" r="4.5" fill="#222" />
                <circle cx="62" cy="48" r="4.5" fill="#222" />
                <circle cx="30" cy="56" r="5" fill="#ff4d4d" opacity="0.4" />
                <circle cx="70" cy="56" r="5" fill="#ff4d4d" opacity="0.4" />
                <path d="M 40 60 Q 50 68 60 60" fill="none" stroke="#222" stroke-width="3.5" stroke-linecap="round" />
            </svg>
        `;
    }

    return `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
            <circle cx="50" cy="50" r="48" fill="#2a9d8f" />
            <circle cx="50" cy="48" r="32" fill="#ffe3d8" />
            <path d="M 22 38 Q 50 10 78 38 Z" fill="#264653" />
            <path d="M 15 38 L 85 38" stroke="#264653" stroke-width="6" stroke-linecap="round" />
            <circle cx="38" cy="48" r="4" fill="#333" />
            <circle cx="62" cy="48" r="4" fill="#333" />
            <path d="M 42 62 Q 50 72 58 62" fill="none" stroke="#333" stroke-width="3" stroke-linecap="round" />
        </svg>
    `;
}

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
        this.element.style.position = "absolute";
        this.element.style.pointerEvents = "none";
        this.element.style.zIndex = "100";

        // Avatar Icon Circle Container
        const icon = document.createElement("div");
        icon.className = "avatarIcon";
        icon.innerHTML = getAvatarSvg(seat, player.isHuman);
        this.element.appendChild(icon);

        // Player Name
        this.nameElement_ = document.createElement("div");
        this.nameElement_.className = "avatarName";
        this.nameElement_.textContent = player.name;
        this.element.appendChild(this.nameElement_);

        // Player Status (Tricks won / Total Score)
        this.statusElement_ = document.createElement("div");
        this.statusElement_.className = "avatarStatus";
        this.statusElement_.innerHTML = "Tricks: 0 | Score: 0";
        this.element.appendChild(this.statusElement_);

        parent.element.appendChild(this.element);
    }

    public updateStatus(tricks: number, score: number, skippedTricks?: number, bid?: number | null) {
        let text = "";
        if (bid !== undefined && bid !== null) {
            text = `Bid: ${bid} | Won: ${tricks} | Score: ${score}`;
        } else {
            text = `Tricks: ${tricks} | Score: ${score}`;
        }
        if (skippedTricks && skippedTricks > 0) {
            text += `<br/><span style="color: #ff4d4d; font-weight: bold; animation: pulse 1.5s infinite;">Locked up: ${skippedTricks} left</span>`;
        }
        this.statusElement_.innerHTML = text;
    }

    public setActive(active: boolean) {
        if (active) {
            this.element.style.borderColor = "#ffcc00"; // Golden highlight glow
            this.element.style.boxShadow = "0 0 20px #ffcc00";
            this.element.style.transform = "scale(1.08)";
            this.element.style.background = "rgba(45, 45, 10, 0.95)";
        } else {
            this.element.style.borderColor = "rgba(255, 255, 255, 0.3)";
            this.element.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.5)";
            this.element.style.transform = "scale(1)";
            this.element.style.background = "rgba(20, 30, 20, 0.85)";
        }
    }

    public setWinner(winner: boolean) {
        if (winner) {
            this.element.style.background = "rgba(46, 117, 89, 0.95)";
            this.element.style.borderColor = "#00ff00";
            this.element.style.boxShadow = "0 0 25px #00ff00";
            this.nameElement_.innerHTML = `👑 ${this.player_.name}`;
        }
    }

    public dispose() {
        this.element.remove();
    }
}
