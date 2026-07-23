import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "hearts";
    public gameName = "Hearts";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
