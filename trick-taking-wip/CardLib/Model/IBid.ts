import { Card } from "./Card";

export interface IBid {
    // Basic representation of a bid, if any.
}

export interface ITrickTakingAI<TContext, TBid extends IBid> {
    chooseBid(context: TContext): TBid | null;
    choosePlay(context: TContext, legalCards: Card[]): Card;
}
