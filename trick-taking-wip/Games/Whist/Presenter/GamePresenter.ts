import { TrickTakingGamePresenterBase } from "~CardLib/Presenter/TrickTakingGamePresenterBase";
import { IView } from "~CardLib/View/IView";
import { Game } from "../Model/Game";

export class GamePresenter extends TrickTakingGamePresenterBase<Game> {
    protected get saveDataKey_() {
        return JSON.stringify({
            gameName: "whist",
            version: 0,
            options: this.game_.options.saveKey,
        });
    }

    constructor(game: Game, rootView: IView) {
        super(game, rootView);
    }
}
