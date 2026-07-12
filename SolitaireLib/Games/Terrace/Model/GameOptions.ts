import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";
import * as URLSearchParamsEx from "~CardLib/URLSearchParamsEx";

export class GameOptions extends GameOptionsBase {
    public autoPlayStock = true;
    public autoMoveToFoundation = 2;

    public get saveKey() {
        return {
            autoPlayStock: this.autoPlayStock,
            autoMoveToFoundation: this.autoMoveToFoundation,
        };
    }

    constructor(params: URLSearchParams) {
        super();
        this.autoPlayStock = URLSearchParamsEx.getBool(params, "autoPlayStock", true);
        this.autoMoveToFoundation = Math.max(0, URLSearchParamsEx.getNumber(params, "autoMoveToFoundation", 2));
    }

    public toURLSearchParams(): URLSearchParams {
        const params = new URLSearchParams();
        URLSearchParamsEx.setBool(params, "autoPlayStock", this.autoPlayStock, true);
        URLSearchParamsEx.setNumber(params, "autoMoveToFoundation", this.autoMoveToFoundation, 2);
        return params;
    }
}
