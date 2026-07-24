import prand from "pure-rand";
import * as Debug from "../Debug";
import { Card } from "./Card";
import { DelayHint } from "./DelayHint";
import { GameSerializationContext } from "./GameSerializationContext";
import { ICard } from "./ICard";
import { IGameBase } from "./IGameBase";
import { IPile } from "./IPile";
import { Pile } from "./Pile";
import { CardFlipOperation } from "./Undoable/CardFlipOperation";
import { CompoundUndoableOperation } from "./Undoable/CompoundUndoableOperation";
import { IUndoableOperation } from "./Undoable/IUndoableOperation";
import { PileInsertOperation } from "./Undoable/PileInsertOperation";
import { PileMaxFanOperation } from "./Undoable/PileMaxFanOperation";

const SAVE_DATA_FORMAT = 3;

export abstract class GameBase implements IGameBase {
    public cards: Card[] = [];
    public piles: Pile[] = [];

    private undoStack_: IUndoableOperation[] = [];
    private redoStack_: IUndoableOperation[] = [];
    private currentOperation_: CompoundUndoableOperation | undefined = undefined;

    private gamesStarted_ = 0;
    public gamesStartedChanged = () => {};
    public get gamesStarted() {
        return this.gamesStarted_;
    }
    public set gamesStarted(gamesStarted: number) {
        if (gamesStarted === this.gamesStarted_) return;
        this.gamesStarted_ = gamesStarted;
        this.gamesStartedChanged();
    }

    private gamesWon_ = 0;
    public gamesWonChanged = () => {};
    public get gamesWon() {
        return this.gamesWon_;
    }
    public set gamesWon(gamesWon: number) {
        if (gamesWon === this.gamesWon_) return;
        this.gamesWon_ = gamesWon;
        this.gamesWonChanged();
    }

    public get canUndo() {
        return this.undoStack_.length > 0;
    }

    public *undo() {
        const undoOp = this.undoStack_.pop();
        if (undoOp) {
            undoOp.undo();
            this.redoStack_.push(undoOp);
        }
    }

    public get canRedo() {
        return this.redoStack_.length > 0;
    }

    public *redo() {
        const redoOp = this.redoStack_.pop();
        if (redoOp) {
            redoOp.redo();
            this.undoStack_.push(redoOp);
        }
    }

    private won_ = false;
    public wonChanged = () => {};
    public get won() {
        return this.won_;
    }
    public set won(won: boolean) {
        if (won === this.won_) return;
        this.won_ = won;
        this.wonChanged();
    }

    public abstract readonly wonCards: ICard[];

    protected abstract doGetWon_(): boolean;

    private checkWon_() {
        const wasWon = this.won;
        this.won = this.doGetWon_();
        if (!wasWon && this.won) {
            this.undoStack_ = [];
            this.redoStack_ = [];
            ++this.gamesWon;
        }
    }

    private isWinnableEnabled_(): boolean {
        if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test") {
            return false;
        }
        if (typeof globalThis !== "undefined" && (globalThis as any).vitest) {
            return false;
        }
        if ((this as any).options && typeof (this as any).options.winnable === "boolean") {
            return (this as any).options.winnable;
        }
        if (typeof window !== "undefined" && window.location && window.location.hash) {
            const hash = window.location.hash;
            const qPos = hash.indexOf("?");
            if (qPos >= 0) {
                const params = new URLSearchParams(hash.substring(qPos + 1));
                const val = params.get("winnable");
                if (val !== null) {
                    return val !== "false";
                }
            }
        }
        return true;
    }

    private getBoardStateHash_(): string {
        const parts: string[] = [];
        for (const card of this.cards) {
            parts.push(card.faceUp ? "U" : "D");
        }
        for (const pile of this.piles) {
            parts.push(`p${pile.maxFan}`);
            for (let i = 0; i < pile.length; i++) {
                const card = pile.at(i);
                const cardIndex = this.cards.indexOf(card);
                parts.push(`${cardIndex}`);
            }
        }
        return parts.join(",");
    }

    private consumeGenerator_(gen: Generator<any, any, any>) {
        let res = gen.next();
        while (!res.done) {
            res = gen.next();
        }
    }

    private isSolvable_(): boolean {
        const startHash = this.getBoardStateHash_();
        const startState = this.serialize();

        // Save and mute all callbacks to prevent DOM updates during solver search
        const savedPileCallbacks = this.piles.map((p) => ({
            pile: p,
            cardsChanged: p.cardsChanged,
            maxFanChanged: p.maxFanChanged,
        }));
        const savedCardCallbacks = this.cards.map((c) => ({
            card: c,
            pileChanged: c.pileChanged,
            pileIndexChanged: c.pileIndexChanged,
            faceUpChanged: c.faceUpChanged,
        }));
        const savedGameCallbacks = {
            wonChanged: this.wonChanged,
            gamesStartedChanged: this.gamesStartedChanged,
            gamesWonChanged: this.gamesWonChanged,
        };

        for (const p of this.piles) {
            p.cardsChanged = () => {};
            p.maxFanChanged = () => {};
        }
        for (const c of this.cards) {
            c.pileChanged = () => {};
            c.pileIndexChanged = () => {};
            c.faceUpChanged = () => {};
        }
        this.wonChanged = () => {};
        this.gamesStartedChanged = () => {};
        this.gamesWonChanged = () => {};

        let solvable = false;

        try {
            const openList: { hash: string; state: string; score: number }[] = [];
            const visited = new Set<string>();

            const initialScore = this.wonCards.length;
            openList.push({ hash: startHash, state: startState, score: initialScore });
            visited.add(startHash);

            let statesVisited = 0;
            const maxStates = 150;

            while (openList.length > 0 && statesVisited < maxStates) {
                openList.sort((a, b) => b.score - a.score);
                const current = openList.shift()!;
                statesVisited++;

                this.deserialize(current.state);
                if (this.won) {
                    solvable = true;
                    break;
                }

                const possibleMoves: { type: string; card?: Card; pile?: Pile }[] = [];

                // 1. dropCard moves (for face-up cards only)
                for (const card of this.cards) {
                    if (!card.faceUp) continue;
                    const dragInfo = this.canDrag(card);
                    if (dragInfo.canDrag) {
                        for (const pile of this.piles) {
                            if (this.previewDrop(card, pile)) {
                                possibleMoves.push({ type: "drop", card, pile });
                            }
                        }
                    }
                }

                // 2. cardPrimary moves (clicks on top cards of piles only)
                for (const pile of this.piles) {
                    const topCard = pile.peek();
                    if (topCard) {
                        possibleMoves.push({ type: "cardPrimary", card: topCard });
                    }
                }

                // 3. pilePrimary moves (pile clicks)
                for (const pile of this.piles) {
                    possibleMoves.push({ type: "pilePrimary", pile });
                }

                for (const move of possibleMoves) {
                    this.deserialize(current.state);

                    if (move.type === "drop") {
                        this.consumeGenerator_(this.dropCard(move.card!, move.pile!));
                    } else if (move.type === "cardPrimary") {
                        this.consumeGenerator_(this.cardPrimary(move.card!));
                    } else if (move.type === "pilePrimary") {
                        this.consumeGenerator_(this.pilePrimary(move.pile!));
                    }

                    if (this.won) {
                        solvable = true;
                        break;
                    }

                    const nextHash = this.getBoardStateHash_();
                    if (nextHash !== current.hash && !visited.has(nextHash)) {
                        visited.add(nextHash);
                        const nextState = this.serialize();
                        const nextScore = this.wonCards.length;
                        openList.push({ hash: nextHash, state: nextState, score: nextScore });
                    }
                }
                if (solvable) {
                    break;
                }
            }
        } finally {
            // Restore callbacks
            for (const { pile, cardsChanged, maxFanChanged } of savedPileCallbacks) {
                pile.cardsChanged = cardsChanged;
                pile.maxFanChanged = maxFanChanged;
            }
            for (const { card, pileChanged, pileIndexChanged, faceUpChanged } of savedCardCallbacks) {
                card.pileChanged = pileChanged;
                card.pileIndexChanged = pileIndexChanged;
                card.faceUpChanged = faceUpChanged;
            }
            this.wonChanged = savedGameCallbacks.wonChanged;
            this.gamesStartedChanged = savedGameCallbacks.gamesStartedChanged;
            this.gamesWonChanged = savedGameCallbacks.gamesWonChanged;

            // Restore starting state with original callbacks active so views are updated
            this.deserialize(startState);
        }

        return solvable;
    }

    public *restart(seed: number) {
        let winnableSeed = seed;
        const winnable = this.isWinnableEnabled_();

        const savedGamesWon = this.gamesWon;
        const savedGamesStarted = this.gamesStarted;

        if (winnable) {
            let currentSeed = seed;
            let found = false;
            const maxAttempts = 20;
            for (let i = 0; i < maxAttempts; ++i) {
                const rng = prand.mersenne(currentSeed);
                this.consumeGenerator_(this.restart_(rng));
                if (this.isSolvable_()) {
                    winnableSeed = currentSeed;
                    found = true;
                    break;
                }
                currentSeed = (currentSeed + 1) % 2147483647;
            }
        }

        // Restore game statistics to pre-search state
        this.gamesWon = savedGamesWon;
        this.gamesStarted = savedGamesStarted;

        if (this.startOperation_()) {
            this.won = false;
            ++this.gamesStarted;
            const rng = prand.mersenne(winnableSeed);
            yield* this.restart_(rng);
            this.commitOperation_();
            this.undoStack_ = [];
            this.redoStack_ = [];
            this.checkWon_();
        }
    }

    public *pilePrimary(pile: IPile): Generator<DelayHint, void> {
        if (this.startOperation_()) {
            if (!(pile instanceof Pile)) Debug.error();
            Debug.assert(this.piles.indexOf(pile) >= 0);
            yield* this.pilePrimary_(pile);
            this.commitOperation_();
            this.checkWon_();
        }
    }

    public *pileSecondary(pile: IPile): Generator<DelayHint, void> {
        if (this.startOperation_()) {
            if (!(pile instanceof Pile)) Debug.error();
            Debug.assert(this.piles.indexOf(pile) >= 0);
            yield* this.pileSecondary_(pile);
            this.commitOperation_();
            this.checkWon_();
        }
    }

    public *cardPrimary(card: ICard): Generator<DelayHint, void> {
        if (this.startOperation_()) {
            if (!(card instanceof Card)) Debug.error();
            Debug.assert(this.cards.indexOf(card) >= 0);
            yield* this.cardPrimary_(card);
            this.commitOperation_();
            this.checkWon_();
        }
    }

    public *cardSecondary(card: ICard): Generator<DelayHint, void> {
        if (this.startOperation_()) {
            if (!(card instanceof Card)) Debug.error();
            Debug.assert(this.cards.indexOf(card) >= 0);
            yield* this.cardSecondary_(card);
            this.commitOperation_();
            this.checkWon_();
        }
    }

    public canDrag(card: ICard): { canDrag: boolean; extraCards: ICard[] } {
        if (!(card instanceof Card)) Debug.error();
        Debug.assert(this.cards.indexOf(card) >= 0);
        return this.canDrag_(card);
    }

    public previewDrop(card: ICard, pile: IPile) {
        if (!(card instanceof Card)) Debug.error();
        if (!(pile instanceof Pile)) Debug.error();
        Debug.assert(this.cards.indexOf(card) >= 0);
        Debug.assert(this.piles.indexOf(pile) >= 0);
        return this.previewDrop_(card, pile);
    }

    public *dropCard(card: ICard, pile: IPile) {
        if (this.startOperation_()) {
            if (!(card instanceof Card)) Debug.error();
            if (!(pile instanceof Pile)) Debug.error();
            Debug.assert(this.cards.indexOf(card) >= 0);
            Debug.assert(this.piles.indexOf(pile) >= 0);
            yield* this.dropCard_(card, pile);
            this.commitOperation_();
            this.checkWon_();
        }
    }

    protected abstract restart_(rng: prand.RandomGenerator): Generator<DelayHint, void>;
    protected abstract cardPrimary_(card: Card): Generator<DelayHint, void>;
    protected abstract cardSecondary_(card: Card): Generator<DelayHint, void>;
    protected abstract pilePrimary_(pile: Pile): Generator<DelayHint, void>;
    protected abstract pileSecondary_(pile: Pile): Generator<DelayHint, void>;
    protected abstract canDrag_(card: Card): { canDrag: boolean; extraCards: Card[] };
    protected abstract previewDrop_(card: Card, pile: Pile): boolean;
    protected abstract dropCard_(card: Card, pile: Pile): Generator<DelayHint, void>;

    private startOperation_() {
        if (this.currentOperation_) return false;
        this.currentOperation_ = new CompoundUndoableOperation();
        return true;
    }

    public addUndoableOperation(op: IUndoableOperation) {
        if (this.currentOperation_) {
            this.currentOperation_.addOperation(op);
        }
    }

    private commitOperation_() {
        if (!this.currentOperation_) Debug.error();
        if (this.currentOperation_.length > 0) {
            this.undoStack_.push(this.currentOperation_);
            this.redoStack_ = [];
        }
        this.currentOperation_ = undefined;
    }

    public serialize() {
        const context = this.createSerializationContext_();
        context.write(SAVE_DATA_FORMAT);
        context.write(this.gamesStarted);
        context.write(this.gamesWon);
        for (const card of this.cards) {
            card.serializeState(context);
        }
        for (const pile of this.piles) {
            pile.serializeState(context);
        }
        this.serializeUndoStack_(context, this.undoStack_);
        this.serializeUndoStack_(context, this.redoStack_);
        return context.toJson();
    }

    private serializeUndoStack_(context: GameSerializationContext, stack: IUndoableOperation[]) {
        context.write(stack.length);
        for (const undo of stack) {
            context.writeUndoable(undo);
        }
    }

    public deserialize(json: string) {
        try {
            this.won = false;

            const context = this.createSerializationContext_();
            context.fromJson(json);

            if (context.read() !== SAVE_DATA_FORMAT) throw new Error("Unknown save data format.");

            this.gamesStarted = context.read();
            this.gamesWon = context.read();

            for (const card of this.cards) {
                card.deserializeState(context);
            }

            for (const pile of this.piles) {
                pile.deserializeState(context);
            }

            this.undoStack_ = this.deserializeUndoStack_(context);

            this.redoStack_ = this.deserializeUndoStack_(context);

            context.ensureAtEnd();

            this.won = this.doGetWon_();

            return true;
        } catch (error) {
            console.error("Failed to deserialize game state.", error);
            return false;
        }
    }

    private deserializeUndoStack_(context: GameSerializationContext) {
        const stack: IUndoableOperation[] = [];
        const len = context.read();
        for (let i = 0; i < len; ++i) {
            stack.push(context.readUndoable());
        }
        return stack;
    }

    private createSerializationContext_() {
        const context = new GameSerializationContext();

        for (const card of this.cards) {
            context.addCard(card);
        }

        for (const pile of this.piles) {
            context.addPile(pile);
        }

        context.addUndoableDeserializer(CompoundUndoableOperation.deserializer);
        context.addUndoableDeserializer(CardFlipOperation.deserializer);
        context.addUndoableDeserializer(PileInsertOperation.deserializer);
        context.addUndoableDeserializer(PileMaxFanOperation.deserializer);

        return context;
    }
}
