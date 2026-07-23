import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "ohhell";
    public gameName = "OhHell";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
