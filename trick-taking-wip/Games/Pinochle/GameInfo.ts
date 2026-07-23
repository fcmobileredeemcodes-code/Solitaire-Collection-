import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "pinochle";
    public gameName = "Pinochle";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
