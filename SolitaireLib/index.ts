import * as Debug from "~CardLib/Debug";
import { IGameInfo } from "~CardLib/IGameInfo";
import { IGamePresenter } from "~CardLib/Presenter/IGamePresenter";
import Klondike from "~Games/Klondike/GameInfo";
import KlondikeEx from "~Games/KlondikeEx/GameInfo";
import Pyramid from "~Games/Pyramid/GameInfo";
import Penguin from "~Games/Penguin/GameInfo";
import Giza from "~Games/Giza/GameInfo";
import Golf from "~Games/Golf/GameInfo";
import ClockEngine from "~Games/ClockEngine/GameInfo";
import AcesUp from "~Games/AcesUp/GameInfo";
import Calculation from "~Games/Calculation/GameInfo";
import Canfield from "~Games/Canfield/GameInfo";
import FortyEight from "~Games/FortyEight/GameInfo";
import Freecell from "~Games/Freecell/GameInfo";
import BakersGame from "~Games/BakersGame/GameInfo";
import EightOff from "~Games/EightOff/GameInfo";
import Yukon from "~Games/Yukon/GameInfo";
import Gypsy from "~Games/Gypsy/GameInfo";
import Maze from "~Games/Maze/GameInfo";
import FortyThieves from "~Games/FortyThieves/GameInfo";
import Spider from "~Games/Spider/GameInfo";
import Spiderette from "~Games/Spiderette/GameInfo";
import TriPeaks from "~Games/TriPeaks/GameInfo";
import Scorpion from "~Games/Scorpion/GameInfo";
import SimpleSimon from "~Games/SimpleSimon/GameInfo";

const gameInfos = new Map<string, IGameInfo>();
gameInfos.set(Klondike.gameId, Klondike);
gameInfos.set(KlondikeEx.gameId, KlondikeEx);
gameInfos.set(Pyramid.gameId, Pyramid);
gameInfos.set(Penguin.gameId, Penguin);
gameInfos.set(Giza.gameId, Giza);
gameInfos.set(Golf.gameId, Golf);
gameInfos.set(ClockEngine.gameId, ClockEngine);
gameInfos.set(AcesUp.gameId, AcesUp);
gameInfos.set(Calculation.gameId, Calculation);
gameInfos.set(Canfield.gameId, Canfield);
gameInfos.set(FortyEight.gameId, FortyEight);
gameInfos.set(Freecell.gameId, Freecell);
gameInfos.set(BakersGame.gameId, BakersGame);
gameInfos.set(EightOff.gameId, EightOff);
gameInfos.set(Yukon.gameId, Yukon);
gameInfos.set(Gypsy.gameId, Gypsy);
gameInfos.set(Maze.gameId, Maze);
gameInfos.set(FortyThieves.gameId, FortyThieves);
gameInfos.set(Spider.gameId, Spider);
gameInfos.set(Spiderette.gameId, Spiderette);
gameInfos.set(TriPeaks.gameId, TriPeaks);
gameInfos.set(Scorpion.gameId, Scorpion);
gameInfos.set(SimpleSimon.gameId, SimpleSimon);

window.addEventListener("load", () => {
    const tableHolder = document.getElementById("tableHolder") ?? document.body;
    const homePage = document.getElementById("homePage")!;
    const gamePage = document.getElementById("gamePage")!;
    const gameGrid = document.getElementById("gameGrid")!;
    const backToGamesLink = document.getElementById("backToGamesLink")!;

    // Populate gameGrid
    gameInfos.forEach((info) => {
        const a = document.createElement("a");
        a.href = `#${info.gameId}`;
        a.className = "gameCard";
        
        const title = document.createElement("h2");
        title.textContent = info.gameName;
        a.appendChild(title);
        
        gameGrid.appendChild(a);
    });

    let currentGame: IGamePresenter | undefined;

    const refreshGame = () => {
        if (currentGame) {
            currentGame.dispose();
            currentGame = undefined;
        }

        const hash = window.location.hash;
        
        if (!hash || hash === "#") {
            homePage.style.display = "block";
            gamePage.style.display = "none";
            backToGamesLink.style.display = "none";
            document.title = "SolitaireLib";
            return;
        }

        const qPos = hash.indexOf("?");
        let params;
        let gameKey;

        if (qPos >= 0) {
            params = new URLSearchParams(hash.substr(qPos + 1));
            gameKey = hash.substr(1, qPos - 1);
        } else if (hash.includes("&") || hash.includes("?") || hash.includes("=")) {
            params = new URLSearchParams(hash.substr(1));
            gameKey = params.get("game");
        } else {
            params = new URLSearchParams("");
            gameKey = hash.substr(1);
        }

        const gameInfo = gameKey ? gameInfos.get(gameKey.toLowerCase()) : undefined;

        if (!gameInfo) {
            Debug.error(`Unknown game ${gameKey}.`);
            homePage.style.display = "block";
            gamePage.style.display = "none";
            backToGamesLink.style.display = "none";
            document.title = "SolitaireLib";
            return;
        }

        homePage.style.display = "none";
        gamePage.style.display = "block";
        backToGamesLink.style.display = "inline";
        document.title = `${gameInfo.gameName} — SolitaireLib`;

        currentGame = gameInfo.gamePresenterFactory.createGame(tableHolder, params);
        currentGame.start();
    };

    window.addEventListener("hashchange", refreshGame);
    refreshGame();
});
