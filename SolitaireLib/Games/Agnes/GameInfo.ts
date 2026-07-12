import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "agnes";
    public gameName = "Agnes";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
