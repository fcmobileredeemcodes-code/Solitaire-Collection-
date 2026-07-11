import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "calculation";
    public gameName = "Calculation";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
