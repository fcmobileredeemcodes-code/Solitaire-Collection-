import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "lockup";
    public gameName = "Lockup";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
