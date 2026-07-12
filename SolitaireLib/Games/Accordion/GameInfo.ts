import { IGameInfo } from "~CardLib/IGameInfo";
import { GamePresenterFactory } from "./Presenter/GamePresenterFactory";

class GameInfo implements IGameInfo {
    public gameId = "accordion";
    public gameName = "Accordion";
    public gamePresenterFactory = new GamePresenterFactory();
}

export default new GameInfo();
