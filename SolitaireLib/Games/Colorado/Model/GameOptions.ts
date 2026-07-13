import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";
import * as URLSearchParamsEx from "~CardLib/URLSearchParamsEx";

export class GameOptions extends GameOptionsBase {
    public autoMoveToFoundation = true;

    public get saveKey() {
        return {
            autoMoveToFoundation: this.autoMoveToFoundation,
        };
    }

    constructor(params: URLSearchParams) {
        super();
        this.autoMoveToFoundation = URLSearchParamsEx.getBool(params, "autoMoveToFoundation", true);
    }

    public toURLSearchParams(): URLSearchParams {
        const params = new URLSearchParams();
        URLSearchParamsEx.setBool(params, "autoMoveToFoundation", this.autoMoveToFoundation, true);
        return params;
    }
}
