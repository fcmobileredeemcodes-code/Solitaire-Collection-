import { IGameBase } from "~CardLib/Model/IGameBase";
import { IPile } from "~CardLib/Model/IPile";
import { GameOptions } from "./GameOptions";

export interface IGame extends IGameBase {
    readonly options: GameOptions;
    readonly foundations: IPile[];
    readonly tableaux: IPile[];
    readonly bouquet: IPile;
}
