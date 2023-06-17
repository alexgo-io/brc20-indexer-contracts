import { assertEquals, delay, Vector } from "./deps.ts";
// deno-lint-ignore no-explicit-any
const suites = new Vector();
const suiteNames = new Set();
const testNames = new Set();
let initialized = false;
let started = false;
async function getMetrics() {
    // Defer until next event loop turn - that way timeouts and intervals
    // cleared can actually be removed from resource table, otherwise
    // false positives may occur (https://github.com/denoland/deno/issues/4591)
    await delay(0);
    return Deno.metrics();
}
async function assertOps(testType, beforeMetrics) {
    const afterMetrics = await getMetrics();
    const dispatchedDiff = afterMetrics.opsDispatchedAsync - beforeMetrics.opsDispatchedAsync;
    const completedDiff = afterMetrics.opsCompletedAsync - beforeMetrics.opsCompletedAsync;
    assertEquals(dispatchedDiff, completedDiff, `Test ${testType} is leaking async ops.
Before:
- dispatched: ${beforeMetrics.opsDispatchedAsync}
- completed: ${beforeMetrics.opsCompletedAsync}
After:
- dispatched: ${afterMetrics.opsDispatchedAsync}
- completed: ${afterMetrics.opsCompletedAsync}
Make sure to await all promises returned from Deno APIs before
finishing test ${testType}.`);
}
function assertResources(testType, beforeResources) {
    const afterResources = Deno.resources();
    const preStr = JSON.stringify(beforeResources, null, 2);
    const postStr = JSON.stringify(afterResources, null, 2);
    assertEquals(preStr, postStr, `Test ${testType} is leaking resources.
Before: ${preStr}
After: ${postStr}
Make sure to close all open resource handles returned from Deno APIs before
finishing test ${testType}.`);
}
/**
 * A group of tests. A test suite can include child test suites.
 * The name of the test suite is prepended to the name of each test within it.
 * Tests belonging to a suite will inherit options from it.
 */ export class TestSuite {
    /** The function used to register tests. Defaults to using `Deno.test`. */ static registerTest(options) {
        Deno.test({
            ...options,
            // Sanitize ops and resources is handled by the TestSuite.
            sanitizeOps: false,
            sanitizeResources: false
        });
    }
    /**
   * Initializes global test suite. This should not be used in your tests.
   * This is used internally and for testing the test suite module.
   */ static init() {
        if (initialized) throw new Error("global test suite already initialized");
        initialized = true;
        globalSuite = new TestSuite({
            name: "",
            beforeAll () {
                // deno-lint-ignore no-explicit-any
                const lastSuite = suites.peekRight();
                for (const suite of suites.drainRight()){
                    suite.last = lastSuite.last;
                    suite.locked = true;
                }
                started = true;
            }
        });
        suites.push(globalSuite);
    }
    /**
   * Resets global test suite. This should not be used in your tests.
   * This is used for testing the test suite module.
   */ static reset() {
        suiteNames.clear();
        testNames.clear();
        suites.length = 0;
        globalSuite = null;
        initialized = false;
        started = false;
        TestSuite.init();
    }
    /** The name of the test suite will be prepended to the names of tests in the suite. */ name;
    /** The context for tests within the suite. */ context;
    /**
   * The parent test suite that the test suite belongs to.
   * Any option that is not specified will be inherited from the parent test suite.
   */ suite;
    /** Ignore all tests in suite if set to true. */ ignore;
    /**
   * If at least one test suite or test has only set to true,
   * only run test suites and tests that have only set to true.
   */ only;
    /**
   * Check that the number of async completed ops after the suite and each test in the suite
   * is the same as the number of dispatched ops. Defaults to true.
   */ sanitizeOps;
    /**
   * Ensure the suite and test cases in the suite do not "leak" resources - ie. the resource table
   * after each test has exactly the same contents as before each test. Defaults to true.
   */ sanitizeResources;
    /**
   * Ensure the test case does not prematurely cause the process to exit, for example, via a call to `deno.exit`. Defaults to true.
   */ sanitizeExit;
    /** Full name of the last test in the suite. */ last;
    started;
    locked;
    beforeAllMetrics;
    beforeAllResources;
    /** Run some shared setup before all of the tests in the suite. */ beforeAll;
    /** Run some shared teardown after all of the tests in the suite. */ afterAll;
    /** Run some shared setup before each test in the suite. */ beforeEach;
    /** Run some shared teardown after each test in the suite. */ afterEach;
    hooks;
    constructor(options){
        this.options = options;
        if (typeof options.name !== "string") {
            throw new TypeError("name must be a string");
        } else if (options.name.length === 0) {
            if (globalSuite) throw new TypeError("name cannot be empty");
        } else if (options.name[0] === " " || options.name[options.name.length - 1] === " ") {
            throw new TypeError("name cannot start or end with a space");
        }
        if (globalSuite) {
            this.suite = options.suite ?? globalSuite;
        }
        if (this.suite && this.suite.locked) {
            throw new Error("cannot add child test suite after starting another test suite");
        }
        this.name = (this.suite && this.suite.name ? `${this.suite.name} ` : "") + options.name;
        if (suiteNames.has(this.name)) throw new Error("suite name already used");
        suiteNames.add(this.name);
        if (!suites.isEmpty()) {
            // deno-lint-ignore no-explicit-any
            const lastSuite = suites.peekRight();
            while(this.suite !== suites.peekRight() && !suites.isEmpty()){
                // deno-lint-ignore no-explicit-any
                const completedSuite = suites.pop();
                completedSuite.last = lastSuite.last;
                completedSuite.locked = true;
            }
        }
        suites.push(this);
        this.ignore = options.ignore ?? this.suite?.ignore;
        this.only = options.only ?? this.suite?.only;
        this.sanitizeOps = options.sanitizeOps ?? this.suite?.sanitizeOps;
        this.sanitizeResources = options.sanitizeResources ?? this.suite?.sanitizeResources;
        this.sanitizeExit = options.sanitizeExit ?? this.suite?.sanitizeExit;
        this.hooks = {};
        TestSuite.setHooks(this, options);
        this.beforeAll = async ()=>{
            try {
                if (this.suite && !this.suite.started) {
                    await this.suite.beforeAll();
                    this.context = {
                        ...this.suite.context,
                        ...this.context
                    };
                }
            } finally{
                this.started = true;
                if (this.sanitizeOps ?? true) {
                    this.beforeAllMetrics = await getMetrics();
                }
                if (this.sanitizeResources ?? true) {
                    this.beforeAllResources = Deno.resources();
                }
            }
            if (this.hooks.beforeAll) await this.hooks.beforeAll(this.context);
        };
        this.afterAll = async ()=>{
            try {
                if (this.hooks.afterAll) await this.hooks.afterAll(this.context);
                if (this.sanitizeOps ?? true) {
                    await assertOps("suite", this.beforeAllMetrics);
                }
                if (this.sanitizeResources ?? true) {
                    assertResources("suite", this.beforeAllResources);
                }
            } finally{
                if (this.suite && this.suite.last === this.last) {
                    await this.suite.afterAll();
                }
            }
        };
        this.beforeEach = async (context)=>{
            if (this.suite) await this.suite.beforeEach(context);
            if (this.hooks.beforeEach) await this.hooks.beforeEach(context);
        };
        this.afterEach = async (context)=>{
            if (this.hooks.afterEach) await this.hooks.afterEach(context);
            if (this.suite) await this.suite.afterEach(context);
        };
        this.context = options.context ?? {};
        this.started = false;
        this.locked = false;
    }
    static test(a, b, c) {
        if (started) throw new Error("cannot add test after test runner started");
        const options = !(a instanceof TestSuite) && typeof a !== "string" ? a : typeof a === "string" ? {
            name: a,
            fn: b
        } : {
            suite: a,
            name: b,
            fn: c
        };
        const suite = options.suite ?? globalSuite;
        if (suite.locked) {
            throw new Error("cannot add test after starting another test suite");
        }
        let name = options.name;
        if (typeof name !== "string") {
            throw new TypeError("name must be a string");
        } else if (name.length === 0) {
            throw new TypeError("name cannot be empty");
        } else if (name[0] === " " || name[name.length - 1] === " ") {
            throw new TypeError("name cannot start or end with a space");
        }
        const fn = options.fn;
        if (!fn) throw new TypeError("fn argument or option missing");
        name = (suite.name ? `${suite.name} ` : "") + name;
        if (testNames.has(name)) throw new Error("test name already used");
        testNames.add(name);
        if (!suites.isEmpty()) {
            // deno-lint-ignore no-explicit-any
            const lastSuite = suites.peekRight();
            while(suite !== suites.peekRight() && !suites.isEmpty()){
                // deno-lint-ignore no-explicit-any
                const completedSuite = suites.pop();
                completedSuite.last = lastSuite.last;
                completedSuite.locked = true;
            }
        }
        const sanitizeOps = (options.sanitizeOps ?? suite.sanitizeOps) ?? true;
        const sanitizeResources = (options.sanitizeResources ?? suite.sanitizeResources) ?? true;
        suite.last = name;
        const test = {
            name,
            fn: async ()=>{
                if (!suite.started) await suite.beforeAll();
                const context = {
                    ...suite.context
                };
                let beforeMetrics = null;
                let beforeResources = null;
                let firstError = null;
                try {
                    if (sanitizeOps) beforeMetrics = await getMetrics();
                    if (sanitizeResources) beforeResources = Deno.resources();
                    await suite.beforeEach(context);
                    await fn(context);
                } catch (error) {
                    firstError = error;
                }
                try {
                    await suite.afterEach(context);
                    if (sanitizeOps) await assertOps("case", beforeMetrics);
                    if (sanitizeResources) assertResources("case", beforeResources);
                } catch (error1) {
                    if (!firstError) firstError = error1;
                }
                try {
                    if (suite.last === name) await suite.afterAll();
                } catch (error2) {
                    if (!firstError) firstError = error2;
                }
                if (firstError) throw firstError;
            }
        };
        if (typeof options.ignore !== "undefined") test.ignore = options.ignore;
        else if (typeof suite.ignore !== "undefined") test.ignore = suite.ignore;
        if (typeof options.only !== "undefined") test.only = options.only;
        else if (typeof suite.only !== "undefined") test.only = suite.only;
        if (typeof options.sanitizeOps !== "undefined") {
            test.sanitizeOps = options.sanitizeOps;
        } else if (typeof suite.sanitizeOps !== "undefined") {
            test.sanitizeOps = suite.sanitizeOps;
        }
        if (typeof options.sanitizeResources !== "undefined") {
            test.sanitizeResources = options.sanitizeResources;
        } else if (typeof suite.sanitizeResources !== "undefined") {
            test.sanitizeResources = suite.sanitizeResources;
        }
        if (typeof options.sanitizeExit !== "undefined") {
            test.sanitizeExit = options.sanitizeExit;
        } else if (typeof suite.sanitizeExit !== "undefined") {
            test.sanitizeExit = suite.sanitizeExit;
        }
        // tests should go onto a queue that drains
        // once another test suite or test is created outside of suite
        // need first and last test to have async ops disabled
        // might be easier to disable for all of them and do all sanitizing in here
        TestSuite.registerTest(test);
    }
    static setHooks(suite, hooks) {
        if (started) throw new Error("cannot set hooks after test runner started");
        if (hooks.beforeAll) suite.hooks.beforeAll = hooks.beforeAll;
        if (hooks.afterAll) suite.hooks.afterAll = hooks.afterAll;
        if (hooks.beforeEach) suite.hooks.beforeEach = hooks.beforeEach;
        if (hooks.afterEach) suite.hooks.afterEach = hooks.afterEach;
    }
    options;
}
/**
 * Register a test which will run when `deno test` is used on the command line
 * and the containing module looks like a test module.
 */ export const test = TestSuite.test;
// deno-lint-ignore no-explicit-any
let globalSuite = null;
TestSuite.init();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvdGVzdF9zdWl0ZUAwLjkuNS90ZXN0X3N1aXRlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGFzc2VydEVxdWFscywgZGVsYXksIFZlY3RvciB9IGZyb20gXCIuL2RlcHMudHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUZXN0RGVmaW5pdGlvbjxUPiB7XG4gIC8qKiBUaGUgbmFtZSBvZiB0aGUgdGVzdC4gKi9cbiAgbmFtZTogc3RyaW5nO1xuICAvKiogVGhlIHRlc3QgZnVuY3Rpb24uICovXG4gIGZuOlxuICAgIHwgKCgpID0+IHZvaWQpXG4gICAgfCAoKCkgPT4gUHJvbWlzZTx2b2lkPilcbiAgICB8ICgoY29udGV4dDogVCkgPT4gdm9pZClcbiAgICB8ICgoY29udGV4dDogVCkgPT4gUHJvbWlzZTx2b2lkPik7XG4gIC8qKlxuICAgKiBUaGUgdGVzdCBzdWl0ZSB0aGF0IHRoZSB0ZXN0IGJlbG9uZ3MgdG8uXG4gICAqIEFueSBvcHRpb24gdGhhdCBpcyBub3Qgc3BlY2lmaWVkIHdpbGwgYmUgaW5oZXJpdGVkIGZyb20gdGhlIHRlc3Qgc3VpdGUuXG4gICAqL1xuICBzdWl0ZT86IFRlc3RTdWl0ZTxUPiB8IFRlc3RTdWl0ZTxQYXJ0aWFsPFQ+PiB8IFRlc3RTdWl0ZTx2b2lkPjtcbiAgLyoqIElnbm9yZSB0ZXN0IGlmIHNldCB0byB0cnVlLiAqL1xuICBpZ25vcmU/OiBib29sZWFuO1xuICAvKipcbiAgICogSWYgYXQgbGVhc3Qgb25lIHRlc3Qgc3VpdGUgb3IgdGVzdCBoYXMgb25seSBzZXQgdG8gdHJ1ZSxcbiAgICogb25seSBydW4gdGVzdCBzdWl0ZXMgYW5kIHRlc3RzIHRoYXQgaGF2ZSBvbmx5IHNldCB0byB0cnVlLlxuICAgKi9cbiAgb25seT86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBDaGVjayB0aGF0IHRoZSBudW1iZXIgb2YgYXN5bmMgY29tcGxldGVkIG9wcyBhZnRlciB0aGUgdGVzdCBpcyB0aGUgc2FtZSBhc1xuICAgKiB0aGUgbnVtYmVyIG9mIGRpc3BhdGNoZWQgb3BzIGFmdGVyIHRoZSB0ZXN0LiBEZWZhdWx0cyB0byB0cnVlLlxuICAgKi9cbiAgc2FuaXRpemVPcHM/OiBib29sZWFuO1xuICAvKipcbiAgICogRW5zdXJlIHRoZSB0ZXN0IGNhc2UgZG9lcyBub3QgXCJsZWFrXCIgcmVzb3VyY2VzIC0gaWUuIHRoZSByZXNvdXJjZSB0YWJsZSBhZnRlciB0aGUgdGVzdFxuICAgKiBoYXMgZXhlY3RseSB0aGUgc2FtZSBjb250ZW50cyBhcyBiZWZvcmUgdGhlIHRlc3QuIERlZmF1bHRzIHRvIHRydWUuXG4gICAqL1xuICBzYW5pdGl6ZVJlc291cmNlcz86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBFbnN1cmUgdGhlIHRlc3QgY2FzZSBkb2VzIG5vdCBwcmVtYXR1cmVseSBjYXVzZSB0aGUgcHJvY2VzcyB0byBleGl0LCBmb3IgZXhhbXBsZSwgdmlhIGEgY2FsbCB0byBgZGVuby5leGl0YC4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICovXG4gIHNhbml0aXplRXhpdD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVzdFN1aXRlRGVmaW5pdGlvbjxUPiB7XG4gIC8qKiBUaGUgbmFtZSBvZiB0aGUgdGVzdCBzdWl0ZSB3aWxsIGJlIHByZXBlbmRlZCB0byB0aGUgbmFtZXMgb2YgdGVzdHMgaW4gdGhlIHN1aXRlLiAqL1xuICBuYW1lOiBzdHJpbmc7XG4gIC8qKiBUaGUgaW5pdGlhbCBjb250ZXh0IGZvciB0aGUgdGVzdCBzdWl0ZS4gKi9cbiAgY29udGV4dD86IFBhcnRpYWw8VD47XG4gIC8qKlxuICAgKiBUaGUgcGFyZW50IHRlc3Qgc3VpdGUgdGhhdCB0aGUgdGVzdCBzdWl0ZSBiZWxvbmdzIHRvLlxuICAgKiBBbnkgb3B0aW9uIHRoYXQgaXMgbm90IHNwZWNpZmllZCB3aWxsIGJlIGluaGVyaXRlZCBmcm9tIHRoZSBwYXJlbnQgdGVzdCBzdWl0ZS5cbiAgICovXG4gIHN1aXRlPzogVGVzdFN1aXRlPFQ+IHwgVGVzdFN1aXRlPFBhcnRpYWw8VD4+IHwgVGVzdFN1aXRlPHZvaWQ+O1xuICAvKiogSWdub3JlIGFsbCB0ZXN0cyBpbiBzdWl0ZSBpZiBzZXQgdG8gdHJ1ZS4gKi9cbiAgaWdub3JlPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIElmIGF0IGxlYXN0IG9uZSB0ZXN0IHN1aXRlIG9yIHRlc3QgaGFzIG9ubHkgc2V0IHRvIHRydWUsXG4gICAqIG9ubHkgcnVuIHRlc3Qgc3VpdGVzIGFuZCB0ZXN0cyB0aGF0IGhhdmUgb25seSBzZXQgdG8gdHJ1ZS5cbiAgICovXG4gIG9ubHk/OiBib29sZWFuO1xuICAvKipcbiAgICogQ2hlY2sgdGhhdCB0aGUgbnVtYmVyIG9mIGFzeW5jIGNvbXBsZXRlZCBvcHMgYWZ0ZXIgZWFjaCB0ZXN0IGluIHRoZSBzdWl0ZVxuICAgKiBpcyB0aGUgc2FtZSBhcyB0aGUgbnVtYmVyIG9mIGRpc3BhdGNoZWQgb3BzLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgKi9cbiAgc2FuaXRpemVPcHM/OiBib29sZWFuO1xuICAvKipcbiAgICogRW5zdXJlIHRoZSB0ZXN0IGNhc2VzIGluIHRoZSBzdWl0ZSBkbyBub3QgXCJsZWFrXCIgcmVzb3VyY2VzIC0gaWUuIHRoZSByZXNvdXJjZSB0YWJsZVxuICAgKiBhZnRlciBlYWNoIHRlc3QgaGFzIGV4YWN0bHkgdGhlIHNhbWUgY29udGVudHMgYXMgYmVmb3JlIGVhY2ggdGVzdC4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICovXG4gIHNhbml0aXplUmVzb3VyY2VzPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIEVuc3VyZSB0aGUgdGVzdCBjYXNlIGRvZXMgbm90IHByZW1hdHVyZWx5IGNhdXNlIHRoZSBwcm9jZXNzIHRvIGV4aXQsIGZvciBleGFtcGxlLCB2aWEgYSBjYWxsIHRvIGBkZW5vLmV4aXRgLiBEZWZhdWx0cyB0byB0cnVlLlxuICAgKi9cbiAgc2FuaXRpemVFeGl0PzogYm9vbGVhbjtcbiAgLyoqIFJ1biBzb21lIHNoYXJlZCBzZXR1cCBiZWZvcmUgZWFjaCB0ZXN0IGluIHRoZSBzdWl0ZS4gKi9cbiAgYmVmb3JlRWFjaD86XG4gICAgfCAoKCkgPT4gdm9pZClcbiAgICB8ICgoKSA9PiBQcm9taXNlPHZvaWQ+KVxuICAgIHwgKChjb250ZXh0OiBUKSA9PiB2b2lkKVxuICAgIHwgKChjb250ZXh0OiBUKSA9PiBQcm9taXNlPHZvaWQ+KTtcbiAgLyoqIFJ1biBzb21lIHNoYXJlZCB0ZWFyZG93biBhZnRlciBlYWNoIHRlc3QgaW4gdGhlIHN1aXRlLiAqL1xuICBhZnRlckVhY2g/OlxuICAgIHwgKCgpID0+IHZvaWQpXG4gICAgfCAoKCkgPT4gUHJvbWlzZTx2b2lkPilcbiAgICB8ICgoY29udGV4dDogVCkgPT4gdm9pZClcbiAgICB8ICgoY29udGV4dDogVCkgPT4gUHJvbWlzZTx2b2lkPik7XG4gIC8qKiBSdW4gc29tZSBzaGFyZWQgc2V0dXAgYmVmb3JlIGFsbCBvZiB0aGUgdGVzdHMgaW4gdGhlIHN1aXRlLiAqL1xuICBiZWZvcmVBbGw/OlxuICAgIHwgKCgpID0+IHZvaWQpXG4gICAgfCAoKCkgPT4gUHJvbWlzZTx2b2lkPilcbiAgICB8ICgoY29udGV4dDogVCkgPT4gdm9pZClcbiAgICB8ICgoY29udGV4dDogVCkgPT4gUHJvbWlzZTx2b2lkPik7XG4gIC8qKiBSdW4gc29tZSBzaGFyZWQgdGVhcmRvd24gYWZ0ZXIgYWxsIG9mIHRoZSB0ZXN0cyBpbiB0aGUgc3VpdGUuICovXG4gIGFmdGVyQWxsPzpcbiAgICB8ICgoKSA9PiB2b2lkKVxuICAgIHwgKCgpID0+IFByb21pc2U8dm9pZD4pXG4gICAgfCAoKGNvbnRleHQ6IFQpID0+IHZvaWQpXG4gICAgfCAoKGNvbnRleHQ6IFQpID0+IFByb21pc2U8dm9pZD4pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1aXRlSG9va3M8VD4ge1xuICAvKiogUnVuIHNvbWUgc2hhcmVkIHNldHVwIGJlZm9yZSBlYWNoIHRlc3QgaW4gdGhlIHN1aXRlLiAqL1xuICBiZWZvcmVFYWNoPzpcbiAgICB8ICgoKSA9PiB2b2lkKVxuICAgIHwgKCgpID0+IFByb21pc2U8dm9pZD4pXG4gICAgfCAoKGNvbnRleHQ6IFQpID0+IHZvaWQpXG4gICAgfCAoKGNvbnRleHQ6IFQpID0+IFByb21pc2U8dm9pZD4pO1xuICAvKiogUnVuIHNvbWUgc2hhcmVkIHRlYXJkb3duIGFmdGVyIGVhY2ggdGVzdCBpbiB0aGUgc3VpdGUuICovXG4gIGFmdGVyRWFjaD86XG4gICAgfCAoKCkgPT4gdm9pZClcbiAgICB8ICgoKSA9PiBQcm9taXNlPHZvaWQ+KVxuICAgIHwgKChjb250ZXh0OiBUKSA9PiB2b2lkKVxuICAgIHwgKChjb250ZXh0OiBUKSA9PiBQcm9taXNlPHZvaWQ+KTtcbiAgLyoqIFJ1biBzb21lIHNoYXJlZCBzZXR1cCBiZWZvcmUgYWxsIG9mIHRoZSB0ZXN0cyBpbiB0aGUgc3VpdGUuICovXG4gIGJlZm9yZUFsbD86XG4gICAgfCAoKCkgPT4gdm9pZClcbiAgICB8ICgoKSA9PiBQcm9taXNlPHZvaWQ+KVxuICAgIHwgKChjb250ZXh0OiBUKSA9PiB2b2lkKVxuICAgIHwgKChjb250ZXh0OiBUKSA9PiBQcm9taXNlPHZvaWQ+KTtcbiAgLyoqIFJ1biBzb21lIHNoYXJlZCB0ZWFyZG93biBhZnRlciBhbGwgb2YgdGhlIHRlc3RzIGluIHRoZSBzdWl0ZS4gKi9cbiAgYWZ0ZXJBbGw/OlxuICAgIHwgKCgpID0+IHZvaWQpXG4gICAgfCAoKCkgPT4gUHJvbWlzZTx2b2lkPilcbiAgICB8ICgoY29udGV4dDogVCkgPT4gdm9pZClcbiAgICB8ICgoY29udGV4dDogVCkgPT4gUHJvbWlzZTx2b2lkPik7XG59XG5cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5jb25zdCBzdWl0ZXM6IFZlY3RvcjxUZXN0U3VpdGU8YW55Pj4gPSBuZXcgVmVjdG9yKCk7XG5jb25zdCBzdWl0ZU5hbWVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcbmNvbnN0IHRlc3ROYW1lczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cbmxldCBpbml0aWFsaXplZCA9IGZhbHNlO1xubGV0IHN0YXJ0ZWQgPSBmYWxzZTtcblxudHlwZSBUZXN0VHlwZSA9IFwic3VpdGVcIiB8IFwiY2FzZVwiO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRNZXRyaWNzKCk6IFByb21pc2U8RGVuby5NZXRyaWNzPiB7XG4gIC8vIERlZmVyIHVudGlsIG5leHQgZXZlbnQgbG9vcCB0dXJuIC0gdGhhdCB3YXkgdGltZW91dHMgYW5kIGludGVydmFsc1xuICAvLyBjbGVhcmVkIGNhbiBhY3R1YWxseSBiZSByZW1vdmVkIGZyb20gcmVzb3VyY2UgdGFibGUsIG90aGVyd2lzZVxuICAvLyBmYWxzZSBwb3NpdGl2ZXMgbWF5IG9jY3VyIChodHRwczovL2dpdGh1Yi5jb20vZGVub2xhbmQvZGVuby9pc3N1ZXMvNDU5MSlcbiAgYXdhaXQgZGVsYXkoMCk7XG4gIHJldHVybiBEZW5vLm1ldHJpY3MoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYXNzZXJ0T3BzKHRlc3RUeXBlOiBUZXN0VHlwZSwgYmVmb3JlTWV0cmljczogRGVuby5NZXRyaWNzKSB7XG4gIGNvbnN0IGFmdGVyTWV0cmljczogRGVuby5NZXRyaWNzID0gYXdhaXQgZ2V0TWV0cmljcygpO1xuICBjb25zdCBkaXNwYXRjaGVkRGlmZjogbnVtYmVyID0gYWZ0ZXJNZXRyaWNzLm9wc0Rpc3BhdGNoZWRBc3luYyAtXG4gICAgYmVmb3JlTWV0cmljcy5vcHNEaXNwYXRjaGVkQXN5bmM7XG4gIGNvbnN0IGNvbXBsZXRlZERpZmY6IG51bWJlciA9IGFmdGVyTWV0cmljcy5vcHNDb21wbGV0ZWRBc3luYyAtXG4gICAgYmVmb3JlTWV0cmljcy5vcHNDb21wbGV0ZWRBc3luYztcblxuICBhc3NlcnRFcXVhbHMoXG4gICAgZGlzcGF0Y2hlZERpZmYsXG4gICAgY29tcGxldGVkRGlmZixcbiAgICBgVGVzdCAke3Rlc3RUeXBlfSBpcyBsZWFraW5nIGFzeW5jIG9wcy5cbkJlZm9yZTpcbi0gZGlzcGF0Y2hlZDogJHtiZWZvcmVNZXRyaWNzLm9wc0Rpc3BhdGNoZWRBc3luY31cbi0gY29tcGxldGVkOiAke2JlZm9yZU1ldHJpY3Mub3BzQ29tcGxldGVkQXN5bmN9XG5BZnRlcjpcbi0gZGlzcGF0Y2hlZDogJHthZnRlck1ldHJpY3Mub3BzRGlzcGF0Y2hlZEFzeW5jfVxuLSBjb21wbGV0ZWQ6ICR7YWZ0ZXJNZXRyaWNzLm9wc0NvbXBsZXRlZEFzeW5jfVxuTWFrZSBzdXJlIHRvIGF3YWl0IGFsbCBwcm9taXNlcyByZXR1cm5lZCBmcm9tIERlbm8gQVBJcyBiZWZvcmVcbmZpbmlzaGluZyB0ZXN0ICR7dGVzdFR5cGV9LmAsXG4gICk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFJlc291cmNlcyhcbiAgdGVzdFR5cGU6IFRlc3RUeXBlLFxuICBiZWZvcmVSZXNvdXJjZXM6IERlbm8uUmVzb3VyY2VNYXAsXG4pIHtcbiAgY29uc3QgYWZ0ZXJSZXNvdXJjZXM6IERlbm8uUmVzb3VyY2VNYXAgPSBEZW5vLnJlc291cmNlcygpO1xuICBjb25zdCBwcmVTdHIgPSBKU09OLnN0cmluZ2lmeShiZWZvcmVSZXNvdXJjZXMsIG51bGwsIDIpO1xuICBjb25zdCBwb3N0U3RyID0gSlNPTi5zdHJpbmdpZnkoYWZ0ZXJSZXNvdXJjZXMsIG51bGwsIDIpO1xuICBhc3NlcnRFcXVhbHMoXG4gICAgcHJlU3RyLFxuICAgIHBvc3RTdHIsXG4gICAgYFRlc3QgJHt0ZXN0VHlwZX0gaXMgbGVha2luZyByZXNvdXJjZXMuXG5CZWZvcmU6ICR7cHJlU3RyfVxuQWZ0ZXI6ICR7cG9zdFN0cn1cbk1ha2Ugc3VyZSB0byBjbG9zZSBhbGwgb3BlbiByZXNvdXJjZSBoYW5kbGVzIHJldHVybmVkIGZyb20gRGVubyBBUElzIGJlZm9yZVxuZmluaXNoaW5nIHRlc3QgJHt0ZXN0VHlwZX0uYCxcbiAgKTtcbn1cblxuLyoqXG4gKiBBIGdyb3VwIG9mIHRlc3RzLiBBIHRlc3Qgc3VpdGUgY2FuIGluY2x1ZGUgY2hpbGQgdGVzdCBzdWl0ZXMuXG4gKiBUaGUgbmFtZSBvZiB0aGUgdGVzdCBzdWl0ZSBpcyBwcmVwZW5kZWQgdG8gdGhlIG5hbWUgb2YgZWFjaCB0ZXN0IHdpdGhpbiBpdC5cbiAqIFRlc3RzIGJlbG9uZ2luZyB0byBhIHN1aXRlIHdpbGwgaW5oZXJpdCBvcHRpb25zIGZyb20gaXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0U3VpdGU8VD4ge1xuICAvKiogVGhlIGZ1bmN0aW9uIHVzZWQgdG8gcmVnaXN0ZXIgdGVzdHMuIERlZmF1bHRzIHRvIHVzaW5nIGBEZW5vLnRlc3RgLiAqL1xuICBzdGF0aWMgcmVnaXN0ZXJUZXN0KG9wdGlvbnM6IERlbm8uVGVzdERlZmluaXRpb24pOiB2b2lkIHtcbiAgICBEZW5vLnRlc3Qoe1xuICAgICAgLi4ub3B0aW9ucyxcbiAgICAgIC8vIFNhbml0aXplIG9wcyBhbmQgcmVzb3VyY2VzIGlzIGhhbmRsZWQgYnkgdGhlIFRlc3RTdWl0ZS5cbiAgICAgIHNhbml0aXplT3BzOiBmYWxzZSxcbiAgICAgIHNhbml0aXplUmVzb3VyY2VzOiBmYWxzZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplcyBnbG9iYWwgdGVzdCBzdWl0ZS4gVGhpcyBzaG91bGQgbm90IGJlIHVzZWQgaW4geW91ciB0ZXN0cy5cbiAgICogVGhpcyBpcyB1c2VkIGludGVybmFsbHkgYW5kIGZvciB0ZXN0aW5nIHRoZSB0ZXN0IHN1aXRlIG1vZHVsZS5cbiAgICovXG4gIHN0YXRpYyBpbml0KCk6IHZvaWQge1xuICAgIGlmIChpbml0aWFsaXplZCkgdGhyb3cgbmV3IEVycm9yKFwiZ2xvYmFsIHRlc3Qgc3VpdGUgYWxyZWFkeSBpbml0aWFsaXplZFwiKTtcbiAgICBpbml0aWFsaXplZCA9IHRydWU7XG4gICAgZ2xvYmFsU3VpdGUgPSBuZXcgVGVzdFN1aXRlKHtcbiAgICAgIG5hbWU6IFwiXCIsXG4gICAgICBiZWZvcmVBbGwoKTogdm9pZCB7XG4gICAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgICAgIGNvbnN0IGxhc3RTdWl0ZTogVGVzdFN1aXRlPGFueT4gPSBzdWl0ZXMucGVla1JpZ2h0KCkhO1xuICAgICAgICBmb3IgKGNvbnN0IHN1aXRlIG9mIHN1aXRlcy5kcmFpblJpZ2h0KCkpIHtcbiAgICAgICAgICBzdWl0ZS5sYXN0ID0gbGFzdFN1aXRlLmxhc3Q7XG4gICAgICAgICAgc3VpdGUubG9ja2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBzdGFydGVkID0gdHJ1ZTtcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgc3VpdGVzLnB1c2goZ2xvYmFsU3VpdGUpO1xuICB9XG4gIC8qKlxuICAgKiBSZXNldHMgZ2xvYmFsIHRlc3Qgc3VpdGUuIFRoaXMgc2hvdWxkIG5vdCBiZSB1c2VkIGluIHlvdXIgdGVzdHMuXG4gICAqIFRoaXMgaXMgdXNlZCBmb3IgdGVzdGluZyB0aGUgdGVzdCBzdWl0ZSBtb2R1bGUuXG4gICAqL1xuICBzdGF0aWMgcmVzZXQoKTogdm9pZCB7XG4gICAgc3VpdGVOYW1lcy5jbGVhcigpO1xuICAgIHRlc3ROYW1lcy5jbGVhcigpO1xuICAgIHN1aXRlcy5sZW5ndGggPSAwO1xuICAgIGdsb2JhbFN1aXRlID0gbnVsbDtcbiAgICBpbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIHN0YXJ0ZWQgPSBmYWxzZTtcbiAgICBUZXN0U3VpdGUuaW5pdCgpO1xuICB9XG5cbiAgLyoqIFRoZSBuYW1lIG9mIHRoZSB0ZXN0IHN1aXRlIHdpbGwgYmUgcHJlcGVuZGVkIHRvIHRoZSBuYW1lcyBvZiB0ZXN0cyBpbiB0aGUgc3VpdGUuICovXG4gIHByaXZhdGUgbmFtZTogc3RyaW5nO1xuICAvKiogVGhlIGNvbnRleHQgZm9yIHRlc3RzIHdpdGhpbiB0aGUgc3VpdGUuICovXG4gIHByaXZhdGUgY29udGV4dD86IFBhcnRpYWw8VD47XG4gIC8qKlxuICAgKiBUaGUgcGFyZW50IHRlc3Qgc3VpdGUgdGhhdCB0aGUgdGVzdCBzdWl0ZSBiZWxvbmdzIHRvLlxuICAgKiBBbnkgb3B0aW9uIHRoYXQgaXMgbm90IHNwZWNpZmllZCB3aWxsIGJlIGluaGVyaXRlZCBmcm9tIHRoZSBwYXJlbnQgdGVzdCBzdWl0ZS5cbiAgICovXG4gIHByaXZhdGUgc3VpdGU/OiBUZXN0U3VpdGU8VD47XG4gIC8qKiBJZ25vcmUgYWxsIHRlc3RzIGluIHN1aXRlIGlmIHNldCB0byB0cnVlLiAqL1xuICBwcml2YXRlIGlnbm9yZT86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBJZiBhdCBsZWFzdCBvbmUgdGVzdCBzdWl0ZSBvciB0ZXN0IGhhcyBvbmx5IHNldCB0byB0cnVlLFxuICAgKiBvbmx5IHJ1biB0ZXN0IHN1aXRlcyBhbmQgdGVzdHMgdGhhdCBoYXZlIG9ubHkgc2V0IHRvIHRydWUuXG4gICAqL1xuICBwcml2YXRlIG9ubHk/OiBib29sZWFuO1xuICAvKipcbiAgICogQ2hlY2sgdGhhdCB0aGUgbnVtYmVyIG9mIGFzeW5jIGNvbXBsZXRlZCBvcHMgYWZ0ZXIgdGhlIHN1aXRlIGFuZCBlYWNoIHRlc3QgaW4gdGhlIHN1aXRlXG4gICAqIGlzIHRoZSBzYW1lIGFzIHRoZSBudW1iZXIgb2YgZGlzcGF0Y2hlZCBvcHMuIERlZmF1bHRzIHRvIHRydWUuXG4gICAqL1xuICBwcml2YXRlIHNhbml0aXplT3BzPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIEVuc3VyZSB0aGUgc3VpdGUgYW5kIHRlc3QgY2FzZXMgaW4gdGhlIHN1aXRlIGRvIG5vdCBcImxlYWtcIiByZXNvdXJjZXMgLSBpZS4gdGhlIHJlc291cmNlIHRhYmxlXG4gICAqIGFmdGVyIGVhY2ggdGVzdCBoYXMgZXhhY3RseSB0aGUgc2FtZSBjb250ZW50cyBhcyBiZWZvcmUgZWFjaCB0ZXN0LiBEZWZhdWx0cyB0byB0cnVlLlxuICAgKi9cbiAgcHJpdmF0ZSBzYW5pdGl6ZVJlc291cmNlcz86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBFbnN1cmUgdGhlIHRlc3QgY2FzZSBkb2VzIG5vdCBwcmVtYXR1cmVseSBjYXVzZSB0aGUgcHJvY2VzcyB0byBleGl0LCBmb3IgZXhhbXBsZSwgdmlhIGEgY2FsbCB0byBgZGVuby5leGl0YC4gRGVmYXVsdHMgdG8gdHJ1ZS5cbiAgICovXG4gIHNhbml0aXplRXhpdD86IGJvb2xlYW47XG4gIC8qKiBGdWxsIG5hbWUgb2YgdGhlIGxhc3QgdGVzdCBpbiB0aGUgc3VpdGUuICovXG4gIHByaXZhdGUgbGFzdD86IHN0cmluZztcbiAgcHJpdmF0ZSBzdGFydGVkOiBib29sZWFuO1xuICBwcml2YXRlIGxvY2tlZDogYm9vbGVhbjtcbiAgcHJpdmF0ZSBiZWZvcmVBbGxNZXRyaWNzPzogRGVuby5NZXRyaWNzO1xuICBwcml2YXRlIGJlZm9yZUFsbFJlc291cmNlcz86IERlbm8uUmVzb3VyY2VNYXA7XG5cbiAgLyoqIFJ1biBzb21lIHNoYXJlZCBzZXR1cCBiZWZvcmUgYWxsIG9mIHRoZSB0ZXN0cyBpbiB0aGUgc3VpdGUuICovXG4gIHByaXZhdGUgYmVmb3JlQWxsOiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xuICAvKiogUnVuIHNvbWUgc2hhcmVkIHRlYXJkb3duIGFmdGVyIGFsbCBvZiB0aGUgdGVzdHMgaW4gdGhlIHN1aXRlLiAqL1xuICBwcml2YXRlIGFmdGVyQWxsOiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xuICAvKiogUnVuIHNvbWUgc2hhcmVkIHNldHVwIGJlZm9yZSBlYWNoIHRlc3QgaW4gdGhlIHN1aXRlLiAqL1xuICBwcml2YXRlIGJlZm9yZUVhY2g6IChjb250ZXh0OiBUKSA9PiBQcm9taXNlPHZvaWQ+O1xuICAvKiogUnVuIHNvbWUgc2hhcmVkIHRlYXJkb3duIGFmdGVyIGVhY2ggdGVzdCBpbiB0aGUgc3VpdGUuICovXG4gIHByaXZhdGUgYWZ0ZXJFYWNoOiAoY29udGV4dDogVCkgPT4gUHJvbWlzZTx2b2lkPjtcbiAgcHJpdmF0ZSBob29rczogU3VpdGVIb29rczxUPjtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIG9wdGlvbnM6IFRlc3RTdWl0ZURlZmluaXRpb248VD4pIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMubmFtZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIm5hbWUgbXVzdCBiZSBhIHN0cmluZ1wiKTtcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMubmFtZS5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmIChnbG9iYWxTdWl0ZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIm5hbWUgY2Fubm90IGJlIGVtcHR5XCIpO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBvcHRpb25zLm5hbWVbMF0gPT09IFwiIFwiIHx8IG9wdGlvbnMubmFtZVtvcHRpb25zLm5hbWUubGVuZ3RoIC0gMV0gPT09IFwiIFwiXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwibmFtZSBjYW5ub3Qgc3RhcnQgb3IgZW5kIHdpdGggYSBzcGFjZVwiKTtcbiAgICB9XG4gICAgaWYgKGdsb2JhbFN1aXRlKSB7XG4gICAgICB0aGlzLnN1aXRlID0gKG9wdGlvbnMuc3VpdGUgPz8gZ2xvYmFsU3VpdGUpIGFzIFRlc3RTdWl0ZTxUPjtcbiAgICB9XG4gICAgaWYgKHRoaXMuc3VpdGUgJiYgdGhpcy5zdWl0ZS5sb2NrZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJjYW5ub3QgYWRkIGNoaWxkIHRlc3Qgc3VpdGUgYWZ0ZXIgc3RhcnRpbmcgYW5vdGhlciB0ZXN0IHN1aXRlXCIsXG4gICAgICApO1xuICAgIH1cbiAgICB0aGlzLm5hbWUgPSAodGhpcy5zdWl0ZSAmJiB0aGlzLnN1aXRlLm5hbWUgPyBgJHt0aGlzLnN1aXRlLm5hbWV9IGAgOiBcIlwiKSArXG4gICAgICBvcHRpb25zLm5hbWU7XG4gICAgaWYgKHN1aXRlTmFtZXMuaGFzKHRoaXMubmFtZSkpIHRocm93IG5ldyBFcnJvcihcInN1aXRlIG5hbWUgYWxyZWFkeSB1c2VkXCIpO1xuICAgIHN1aXRlTmFtZXMuYWRkKHRoaXMubmFtZSk7XG5cbiAgICBpZiAoIXN1aXRlcy5pc0VtcHR5KCkpIHtcbiAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgICBjb25zdCBsYXN0U3VpdGU6IFRlc3RTdWl0ZTxhbnk+ID0gc3VpdGVzLnBlZWtSaWdodCgpITtcbiAgICAgIHdoaWxlICh0aGlzLnN1aXRlICE9PSBzdWl0ZXMucGVla1JpZ2h0KCkgJiYgIXN1aXRlcy5pc0VtcHR5KCkpIHtcbiAgICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICAgICAgY29uc3QgY29tcGxldGVkU3VpdGU6IFRlc3RTdWl0ZTxhbnk+ID0gc3VpdGVzLnBvcCgpITtcbiAgICAgICAgY29tcGxldGVkU3VpdGUubGFzdCA9IGxhc3RTdWl0ZS5sYXN0O1xuICAgICAgICBjb21wbGV0ZWRTdWl0ZS5sb2NrZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBzdWl0ZXMucHVzaCh0aGlzKTtcblxuICAgIHRoaXMuaWdub3JlID0gb3B0aW9ucy5pZ25vcmUgPz8gdGhpcy5zdWl0ZT8uaWdub3JlO1xuICAgIHRoaXMub25seSA9IG9wdGlvbnMub25seSA/PyB0aGlzLnN1aXRlPy5vbmx5O1xuICAgIHRoaXMuc2FuaXRpemVPcHMgPSBvcHRpb25zLnNhbml0aXplT3BzID8/IHRoaXMuc3VpdGU/LnNhbml0aXplT3BzO1xuICAgIHRoaXMuc2FuaXRpemVSZXNvdXJjZXMgPSBvcHRpb25zLnNhbml0aXplUmVzb3VyY2VzID8/XG4gICAgICB0aGlzLnN1aXRlPy5zYW5pdGl6ZVJlc291cmNlcztcbiAgICB0aGlzLnNhbml0aXplRXhpdCA9IG9wdGlvbnMuc2FuaXRpemVFeGl0ID8/XG4gICAgICB0aGlzLnN1aXRlPy5zYW5pdGl6ZUV4aXQ7XG5cbiAgICB0aGlzLmhvb2tzID0ge307XG4gICAgVGVzdFN1aXRlLnNldEhvb2tzKHRoaXMsIG9wdGlvbnMpO1xuICAgIHRoaXMuYmVmb3JlQWxsID0gYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKHRoaXMuc3VpdGUgJiYgIXRoaXMuc3VpdGUuc3RhcnRlZCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuc3VpdGUuYmVmb3JlQWxsKCk7XG4gICAgICAgICAgdGhpcy5jb250ZXh0ID0geyAuLi50aGlzLnN1aXRlLmNvbnRleHQsIC4uLnRoaXMuY29udGV4dCB9O1xuICAgICAgICB9XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICB0aGlzLnN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgICBpZiAodGhpcy5zYW5pdGl6ZU9wcyA/PyB0cnVlKSB7XG4gICAgICAgICAgdGhpcy5iZWZvcmVBbGxNZXRyaWNzID0gYXdhaXQgZ2V0TWV0cmljcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnNhbml0aXplUmVzb3VyY2VzID8/IHRydWUpIHtcbiAgICAgICAgICB0aGlzLmJlZm9yZUFsbFJlc291cmNlcyA9IERlbm8ucmVzb3VyY2VzKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLmhvb2tzLmJlZm9yZUFsbCkgYXdhaXQgdGhpcy5ob29rcy5iZWZvcmVBbGwodGhpcy5jb250ZXh0IGFzIFQpO1xuICAgIH07XG4gICAgdGhpcy5hZnRlckFsbCA9IGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICh0aGlzLmhvb2tzLmFmdGVyQWxsKSBhd2FpdCB0aGlzLmhvb2tzLmFmdGVyQWxsKHRoaXMuY29udGV4dCBhcyBUKTtcbiAgICAgICAgaWYgKHRoaXMuc2FuaXRpemVPcHMgPz8gdHJ1ZSkge1xuICAgICAgICAgIGF3YWl0IGFzc2VydE9wcyhcInN1aXRlXCIsIHRoaXMuYmVmb3JlQWxsTWV0cmljcyEpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnNhbml0aXplUmVzb3VyY2VzID8/IHRydWUpIHtcbiAgICAgICAgICBhc3NlcnRSZXNvdXJjZXMoXCJzdWl0ZVwiLCB0aGlzLmJlZm9yZUFsbFJlc291cmNlcyEpO1xuICAgICAgICB9XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBpZiAodGhpcy5zdWl0ZSAmJiB0aGlzLnN1aXRlLmxhc3QgPT09IHRoaXMubGFzdCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuc3VpdGUuYWZ0ZXJBbGwoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gICAgdGhpcy5iZWZvcmVFYWNoID0gYXN5bmMgKGNvbnRleHQ6IFQpID0+IHtcbiAgICAgIGlmICh0aGlzLnN1aXRlKSBhd2FpdCB0aGlzLnN1aXRlLmJlZm9yZUVhY2goY29udGV4dCk7XG4gICAgICBpZiAodGhpcy5ob29rcy5iZWZvcmVFYWNoKSBhd2FpdCB0aGlzLmhvb2tzLmJlZm9yZUVhY2goY29udGV4dCk7XG4gICAgfTtcbiAgICB0aGlzLmFmdGVyRWFjaCA9IGFzeW5jIChjb250ZXh0OiBUKSA9PiB7XG4gICAgICBpZiAodGhpcy5ob29rcy5hZnRlckVhY2gpIGF3YWl0IHRoaXMuaG9va3MuYWZ0ZXJFYWNoKGNvbnRleHQpO1xuICAgICAgaWYgKHRoaXMuc3VpdGUpIGF3YWl0IHRoaXMuc3VpdGUuYWZ0ZXJFYWNoKGNvbnRleHQpO1xuICAgIH07XG5cbiAgICB0aGlzLmNvbnRleHQgPSAob3B0aW9ucy5jb250ZXh0ID8/IHt9KSBhcyBUO1xuICAgIHRoaXMuc3RhcnRlZCA9IGZhbHNlO1xuICAgIHRoaXMubG9ja2VkID0gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogUmVnaXN0ZXIgYSB0ZXN0IHdoaWNoIHdpbGwgcnVuIHdoZW4gYGRlbm8gdGVzdGAgaXMgdXNlZCBvbiB0aGUgY29tbWFuZCBsaW5lXG4gICAqIGFuZCB0aGUgY29udGFpbmluZyBtb2R1bGUgbG9va3MgbGlrZSBhIHRlc3QgbW9kdWxlLlxuICAgKi9cbiAgc3RhdGljIHRlc3Q8VD4oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGZuOlxuICAgICAgfCAoKCkgPT4gdm9pZClcbiAgICAgIHwgKCgpID0+IFByb21pc2U8dm9pZD4pXG4gICAgICB8ICgoY29udGV4dDogVCkgPT4gdm9pZClcbiAgICAgIHwgKChjb250ZXh0OiBUKSA9PiBQcm9taXNlPHZvaWQ+KSxcbiAgKTogdm9pZDtcbiAgc3RhdGljIHRlc3Q8VD4oXG4gICAgc3VpdGU6IFRlc3RTdWl0ZTxUPiB8IFRlc3RTdWl0ZTxQYXJ0aWFsPFQ+PiB8IFRlc3RTdWl0ZTx2b2lkPixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgZm46XG4gICAgICB8ICgoKSA9PiB2b2lkKVxuICAgICAgfCAoKCkgPT4gUHJvbWlzZTx2b2lkPilcbiAgICAgIHwgKChjb250ZXh0OiBUKSA9PiB2b2lkKVxuICAgICAgfCAoKGNvbnRleHQ6IFQpID0+IFByb21pc2U8dm9pZD4pLFxuICApOiB2b2lkO1xuICBzdGF0aWMgdGVzdDxUPihvcHRpb25zOiBUZXN0RGVmaW5pdGlvbjxUPik6IHZvaWQ7XG4gIHN0YXRpYyB0ZXN0PFQ+KFxuICAgIGE6XG4gICAgICB8IHN0cmluZ1xuICAgICAgfCBUZXN0RGVmaW5pdGlvbjxUPlxuICAgICAgfCBUZXN0U3VpdGU8VD5cbiAgICAgIHwgVGVzdFN1aXRlPFBhcnRpYWw8VD4+XG4gICAgICB8IFRlc3RTdWl0ZTx2b2lkPixcbiAgICBiPzpcbiAgICAgIHwgc3RyaW5nXG4gICAgICB8ICgoKSA9PiB2b2lkKVxuICAgICAgfCAoKCkgPT4gUHJvbWlzZTx2b2lkPilcbiAgICAgIHwgKChjb250ZXh0OiBUKSA9PiB2b2lkKVxuICAgICAgfCAoKGNvbnRleHQ6IFQpID0+IFByb21pc2U8dm9pZD4pLFxuICAgIGM/OlxuICAgICAgfCAoKCkgPT4gdm9pZClcbiAgICAgIHwgKCgpID0+IFByb21pc2U8dm9pZD4pXG4gICAgICB8ICgoY29udGV4dDogVCkgPT4gdm9pZClcbiAgICAgIHwgKChjb250ZXh0OiBUKSA9PiBQcm9taXNlPHZvaWQ+KSxcbiAgKTogdm9pZCB7XG4gICAgaWYgKHN0YXJ0ZWQpIHRocm93IG5ldyBFcnJvcihcImNhbm5vdCBhZGQgdGVzdCBhZnRlciB0ZXN0IHJ1bm5lciBzdGFydGVkXCIpO1xuICAgIGNvbnN0IG9wdGlvbnM6IFRlc3REZWZpbml0aW9uPFQ+ID1cbiAgICAgICEoYSBpbnN0YW5jZW9mIFRlc3RTdWl0ZSkgJiYgdHlwZW9mIGEgIT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBhXG4gICAgICAgIDogdHlwZW9mIGEgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyB7IG5hbWU6IGEsIGZuOiBiIGFzICh0aGlzOiBUKSA9PiAodm9pZCB8IFByb21pc2U8dm9pZD4pIH1cbiAgICAgICAgOiB7XG4gICAgICAgICAgc3VpdGU6IGEgYXMgVGVzdFN1aXRlPFQ+LFxuICAgICAgICAgIG5hbWU6IGIgYXMgc3RyaW5nLFxuICAgICAgICAgIGZuOiBjIGFzICh0aGlzOiBUKSA9PiAodm9pZCB8IFByb21pc2U8dm9pZD4pLFxuICAgICAgICB9O1xuICAgIGNvbnN0IHN1aXRlOiBUZXN0U3VpdGU8VD4gPSAob3B0aW9ucy5zdWl0ZSA/PyBnbG9iYWxTdWl0ZSEpIGFzIFRlc3RTdWl0ZTxUPjtcbiAgICBpZiAoc3VpdGUubG9ja2VkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJjYW5ub3QgYWRkIHRlc3QgYWZ0ZXIgc3RhcnRpbmcgYW5vdGhlciB0ZXN0IHN1aXRlXCIpO1xuICAgIH1cblxuICAgIGxldCBuYW1lOiBzdHJpbmcgPSBvcHRpb25zLm5hbWU7XG4gICAgaWYgKHR5cGVvZiBuYW1lICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwibmFtZSBtdXN0IGJlIGEgc3RyaW5nXCIpO1xuICAgIH0gZWxzZSBpZiAobmFtZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJuYW1lIGNhbm5vdCBiZSBlbXB0eVwiKTtcbiAgICB9IGVsc2UgaWYgKG5hbWVbMF0gPT09IFwiIFwiIHx8IG5hbWVbbmFtZS5sZW5ndGggLSAxXSA9PT0gXCIgXCIpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJuYW1lIGNhbm5vdCBzdGFydCBvciBlbmQgd2l0aCBhIHNwYWNlXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGZuOiAoY29udGV4dDogVCkgPT4gUHJvbWlzZTx2b2lkPiA9IG9wdGlvbnNcbiAgICAgIC5mbiBhcyAoKGNvbnRleHQ6IFQpID0+IFByb21pc2U8dm9pZD4pO1xuICAgIGlmICghZm4pIHRocm93IG5ldyBUeXBlRXJyb3IoXCJmbiBhcmd1bWVudCBvciBvcHRpb24gbWlzc2luZ1wiKTtcblxuICAgIG5hbWUgPSAoc3VpdGUubmFtZSA/IGAke3N1aXRlLm5hbWV9IGAgOiBcIlwiKSArIG5hbWU7XG4gICAgaWYgKHRlc3ROYW1lcy5oYXMobmFtZSkpIHRocm93IG5ldyBFcnJvcihcInRlc3QgbmFtZSBhbHJlYWR5IHVzZWRcIik7XG4gICAgdGVzdE5hbWVzLmFkZChuYW1lKTtcblxuICAgIGlmICghc3VpdGVzLmlzRW1wdHkoKSkge1xuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICAgIGNvbnN0IGxhc3RTdWl0ZTogVGVzdFN1aXRlPGFueT4gPSBzdWl0ZXMucGVla1JpZ2h0KCkhO1xuICAgICAgd2hpbGUgKHN1aXRlICE9PSBzdWl0ZXMucGVla1JpZ2h0KCkgJiYgIXN1aXRlcy5pc0VtcHR5KCkpIHtcbiAgICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICAgICAgY29uc3QgY29tcGxldGVkU3VpdGU6IFRlc3RTdWl0ZTxhbnk+ID0gc3VpdGVzLnBvcCgpITtcbiAgICAgICAgY29tcGxldGVkU3VpdGUubGFzdCA9IGxhc3RTdWl0ZS5sYXN0O1xuICAgICAgICBjb21wbGV0ZWRTdWl0ZS5sb2NrZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHNhbml0aXplT3BzOiBib29sZWFuID0gb3B0aW9ucy5zYW5pdGl6ZU9wcyA/P1xuICAgICAgc3VpdGUuc2FuaXRpemVPcHMgPz8gdHJ1ZTtcbiAgICBjb25zdCBzYW5pdGl6ZVJlc291cmNlczogYm9vbGVhbiA9IG9wdGlvbnMuc2FuaXRpemVSZXNvdXJjZXMgPz9cbiAgICAgIHN1aXRlLnNhbml0aXplUmVzb3VyY2VzID8/IHRydWU7XG5cbiAgICBzdWl0ZS5sYXN0ID0gbmFtZTtcbiAgICBjb25zdCB0ZXN0OiBEZW5vLlRlc3REZWZpbml0aW9uID0ge1xuICAgICAgbmFtZSxcbiAgICAgIGZuOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmICghc3VpdGUuc3RhcnRlZCkgYXdhaXQgc3VpdGUuYmVmb3JlQWxsKCk7XG4gICAgICAgIGNvbnN0IGNvbnRleHQ6IFQgPSB7IC4uLnN1aXRlLmNvbnRleHQgfSBhcyBUO1xuICAgICAgICBsZXQgYmVmb3JlTWV0cmljczogRGVuby5NZXRyaWNzIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGxldCBiZWZvcmVSZXNvdXJjZXM6IERlbm8uUmVzb3VyY2VNYXAgfCBudWxsID0gbnVsbDtcbiAgICAgICAgbGV0IGZpcnN0RXJyb3I6IEVycm9yIHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBpZiAoc2FuaXRpemVPcHMpIGJlZm9yZU1ldHJpY3MgPSBhd2FpdCBnZXRNZXRyaWNzKCk7XG4gICAgICAgICAgaWYgKHNhbml0aXplUmVzb3VyY2VzKSBiZWZvcmVSZXNvdXJjZXMgPSBEZW5vLnJlc291cmNlcygpO1xuICAgICAgICAgIGF3YWl0IHN1aXRlLmJlZm9yZUVhY2goY29udGV4dCk7XG4gICAgICAgICAgYXdhaXQgZm4oY29udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgZmlyc3RFcnJvciA9IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBzdWl0ZS5hZnRlckVhY2goY29udGV4dCk7XG4gICAgICAgICAgaWYgKHNhbml0aXplT3BzKSBhd2FpdCBhc3NlcnRPcHMoXCJjYXNlXCIsIGJlZm9yZU1ldHJpY3MhKTtcbiAgICAgICAgICBpZiAoc2FuaXRpemVSZXNvdXJjZXMpIGFzc2VydFJlc291cmNlcyhcImNhc2VcIiwgYmVmb3JlUmVzb3VyY2VzISk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKCFmaXJzdEVycm9yKSBmaXJzdEVycm9yID0gZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGlmIChzdWl0ZS5sYXN0ID09PSBuYW1lKSBhd2FpdCBzdWl0ZS5hZnRlckFsbCgpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmICghZmlyc3RFcnJvcikgZmlyc3RFcnJvciA9IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpcnN0RXJyb3IpIHRocm93IGZpcnN0RXJyb3I7XG4gICAgICB9LFxuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIG9wdGlvbnMuaWdub3JlICE9PSBcInVuZGVmaW5lZFwiKSB0ZXN0Lmlnbm9yZSA9IG9wdGlvbnMuaWdub3JlO1xuICAgIGVsc2UgaWYgKHR5cGVvZiBzdWl0ZS5pZ25vcmUgIT09IFwidW5kZWZpbmVkXCIpIHRlc3QuaWdub3JlID0gc3VpdGUuaWdub3JlO1xuXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLm9ubHkgIT09IFwidW5kZWZpbmVkXCIpIHRlc3Qub25seSA9IG9wdGlvbnMub25seTtcbiAgICBlbHNlIGlmICh0eXBlb2Ygc3VpdGUub25seSAhPT0gXCJ1bmRlZmluZWRcIikgdGVzdC5vbmx5ID0gc3VpdGUub25seTtcblxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zYW5pdGl6ZU9wcyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgdGVzdC5zYW5pdGl6ZU9wcyA9IG9wdGlvbnMuc2FuaXRpemVPcHM7XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc3VpdGUuc2FuaXRpemVPcHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHRlc3Quc2FuaXRpemVPcHMgPSBzdWl0ZS5zYW5pdGl6ZU9wcztcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIG9wdGlvbnMuc2FuaXRpemVSZXNvdXJjZXMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHRlc3Quc2FuaXRpemVSZXNvdXJjZXMgPSBvcHRpb25zLnNhbml0aXplUmVzb3VyY2VzO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHN1aXRlLnNhbml0aXplUmVzb3VyY2VzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICB0ZXN0LnNhbml0aXplUmVzb3VyY2VzID0gc3VpdGUuc2FuaXRpemVSZXNvdXJjZXM7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLnNhbml0aXplRXhpdCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgdGVzdC5zYW5pdGl6ZUV4aXQgPSBvcHRpb25zLnNhbml0aXplRXhpdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBzdWl0ZS5zYW5pdGl6ZUV4aXQgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHRlc3Quc2FuaXRpemVFeGl0ID0gc3VpdGUuc2FuaXRpemVFeGl0O1xuICAgIH1cblxuICAgIC8vIHRlc3RzIHNob3VsZCBnbyBvbnRvIGEgcXVldWUgdGhhdCBkcmFpbnNcbiAgICAvLyBvbmNlIGFub3RoZXIgdGVzdCBzdWl0ZSBvciB0ZXN0IGlzIGNyZWF0ZWQgb3V0c2lkZSBvZiBzdWl0ZVxuICAgIC8vIG5lZWQgZmlyc3QgYW5kIGxhc3QgdGVzdCB0byBoYXZlIGFzeW5jIG9wcyBkaXNhYmxlZFxuICAgIC8vIG1pZ2h0IGJlIGVhc2llciB0byBkaXNhYmxlIGZvciBhbGwgb2YgdGhlbSBhbmQgZG8gYWxsIHNhbml0aXppbmcgaW4gaGVyZVxuICAgIFRlc3RTdWl0ZS5yZWdpc3RlclRlc3QodGVzdCk7XG4gIH1cblxuICBzdGF0aWMgc2V0SG9va3M8VD4oc3VpdGU6IFRlc3RTdWl0ZTxUPiwgaG9va3M6IFN1aXRlSG9va3M8VD4pOiB2b2lkIHtcbiAgICBpZiAoc3RhcnRlZCkgdGhyb3cgbmV3IEVycm9yKFwiY2Fubm90IHNldCBob29rcyBhZnRlciB0ZXN0IHJ1bm5lciBzdGFydGVkXCIpO1xuICAgIGlmIChob29rcy5iZWZvcmVBbGwpIHN1aXRlLmhvb2tzLmJlZm9yZUFsbCA9IGhvb2tzLmJlZm9yZUFsbDtcbiAgICBpZiAoaG9va3MuYWZ0ZXJBbGwpIHN1aXRlLmhvb2tzLmFmdGVyQWxsID0gaG9va3MuYWZ0ZXJBbGw7XG4gICAgaWYgKGhvb2tzLmJlZm9yZUVhY2gpIHN1aXRlLmhvb2tzLmJlZm9yZUVhY2ggPSBob29rcy5iZWZvcmVFYWNoO1xuICAgIGlmIChob29rcy5hZnRlckVhY2gpIHN1aXRlLmhvb2tzLmFmdGVyRWFjaCA9IGhvb2tzLmFmdGVyRWFjaDtcbiAgfVxufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgdGVzdCB3aGljaCB3aWxsIHJ1biB3aGVuIGBkZW5vIHRlc3RgIGlzIHVzZWQgb24gdGhlIGNvbW1hbmQgbGluZVxuICogYW5kIHRoZSBjb250YWluaW5nIG1vZHVsZSBsb29rcyBsaWtlIGEgdGVzdCBtb2R1bGUuXG4gKi9cbmV4cG9ydCBjb25zdCB0ZXN0OiB0eXBlb2YgVGVzdFN1aXRlLnRlc3QgPSBUZXN0U3VpdGUudGVzdDtcblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmxldCBnbG9iYWxTdWl0ZTogVGVzdFN1aXRlPGFueT4gfCBudWxsID0gbnVsbDtcblRlc3RTdWl0ZS5pbml0KCk7XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxZQUFZLEVBQUUsS0FBSyxFQUFFLE1BQU0sUUFBUSxXQUFXLENBQUM7QUEySHhELG1DQUFtQztBQUNuQyxNQUFNLE1BQU0sR0FBMkIsSUFBSSxNQUFNLEVBQUUsQUFBQztBQUNwRCxNQUFNLFVBQVUsR0FBZ0IsSUFBSSxHQUFHLEVBQUUsQUFBQztBQUMxQyxNQUFNLFNBQVMsR0FBZ0IsSUFBSSxHQUFHLEVBQUUsQUFBQztBQUV6QyxJQUFJLFdBQVcsR0FBRyxLQUFLLEFBQUM7QUFD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