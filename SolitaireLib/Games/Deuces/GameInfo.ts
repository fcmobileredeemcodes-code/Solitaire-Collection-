import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "deuces";
    public gameName = "Deuces";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
