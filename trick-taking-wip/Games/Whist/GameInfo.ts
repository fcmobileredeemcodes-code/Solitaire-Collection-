import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "whist";
    public gameName = "Whist";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
