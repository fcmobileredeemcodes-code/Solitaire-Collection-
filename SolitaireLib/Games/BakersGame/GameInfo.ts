import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "bakersgame";
    public gameName = "Bakers Game";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
