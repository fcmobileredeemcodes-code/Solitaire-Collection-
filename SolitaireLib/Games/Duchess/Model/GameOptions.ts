import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";
import * as URLSearchParamsEx from "~CardLib/URLSearchParamsEx";

export class GameOptions extends GameOptionsBase {
    public autoReveal = true;
    public autoPlayStock = true;
    public autoMoveToFoundation = 2;
    public chooseFoundationRankDuringPlay = true;

    public get saveKey() {
        return {
            autoReveal: this.autoReveal,
            autoPlayStock: this.autoPlayStock,
            autoMoveToFoundation: this.autoMoveToFoundation,
            chooseFoundationRankDuringPlay: this.chooseFoundationRankDuringPlay,
        };
    }

    constructor(params: URLSearchParams) {
        super();
        this.autoReveal = URLSearchParamsEx.getBool(params, "autoReveal", true);
        this.autoPlayStock = URLSearchParamsEx.getBool(params, "autoPlayStock", true);
        this.autoMoveToFoundation = Math.max(0, URLSearchParamsEx.getNumber(params, "autoMoveToFoundation", 2));
        this.chooseFoundationRankDuringPlay = URLSearchParamsEx.getBool(params, "chooseFoundationRankDuringPlay", true);
    }

    public toURLSearchParams(): URLSearchParams {
        const params = new URLSearchParams();
        URLSearchParamsEx.setBool(params, "autoReveal", this.autoReveal, true);
        URLSearchParamsEx.setBool(params, "autoPlayStock", this.autoPlayStock, true);
        URLSearchParamsEx.setNumber(params, "autoMoveToFoundation", this.autoMoveToFoundation, 2);
        URLSearchParamsEx.setBool(params, "chooseFoundationRankDuringPlay", this.chooseFoundationRankDuringPlay, true);
        return params;
    }
}
