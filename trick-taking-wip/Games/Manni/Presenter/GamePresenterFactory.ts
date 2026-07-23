import { IGamePresenter } from "~CardLib/Presenter/IGamePresenter";
import { IGamePresenterFactory } from "~CardLib/Presenter/IGamePresenterFactory";
import { RootView } from "~CardLib/View/RootView";
import { Game } from "../Model/Game";
import { GamePresenter } from "./GamePresenter";

export class GamePresenterFactory implements IGamePresenterFactory {
    public createGame(parentElement: HTMLElement, params: URLSearchParams): IGamePresenter {
        const game = new Game(params);
        const view = new RootView(parentElement);
        return new GamePresenter(game, view);
    }
}
