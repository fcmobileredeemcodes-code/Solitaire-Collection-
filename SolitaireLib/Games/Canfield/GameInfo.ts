import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "canfield";
    public gameName = "Canfield";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
