import { IGameBase } from "~CardLib/Model/IGameBase";
import { Suit } from "~CardLib/Model/Suit";
import { GameOptions } from "./GameOptions";

export interface BridgeBid {
    level: number; // 1-7, or 0 if pass/double/redouble
    suit: Suit | "no-trump";
    isPass: boolean;
    isDouble: boolean;
    isRedouble: boolean;
    bidderIndex: number;
}

export interface IGame extends IGameBase {
    readonly options: GameOptions;
    isBiddingPhase: boolean;
    waitingForHumanBid: boolean;
    biddingPlayerIndex: number;
    bids: BridgeBid[];
    declarerIndex: number;
    dummyIndex: number;
    contract: BridgeBid | null;
    isDoubled: boolean;
    isRedoubled: boolean;
    belowTheLineScore: { TeamA: number; TeamB: number };
    aboveTheLineScore: { TeamA: number; TeamB: number };
    gamesWon: { TeamA: number; TeamB: number };
}
