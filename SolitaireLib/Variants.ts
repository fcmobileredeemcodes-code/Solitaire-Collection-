import { IGameInfo } from "~CardLib/IGameInfo";
import { IGamePresenter } from "~CardLib/Presenter/IGamePresenter";
import { IGamePresenterFactory } from "~CardLib/Presenter/IGamePresenterFactory";

import Klondike from "./Games/Klondike/GameInfo";
import Easthaven from "./Games/Easthaven/GameInfo";
import Canfield from "./Games/Canfield/GameInfo";
import FortyThieves from "./Games/FortyThieves/GameInfo";
import Freecell from "./Games/Freecell/GameInfo";
import Spider from "./Games/Spider/GameInfo";
import Spiderette from "./Games/Spiderette/GameInfo";
import Golf from "./Games/Golf/GameInfo";
import AcesUp from "./Games/AcesUp/GameInfo";
import Yukon from "./Games/Yukon/GameInfo";
import SeahavenTowers from "./Games/SeahavenTowers/GameInfo";

class VariantPresenterFactory implements IGamePresenterFactory {
    private readonly baseFactory_: IGamePresenterFactory;
    private readonly extraParams_: Record<string, string>;

    constructor(baseFactory: IGamePresenterFactory, extraParams: Record<string, string>) {
        this.baseFactory_ = baseFactory;
        this.extraParams_ = extraParams;
    }

    public createGame(parentElement: HTMLElement, searchParams: URLSearchParams): IGamePresenter {
        const mergedParams = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(this.extraParams_)) {
            mergedParams.set(key, value);
        }
        return this.baseFactory_.createGame(parentElement, mergedParams);
    }
}

interface VariantDefinition {
    id: string;
    name: string;
    base: IGameInfo;
    params: Record<string, string>;
}

const definitions: VariantDefinition[] = [
    // 1-7. Klondike Variants
    { id: "klondike_draw_1_easy", name: "Klondike Draw 1 (Easy)", base: Klondike, params: { stockDraws: "1", restocksAllowed: "999" } },
    { id: "klondike_draw_1_hard", name: "Klondike Draw 1 (Hard)", base: Klondike, params: { stockDraws: "1", restocksAllowed: "0" } },
    { id: "klondike_draw_3_easy", name: "Klondike Draw 3 (Easy)", base: Klondike, params: { stockDraws: "3", restocksAllowed: "999" } },
    { id: "klondike_draw_3_hard", name: "Klondike Draw 3 (Hard)", base: Klondike, params: { stockDraws: "3", restocksAllowed: "1" } },
    { id: "klondike_draw_2", name: "Klondike (Draw 2)", base: Klondike, params: { stockDraws: "2", restocksAllowed: "999" } },
    { id: "klondike_draw_4", name: "Klondike (Draw 4)", base: Klondike, params: { stockDraws: "4", restocksAllowed: "999" } },
    { id: "klondike_draw_5", name: "Klondike (Draw 5)", base: Klondike, params: { stockDraws: "5", restocksAllowed: "999" } },

    // 8-9. Easthaven Variants
    { id: "easthaven_draw_3", name: "Easthaven (Draw 3)", base: Easthaven, params: { stockDraws: "3" } },
    { id: "easthaven_draw_1_easy", name: "Easthaven Draw 1 (Easy)", base: Easthaven, params: { stockDraws: "1", restocksAllowed: "999" } },

    // 10-13. Canfield Variants
    { id: "canfield_draw_1", name: "Canfield (Draw 1)", base: Canfield, params: { stockDraws: "1" } },
    { id: "canfield_draw_1_hard", name: "Canfield (Draw 1, Hard)", base: Canfield, params: { stockDraws: "1", restocksAllowed: "0" } },
    { id: "canfield_draw_3_hard", name: "Canfield (Draw 3, Hard)", base: Canfield, params: { stockDraws: "3", restocksAllowed: "1" } },
    { id: "canfield_draw_2", name: "Canfield (Draw 2)", base: Canfield, params: { stockDraws: "2" } },

    // 14-16, 26. Forty Thieves Variants
    { id: "forty_thieves_easy", name: "Forty Thieves (Easy)", base: FortyThieves, params: { restocksAllowed: "999" } },
    { id: "forty_thieves_hard", name: "Forty Thieves (Hard)", base: FortyThieves, params: { restocksAllowed: "0" } },
    { id: "forty_thieves_draw_3", name: "Forty Thieves (Draw 3)", base: FortyThieves, params: { restocksAllowed: "3" } },
    { id: "forty_thieves_draw_2", name: "Forty Thieves (Draw 2)", base: FortyThieves, params: { restocksAllowed: "1" } },

    // 17-18. Freecell Variants
    { id: "freecell_easy", name: "Freecell (Easy)", base: Freecell, params: { autoReveal: "true", autoMoveToFoundation: "3" } },
    { id: "freecell_hard", name: "Freecell (Hard)", base: Freecell, params: { autoMoveToFoundation: "0" } },

    // 27-28. Spider Variants
    { id: "spider_1_suit", name: "Spider (1 Suit)", base: Spider, params: { suitsCount: "1" } },
    { id: "spider_2_suits", name: "Spider (2 Suits)", base: Spider, params: { suitsCount: "2" } },

    // 29-30. Spiderette Variants
    { id: "spiderette_1_suit", name: "Spiderette (1 Suit)", base: Spiderette, params: { suitsCount: "1" } },
    { id: "spiderette_2_suits", name: "Spiderette (2 Suits)", base: Spiderette, params: { suitsCount: "2" } },

    // 71-72. Hard Modes
    { id: "golf_hard", name: "Golf (Hard)", base: Golf, params: { allowKingWrap: "false" } },
    { id: "aces_up_hard", name: "Aces Up (Hard)", base: AcesUp, params: { relaxFilling: "false" } },

    // 73-74. Strict Modes
    { id: "klondike_d3_strict", name: "Klondike Draw 3 (Strict)", base: Klondike, params: { stockDraws: "3", restocksAllowed: "0" } },
    { id: "canfield_d1_strict", name: "Canfield Draw 1 (Strict)", base: Canfield, params: { stockDraws: "1", restocksAllowed: "0" } },

    // 75-79. Special Freecell Variants
    { id: "freecell_d1", name: "Freecell (1 Cell)", base: Freecell, params: { cellsCount: "1" } },
    { id: "freecell_d2", name: "Freecell (2 Cells)", base: Freecell, params: { cellsCount: "2" } },
    { id: "freecell_d3", name: "Freecell (3 Cells)", base: Freecell, params: { cellsCount: "3" } },
    { id: "double_freecell", name: "Double Freecell", base: Freecell, params: { decksCount: "2" } },
    { id: "triple_freecell", name: "Triple Freecell", base: Freecell, params: { decksCount: "3" } },

    // 80-81. Whitehead & Alaska
    { id: "whitehead", name: "Whitehead", base: Klondike, params: { buildSameColor: "true" } },
    { id: "alaska", name: "Alaska", base: Yukon, params: { buildInSuit: "true" } },

    // 82-93. Forty Thieves Historical Variants
    { id: "josephine", name: "Josephine", base: FortyThieves, params: { moveSequences: "true" } },
    { id: "lucas", name: "Lucas", base: FortyThieves, params: { dealAcesFirst: "true" } },
    { id: "maria", name: "Maria", base: FortyThieves, params: { columnsCount: "9" } },
    { id: "limited", name: "Limited", base: FortyThieves, params: { columnsCount: "12", cardsPerColumn: "3" } },
    { id: "streets", name: "Streets", base: FortyThieves, params: { buildAlternatingColor: "true" } },
    { id: "rank_and_file", name: "Rank and File", base: FortyThieves, params: { cardsFaceDown: "true" } },
    { id: "number_ten", name: "Number Ten", base: FortyThieves, params: { columnsCount: "10", cardsFaceUp: "2" } },
    { id: "red_and_black", name: "Red and Black", base: FortyThieves, params: { buildAlternatingColor: "true" } },
    { id: "emperor", name: "Emperor", base: FortyThieves, params: { buildAlternatingColor: "true", cardsFaceDown: "true" } },
    { id: "ali_baba", name: "Ali Baba", base: FortyThieves, params: { columnsCount: "10", cardsPerColumn: "4" } },
    { id: "blockade", name: "Blockade", base: FortyThieves, params: { blockadeMode: "true" } },
    { id: "busy_aces", name: "Busy Aces", base: FortyThieves, params: { columnsCount: "12", cardsPerColumn: "1" } },

    // 94-96. Other Classic Solitaires
    { id: "forecell", name: "Forecell", base: Freecell, params: { emptyTableauKingsOnly: "true" } },
    { id: "tuxedo", name: "Tuxedo", base: SeahavenTowers, params: { tuxedoRules: "true" } },
    { id: "seven", name: "Seven Freecell", base: Freecell, params: { columnsCount: "7" } },
];

export const variants: IGameInfo[] = definitions.map((def) => {
    return {
        gameId: def.id,
        gameName: def.name,
        gamePresenterFactory: new VariantPresenterFactory(def.base.gamePresenterFactory, def.params),
    };
});
