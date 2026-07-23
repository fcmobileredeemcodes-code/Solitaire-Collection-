import { Colour } from "../Model/Colour";
import { Rank } from "../Model/Rank";
import { Suit } from "../Model/Suit";
import { CardView } from "./CardView";
import { IView } from "./IView";

export class TrickTakingCardView extends CardView {
    constructor(parent: IView, suit: Suit, colour: Colour, rank: Rank) {
        super(parent, suit, colour, rank);
        this.element.classList.add("trickTakingCard");
    }
}
