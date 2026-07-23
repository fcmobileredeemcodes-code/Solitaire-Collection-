import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";

export class GameOptions extends GameOptionsBase {
    public get saveKey() {
        return {};
    }

    constructor(params: URLSearchParams) {
        super();
    }

    public toURLSearchParams(): URLSearchParams {
        return new URLSearchParams();
    }
}
