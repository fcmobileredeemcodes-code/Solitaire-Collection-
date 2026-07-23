import { IPlayer } from "./IPlayer";

export class ScoreTracker {
    private scores_ = new Map<string, number>(); // ID -> total score
    private tricks_ = new Map<string, number>(); // ID -> tricks won in current round
    private readonly mode_: "player" | "team";

    constructor(mode: "player" | "team" = "player") {
        this.mode_ = mode;
    }

    public get mode() {
        return this.mode_;
    }

    private getKey_(player: IPlayer): string {
        if (this.mode_ === "team") {
            return player.teamId || player.id;
        }
        return player.id;
    }

    public getScore(player: IPlayer): number {
        return this.scores_.get(this.getKey_(player)) || 0;
    }

    public getScoreByKey(key: string): number {
        return this.scores_.get(key) || 0;
    }

    public setScore(player: IPlayer, score: number) {
        this.scores_.set(this.getKey_(player), score);
    }

    public setScoreByKey(key: string, score: number) {
        this.scores_.set(key, score);
    }

    public addScore(player: IPlayer, amount: number) {
        const key = this.getKey_(player);
        this.scores_.set(key, (this.scores_.get(key) || 0) + amount);
    }

    public addScoreByKey(key: string, amount: number) {
        this.scores_.set(key, (this.scores_.get(key) || 0) + amount);
    }

    public getTricks(player: IPlayer): number {
        return this.tricks_.get(this.getKey_(player)) || 0;
    }

    public getTricksByKey(key: string): number {
        return this.tricks_.get(key) || 0;
    }

    public addTrick(player: IPlayer) {
        const key = this.getKey_(player);
        this.tricks_.set(key, (this.tricks_.get(key) || 0) + 1);
    }

    public resetTricks() {
        this.tricks_.clear();
    }

    public resetAll() {
        this.scores_.clear();
        this.tricks_.clear();
    }
}
