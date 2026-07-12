import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "flower_garden";
    public gameName = "Flower Garden";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
