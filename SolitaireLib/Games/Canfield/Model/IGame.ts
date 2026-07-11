import { IGameBase } from "~CardLib/Model/IGameBase";
import { IPile } from "~CardLib/Model/IPile";
import { GameOptions } from "./GameOptions";

export interface IGame extends IGameBase {
    readonly options: GameOptions;
    readonly tableaux: IPile[];
    readonly reserve: IPile;
    readonly foundations: IPile[];
    readonly waste9: IPile;
    readonly waste10: IPile;
    readonly waste11: IPile;
    readonly stock: IPile;
}
