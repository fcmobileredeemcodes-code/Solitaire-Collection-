export interface IPlayer {
    readonly id: string;
    readonly name: string;
    readonly isHuman: boolean;
    readonly teamId?: string;
}
