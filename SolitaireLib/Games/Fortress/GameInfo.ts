import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "fortress";
    public gameName = "Fortress";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
