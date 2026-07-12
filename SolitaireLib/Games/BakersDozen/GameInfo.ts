import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "bakersdozen";
    public gameName = "BakersDozen";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
