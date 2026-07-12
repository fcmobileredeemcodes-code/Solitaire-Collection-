import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "australianpatience";
    public gameName = "Australian Patience";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
