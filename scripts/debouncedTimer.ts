type TimerCallback = (...args: any) => any;

export class DebouncedTimer {
    private timeoutID: NodeJS.Timeout | null;
    private timeValue: number;
    private args: any[];

    public constructor(private callback: TimerCallback, ...args: any[]) {
        this.timeoutID = null;
        this.timeValue = 2001;
        this.args = args;
    }

    public reset() {
        this.clear();
        this.timeoutID = setTimeout(() => { this.callback.apply(null, this.args); }, this.timeValue);
    }

    public change(...args: any[]) {
        this.args = args;
    }

    public changeAndReset(...args: any[]) {
        this.args = args;
        this.reset();
    }

    public clear() {
        if(this.timeoutID !== null) {
            clearTimeout(this.timeoutID);
        }
    }
}
