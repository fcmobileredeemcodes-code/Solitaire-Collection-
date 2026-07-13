import { IGameBase } from "~CardLib/Model/IGameBase";
import { IPile } from "~CardLib/Model/IPile";
import { GameOptions } from "./GameOptions";

export interface IGame extends IGameBase {
    readonly options: GameOptions;
    readonly stock: IPile;
    readonly waste0: IPile;
    readonly waste1: IPile;
    readonly waste2: IPile;
    readonly foundations: IPile[];
    readonly tableaux: IPile[];
}
