import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "acesup";
    public gameName = "AcesUp";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
