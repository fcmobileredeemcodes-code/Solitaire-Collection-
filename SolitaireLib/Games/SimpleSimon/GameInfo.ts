import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "simplesimon";
    public gameName = "Simple Simon";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
