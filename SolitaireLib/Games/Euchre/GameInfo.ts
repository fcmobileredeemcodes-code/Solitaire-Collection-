import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "euchre";
    public gameName = "Euchre";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
