import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";

export class GameOptions extends GameOptionsBase {
    public restocksAllowed = 2;
    public autoMoveToFoundation = 2;

    public get saveKey() {
        return {
            restocksAllowed: this.restocksAllowed,
        };
    }

    constructor(params: URLSearchParams) {
        super();
        this.restocksAllowed = 2;
    }

    public toURLSearchParams(): URLSearchParams {
        const params = new URLSearchParams();
        return params;
    }
}
