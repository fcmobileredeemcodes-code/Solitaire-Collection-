import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "sultan";
    public gameName = "Sultan";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
