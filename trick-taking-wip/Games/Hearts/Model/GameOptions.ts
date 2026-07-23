import { GameOptionsBase } from "~CardLib/Model/GameOptionsBase";

export class GameOptions extends GameOptionsBase {
    constructor(params: URLSearchParams) {
        super(params);
    }
}
