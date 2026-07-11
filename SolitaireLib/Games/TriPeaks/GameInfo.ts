import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "tripeaks";
    public gameName = "TriPeaks";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
