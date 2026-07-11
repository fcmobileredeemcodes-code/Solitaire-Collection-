import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "gypsy";
    public gameName = "Gypsy";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
