import { IGameBase } from "~CardLib/Model/IGameBase";
import { GameOptions } from "./GameOptions";

export interface IGame extends IGameBase {
    readonly options: GameOptions;
}
