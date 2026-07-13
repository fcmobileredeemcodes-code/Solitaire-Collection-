import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "carpet";
    public gameName = "Carpet";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
