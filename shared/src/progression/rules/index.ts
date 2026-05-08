import type { AchievementRule } from "../achievements";

const rule = (r: AchievementRule): AchievementRule => r;

export const ALL_RULES: AchievementRule[] = [
    rule({
        def: {
            id: "first_race",
            title: "First Steps",
            description: "Finish your very first race.",
            category: "consistency",
            tier: "bronze",
            hidden: false,
            xp: 5,
            unlisted: true,
        },
        match: (e) => e.type === "RACE_FINISHED",
    }),
    rule({
        def: {
            id: "perfect_accuracy",
            title: "Flawless",
            description: "Finish a race with 100% accuracy.",
            category: "accuracy",
            tier: "silver",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) =>
            e.type === "RACE_FINISHED" && (e.payload as any).accuracy === 1,
    }),
    rule({
        def: {
            id: "wpm_60",
            title: "Touch Typist",
            description: "Hit 60 WPM in any race.",
            category: "speed",
            tier: "bronze",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) =>
            e.type === "RACE_FINISHED" &&
            Number((e.payload as any).wpm ?? 0) >= 60,
    }),
    rule({
        def: {
            id: "wpm_100",
            title: "Centurion",
            description: "Hit 100 WPM in any race.",
            category: "speed",
            tier: "gold",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) =>
            e.type === "RACE_FINISHED" &&
            Number((e.payload as any).wpm ?? 0) >= 100,
    }),
    rule({
        def: {
            id: "rust_perfect",
            title: "Borrow Checker",
            description: "Type a Rust snippet with 100% accuracy.",
            category: "languages",
            tier: "silver",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) =>
            e.type === "RACE_FINISHED" &&
            (e.payload as any).language === "rust" &&
            (e.payload as any).accuracy === 1,
    }),
    rule({
        def: {
            id: "lang_typescript",
            title: "Typed",
            description: "Finish a TypeScript race.",
            category: "languages",
            tier: "bronze",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) =>
            e.type === "RACE_FINISHED" &&
            (e.payload as any).language === "typescript",
    }),
    rule({
        def: {
            id: "lang_python",
            title: "Pythonic",
            description: "Finish a Python race.",
            category: "languages",
            tier: "bronze",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) =>
            e.type === "RACE_FINISHED" &&
            (e.payload as any).language === "python",
    }),
    rule({
        def: {
            id: "daily_done",
            title: "Daily Grinder",
            description: "Complete a daily challenge.",
            category: "consistency",
            tier: "bronze",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) => e.type === "DAILY_DONE",
    }),
    rule({
        def: {
            id: "tourn_round_winner",
            title: "Bracket Buster",
            description: "Win a tournament round.",
            category: "events",
            tier: "gold",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e) => e.type === "TOURN_WON",
    }),
    rule({
        def: {
            id: "night_owl",
            title: "Night Owl",
            description: "Finish a race between 00:00 and 05:00 UTC.",
            category: "meta",
            tier: "silver",
            hidden: true,
            xp: 5,
            unlisted: false,
        },
        match: (e) => {
            if (e.type !== "RACE_FINISHED") return false;
            const h = new Date(e.occurredAt).getUTCHours();
            return h >= 0 && h < 5;
        },
    }),
    rule({
        def: {
            id: "tenth_race",
            title: "Getting Started",
            description: "Finish 10 races.",
            category: "consistency",
            tier: "bronze",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.totalRaces ?? 0) >= 10,
    }),
    rule({
        def: {
            id: "century_race",
            title: "Century Club",
            description: "Finish 100 races.",
            category: "consistency",
            tier: "silver",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.totalRaces ?? 0) >= 100,
    }),
    rule({
        def: {
            id: "millennium_race",
            title: "Mileage",
            description: "Finish 1,000 races.",
            category: "consistency",
            tier: "platinum",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.totalRaces ?? 0) >= 1000,
    }),
    rule({
        def: {
            id: "polyglot_3",
            title: "Polyglot",
            description: "Race in 3 different languages.",
            category: "languages",
            tier: "silver",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.langsRaced.length ?? 0) >= 3,
    }),
    rule({
        def: {
            id: "polyglot_5",
            title: "Translator",
            description: "Race in 5 different languages.",
            category: "languages",
            tier: "gold",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.langsRaced.length ?? 0) >= 5,
    }),
    rule({
        def: {
            id: "polyglot_8",
            title: "Linguist",
            description: "Race in 8 different languages.",
            category: "languages",
            tier: "platinum",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.langsRaced.length ?? 0) >= 8,
    }),
    rule({
        def: {
            id: "ten_wins",
            title: "Competitor",
            description: "Win 10 races.",
            category: "consistency",
            tier: "silver",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.racesWon ?? 0) >= 10,
    }),
    rule({
        def: {
            id: "fifty_wins",
            title: "Champion",
            description: "Win 50 races.",
            category: "consistency",
            tier: "gold",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) =>
            e.type === "RACE_FINISHED" && (s?.racesWon ?? 0) >= 50,
    }),
    rule({
        def: {
            id: "wpm_120",
            title: "Velocity",
            description: "Hit 120 WPM in any race.",
            category: "speed",
            tier: "platinum",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) => {
            if (e.type !== "RACE_FINISHED") return false;
            const here = Number((e.payload as any).wpm ?? 0);
            const best = s?.bestWpm ?? 0;
            return Math.max(here, best) >= 120;
        },
    }),
    rule({
        def: {
            id: "all_rounder",
            title: "All-Rounder",
            description:
                "Reach 60+ WPM in 3 different languages.",
            category: "speed",
            tier: "gold",
            hidden: false,
            xp: 5,
            unlisted: false,
        },
        match: (e, s) => {
            if (e.type !== "RACE_FINISHED") return false;
            const langWpms = Object.values(s?.bestWpmByLang ?? {});
            return langWpms.filter((w) => w >= 60).length >= 3;
        },
    }),
];

export const RULES_BY_ID: Record<string, AchievementRule> =
    Object.fromEntries(ALL_RULES.map((r) => [r.def.id, r]));
