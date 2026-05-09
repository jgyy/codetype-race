export type Labels = Readonly<Record<string, string>>;

export interface Counter {
    add(value: number, labels?: Labels): void;
}

export interface Histogram {
    record(value: number, labels?: Labels): void;
}

export interface Metrics {
    counter(name: string): Counter;
    histogram(name: string): Histogram;
}

class NoopCounter implements Counter {
    add(): void { }
}
class NoopHistogram implements Histogram {
    record(): void { }
}

export class NoopMetrics implements Metrics {
    private readonly c = new NoopCounter();
    private readonly h = new NoopHistogram();
    counter(): Counter {
        return this.c;
    }
    histogram(): Histogram {
        return this.h;
    }
}
