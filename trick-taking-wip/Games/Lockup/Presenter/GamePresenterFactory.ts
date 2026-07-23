import { IGamePresenterFactory } from "~CardLib/Presenter/IGamePresenterFactory";
import { RootView } from "~CardLib/View/RootView";
import { Game } from "../Model/Game";
import { GamePresenter } from "./GamePresenter";

export class GamePresenterFactory implements IGamePresenterFactory {
    public createGame(parent: HTMLElement, params: URLSearchParams): GamePresenter {
        const game = new Game(params);
        const rootView = new RootView(parent);
        return new GamePresenter(game, rootView);
    }
}
