import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "yukon";
    public gameName = "Yukon";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
