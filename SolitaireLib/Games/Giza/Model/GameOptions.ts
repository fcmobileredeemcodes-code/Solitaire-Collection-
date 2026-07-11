import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";
import * as URLSearchParamsEx from "~CardLib/URLSearchParamsEx";

export class GameOptions extends GameOptionsBase {
    public autoPlayKings = true;

    public get saveKey() {
        return {
            autoPlayKings: this.autoPlayKings,
        };
    }

    constructor(params: URLSearchParams) {
        super();
        this.autoPlayKings = URLSearchParamsEx.getBool(params, "autoPlayKings", true);
    }

    public toURLSearchParams(): URLSearchParams {
        const params = new URLSearchParams();
        URLSearchParamsEx.setBool(params, "autoPlayKings", this.autoPlayKings, true);
        return params;
    }
}
