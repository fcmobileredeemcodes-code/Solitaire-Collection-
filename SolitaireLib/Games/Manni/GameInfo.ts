import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "manni";
    public gameName = "Manni";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
