import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "maze";
    public gameName = "Maze";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
