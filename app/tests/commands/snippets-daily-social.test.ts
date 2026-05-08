import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import {
    AcceptFriendRequestCommand,
    AcceptFriendRequestHandler,
    BlockUserCommand,
    BlockUserHandler,
    DailySubmitCommand,
    DailySubmitHandler,
    PracticeRunCommand,
    PracticeRunHandler,
    RemoveFriendCommand,
    RemoveFriendHandler,
    ReviewSnippetCommand,
    ReviewSnippetHandler,
    SendFriendRequestCommand,
    SendFriendRequestHandler,
    SubmitSnippetCommand,
    SubmitSnippetHandler,
    type DailyRepoSink,
    type DailyRunRow,
    type FriendsSink,
    type PracticeHistorySink,
    type SnippetReviewSink,
    type SnippetSubmissionSink,
    type UserDirectory,
} from "../../src";
import { FakeClock, FakeRandom, InMemorySnippetRepo } from "../fakes";

class FakeSubmissionSink implements SnippetSubmissionSink {
    counts = new Map<string, number>();
    pending: Array<{ id: string; userId: string }> = [];
    async incrementDailySubmitCounter(userId: string, date: string, _limit: number) {
        const key = `${userId}|${date}`;
        const next = (this.counts.get(key) ?? 0) + 1;
        this.counts.set(key, next);
        return next;
    }
    async submitPending(snippetId: string, userId: string) {
        this.pending.push({ id: snippetId, userId });
    }
}

describe("SubmitSnippetCommand", () => {
    test("increments counter and submits with random uuid", async () => {
        const sink = new FakeSubmissionSink();
        const random = new FakeRandom().queueUuid("aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa");
        const handler = new SubmitSnippetHandler(sink, random);
        const out = await handler.execute(
            new SubmitSnippetCommand({
                userId: "u1",
                dateUtc: "2026-05-08",
                submission: { language: "ts", title: "t", text: "hi", difficulty: 2 },
            }),
        );
        expect(out.status).toBe("pending");
        expect(out.snippet_id).toBe("aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa");
        expect(sink.counts.get("u1|2026-05-08")).toBe(1);
        expect(sink.pending).toHaveLength(1);
    });
});

class FakeReviewSink implements SnippetReviewSink {
    calls: Array<{ id: string; decision: string; reason?: string }> = [];
    async approveOrReject(id: string, _by: string, decision: "approved" | "rejected", reason?: string) {
        this.calls.push({ id, decision, reason });
    }
}

describe("ReviewSnippetCommand", () => {
    test("approves with reason", async () => {
        const sink = new FakeReviewSink();
        const out = await new ReviewSnippetHandler(sink).execute(
            new ReviewSnippetCommand({
                snippetId: "s1",
                reviewerId: "admin",
                decision: "approved",
                reason: "lgtm",
            }),
        );
        expect(out).toEqual({ snippet_id: "s1", status: "approved" });
        expect(sink.calls).toEqual([{ id: "s1", decision: "approved", reason: "lgtm" }]);
    });

    test("rejects with reason", async () => {
        const sink = new FakeReviewSink();
        const out = await new ReviewSnippetHandler(sink).execute(
            new ReviewSnippetCommand({
                snippetId: "s1",
                reviewerId: "admin",
                decision: "rejected",
                reason: "bad",
            }),
        );
        expect(out.status).toBe("rejected");
    });
});

class FakeDaily implements DailyRepoSink {
    runs: DailyRunRow[] = [];
    setRuns(...users: string[]) {
        this.runs = users.map((u) => ({ user_id: u }));
        return this;
    }
    async submitBest(_date: string, _userId: string, _name: string, wpm: number) {
        return { improved: true, bestWpm: wpm };
    }
    async listRuns(_date: string, _limit: number): Promise<DailyRunRow[]> {
        return this.runs;
    }
}

class FakeUsers implements UserDirectory {
    async getOrCreate(userId: string, displayName: string) {
        return { display_name: displayName || userId };
    }
}

describe("DailySubmitCommand", () => {
    function setup() {
        const snippets = new InMemorySnippetRepo().addMeta({
            snippet_id: "s1",
            language: "ts",
            length: 100,
        });
        const daily = new FakeDaily();
        const handler = new DailySubmitHandler(snippets, new FakeUsers(), daily);
        return { snippets, daily, handler };
    }

    test("rejects incomplete", async () => {
        const { handler } = setup();
        await expect(
            handler.execute(
                new DailySubmitCommand({
                    userId: "u1",
                    snippetId: "s1",
                    date: "2026-05-08",
                    chars_typed: 10,
                    errors: 0,
                    duration_ms: 5000,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("flagged race throws Forbidden", async () => {
        const { handler } = setup();
        await expect(
            handler.execute(
                new DailySubmitCommand({
                    userId: "u1",
                    snippetId: "s1",
                    date: "2026-05-08",
                    chars_typed: 100,
                    errors: 0,
                    duration_ms: 100, // absurdly fast → triggers anti-cheat
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("happy path returns rank", async () => {
        const { handler, daily } = setup();
        daily.setRuns("other", "u1", "third");
        const out = await handler.execute(
            new DailySubmitCommand({
                userId: "u1",
                snippetId: "s1",
                date: "2026-05-08",
                chars_typed: 100,
                errors: 0,
                duration_ms: 30_000,
            }),
        );
        expect(out.improved).toBe(true);
        expect(out.rank).toBe(2);
    });
});

class FakePracticeHistory implements PracticeHistorySink {
    appended: unknown[] = [];
    async appendPractice(row: unknown) {
        this.appended.push(row);
    }
}

describe("PracticeRunCommand", () => {
    function setup() {
        const snippets = new InMemorySnippetRepo().addMeta({
            snippet_id: "s1",
            language: "ts",
            length: 100,
        });
        const history = new FakePracticeHistory();
        const handler = new PracticeRunHandler(
            snippets,
            history,
            new FakeClock(2_000_000_000_000),
        );
        return { snippets, history, handler };
    }

    test("save without userId rejects", async () => {
        const { handler } = setup();
        await expect(
            handler.execute(
                new PracticeRunCommand({
                    snippetId: "s1",
                    chars_typed: 100,
                    errors: 0,
                    duration_ms: 30_000,
                    save: true,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("save=false skips history", async () => {
        const { handler, history } = setup();
        const out = await handler.execute(
            new PracticeRunCommand({
                snippetId: "s1",
                chars_typed: 100,
                errors: 0,
                duration_ms: 30_000,
                save: false,
            }),
        );
        expect(out.saved).toBe(false);
        expect(history.appended).toHaveLength(0);
    });

    test("save=true persists row", async () => {
        const { handler, history } = setup();
        const out = await handler.execute(
            new PracticeRunCommand({
                userId: "u1",
                snippetId: "s1",
                chars_typed: 100,
                errors: 0,
                duration_ms: 30_000,
                save: true,
            }),
        );
        expect(out.saved).toBe(true);
        expect(history.appended).toHaveLength(1);
    });
});

class FakeFriends implements FriendsSink {
    log: Array<{ op: string; a: string; b: string }> = [];
    async sendRequest(a: string, b: string) {
        this.log.push({ op: "request", a, b });
    }
    async accept(a: string, b: string) {
        this.log.push({ op: "accept", a, b });
    }
    async block(a: string, b: string) {
        this.log.push({ op: "block", a, b });
    }
    async remove(a: string, b: string) {
        this.log.push({ op: "remove", a, b });
    }
}

describe("Friends commands", () => {
    test("each command routes to the matching sink method with correct status", async () => {
        const sink = new FakeFriends();
        expect(
            (
                await new SendFriendRequestHandler(sink).execute(
                    new SendFriendRequestCommand({ actorId: "u1", targetId: "u2" }),
                )
            ).status,
        ).toBe("pending");
        expect(
            (
                await new AcceptFriendRequestHandler(sink).execute(
                    new AcceptFriendRequestCommand({ actorId: "u1", targetId: "u2" }),
                )
            ).status,
        ).toBe("accepted");
        expect(
            (
                await new BlockUserHandler(sink).execute(
                    new BlockUserCommand({ actorId: "u1", targetId: "u2" }),
                )
            ).status,
        ).toBe("blocked");
        expect(
            (
                await new RemoveFriendHandler(sink).execute(
                    new RemoveFriendCommand({ actorId: "u1", targetId: "u2" }),
                )
            ).status,
        ).toBe("removed");
        expect(sink.log.map((l) => l.op)).toEqual([
            "request",
            "accept",
            "block",
            "remove",
        ]);
    });
});
