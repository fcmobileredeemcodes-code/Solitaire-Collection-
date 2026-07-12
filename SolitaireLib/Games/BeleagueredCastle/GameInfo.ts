import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "beleagueredcastle";
    public gameName = "Beleaguered Castle";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
