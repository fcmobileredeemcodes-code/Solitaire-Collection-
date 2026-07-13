import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "seahaventowers";
    public gameName = "Seahaven Towers";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
