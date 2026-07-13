import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "bristol";
    public gameName = "Bristol";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
