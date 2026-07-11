import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "spider";
    public gameName = "Spider";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
