import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "fortythieves";
    public gameName = "Forty Thieves";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
