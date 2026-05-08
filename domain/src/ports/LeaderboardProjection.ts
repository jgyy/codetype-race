export interface LeaderboardEntry {
    user_id: string;
    display_name: string;
    rating: number;
}

export interface LeaderboardProjection {
    getTop(args: {
        language?: string;
        limit: number;
    }): Promise<LeaderboardEntry[]>;
}
