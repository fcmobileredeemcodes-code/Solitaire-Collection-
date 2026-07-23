import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "bridge";
    public gameName = "Bridge";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
