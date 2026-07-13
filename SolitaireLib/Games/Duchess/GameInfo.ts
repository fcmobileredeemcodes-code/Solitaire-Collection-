import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "duchess";
    public gameName = "Duchess";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
