import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "golf";
    public gameName = "Golf";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
