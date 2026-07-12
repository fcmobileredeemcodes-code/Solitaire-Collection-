import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "cruel";
    public gameName = "Cruel";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
