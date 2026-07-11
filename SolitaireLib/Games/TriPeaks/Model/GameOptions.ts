import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";
import * as URLSearchParamsEx from "~CardLib/URLSearchParamsEx";

export class GameOptions extends GameOptionsBase {
    public autoReveal = true;

    public get saveKey() {
        return {
            autoReveal: this.autoReveal,
        };
    }

    constructor(params: URLSearchParams) {
        super();
        this.autoReveal = URLSearchParamsEx.getBool(params, "autoReveal", true);
    }

    public toURLSearchParams(): URLSearchParams {
        const params = new URLSearchParams();
        URLSearchParamsEx.setBool(params, "autoReveal", this.autoReveal, true);
        return params;
    }
}
