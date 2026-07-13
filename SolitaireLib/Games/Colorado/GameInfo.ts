import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "colorado";
    public gameName = "Colorado";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
