import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "skat";
    public gameName = "Skat";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
