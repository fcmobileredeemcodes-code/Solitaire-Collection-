import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "giza";
    public gameName = "Giza";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
