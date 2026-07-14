import { IGameBase } from "~CardLib/Model/IGameBase";
import { GameOptions } from "./GameOptions";
import { Suit } from "~CardLib/Model/Suit";

export interface EuchreBid {
    action: "pass" | "order-up" | "name-suit" | "alone";
    chosenSuit?: Suit;
}

export interface IGame extends IGameBase {
    readonly options: GameOptions;
}
