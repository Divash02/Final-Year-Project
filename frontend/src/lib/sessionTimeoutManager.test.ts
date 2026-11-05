import test from "node:test";
import assert from "node:assert/strict";
import { SessionTimeoutManager } from "./sessionTimeoutManager";

interface ManagerFixture {
  manager: SessionTimeoutManager;
  setClock: (value: number) => void;
  tick: () => void;
  calls: unknown[];
  renewShouldFail: (v: boolean) => void;
  renewResult: (v: { expiresAt: string }) => void;
  signOutCalls: () => number;
}

function managerWith(options?: Partial<{
  inactivityTimeoutMs: number;
  warningBeforeMs: number;
}>): ManagerFixture {
  const calls: unknown[] = [];
  let renewResult = { expiresAt: new Date(Date.now() + 300000).toISOString() };
  let renewShouldFail = false;
  let signOutCalls = 0;
  let clock = 0;

  const manager = new SessionTimeoutManager({
    inactivityTimeoutMs: options?.inactivityTimeoutMs ?? 60000,
    warningBeforeMs: options?.warningBeforeMs ?? 10000,
    clock: () => clock,
    renewSession: async () => {
      calls.push("renew");
      if (renewShouldFail) throw new Error("network down");
      return renewResult;
    },
    signOut: () => {
      signOutCalls++;
    },
    callbacks: {
      onWarningStart: (seconds: number) => calls.push(["warning", seconds]),
      onWarningTick: (seconds: number) => calls.push(["tick", seconds]),
      onWarningClear: () => calls.push("clear"),
      onExpire: (reason: string) => calls.push(["expire", reason]),
      onRenewed: () => calls.push("renewed"),
      onRenewFailure: (error: unknown) => calls.push(["renew-failure", error]),
    },
  });

  return {
    manager,
    setClock: (value: number) => { clock = value; },
    tick: () => manager.tick(clock),
    calls,
    renewShouldFail: (v: boolean) => { renewShouldFail = v; },
    renewResult: (v: { expiresAt: string }) => { renewResult = v; },
    signOutCalls: () => signOutCalls,
  };
}

test("stays active while the user is recently active", () => {
  const { manager, setClock, tick, calls } = managerWith();
  manager.start();
  setClock(0);
  tick();
  assert.deepEqual(calls, []);

  setClock(45000);
  tick();
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === "warning"));
});

test("starts the warning before the inactivity timeout", () => {
  const { manager, setClock, tick, calls } = managerWith();
  manager.start();
  setClock(0);
  tick();

  setClock(60000 - 10000 - 1);
  tick();
  assert.deepEqual(calls, []);

  setClock(60000 - 10000);
  tick();
  assert.deepEqual(calls, [["warning", 10]]);
});

test("expires at the inactivity timeout", () => {
  const { manager, setClock, tick, calls } = managerWith();
  manager.start();
  setClock(0);
  tick();

  setClock(60000);
  tick();
  assert.deepEqual(calls, [["expire", "inactivity"]]);
  assert.equal(manager.isExpired(), true);
  assert.equal(manager.isWarningActive(), false);
});

test("user activity resets the warning and the timer", () => {
  const { manager, setClock, tick, calls } = managerWith();
  manager.start();
  setClock(0);
  tick();

  setClock(60000 - 10000);
  tick();
  assert.deepEqual(calls, [["warning", 10]]);

  setClock(60000 - 10000 + 1000);
  manager.recordActivity();
  assert.deepEqual(calls, [["warning", 10], "clear"]);
  assert.equal(manager.isWarningActive(), false);

  setClock(60000 - 10000 + 1000 + 50000);
  tick();
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === "expire"));
});

test("stay signed in renews through the server and resets the timer", async () => {
  const { manager, setClock, tick, calls } = managerWith();
  manager.start();
  setClock(0);
  tick();

  setClock(50000);
  tick();
  assert.deepEqual(calls, [["warning", 10]]);

  await manager.staySignedIn();
  assert.deepEqual(calls, [
    ["warning", 10],
    "renew",
    "clear",
    "renewed",
  ]);
  assert.equal(manager.isWarningActive(), false);
  setClock(50000 + 50000);
  tick();
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === "expire"));
});

test("a failed renewal is not treated as success", async () => {
  const { manager, setClock, tick, calls, renewShouldFail } = managerWith();
  renewShouldFail(true);
  manager.start();
  setClock(0);
  tick();

  setClock(49999);
  tick();

  const failure = new Error("network down");
  await manager.staySignedIn();
  assert.deepEqual(calls, [
    "renew",
    ["renew-failure", failure],
  ]);
  assert.equal(manager.isWarningActive(), false);
  assert.equal(manager.isExpired(), false);
});

test("renewal failure leaves the expiry clock running", async () => {
  const { manager, setClock, tick, calls, renewShouldFail } = managerWith();
  renewShouldFail(true);
  manager.start();
  setClock(0);
  tick();

  setClock(60000 - 10000);
  tick();
  await manager.staySignedIn();

  setClock(60000);
  tick();
  assert.ok(calls.includes("renew"));
  assert.deepEqual(calls.slice(-1), [["expire", "inactivity"]]);
  assert.equal(manager.isExpired(), true);
});

test("heartbeat renews while actively working, not while idle", async () => {
  const { manager, setClock, tick, calls } = managerWith();
  manager.start();
  setClock(0);
  tick();

  setClock(30000);
  manager.recordActivity();
  tick();
  assert.ok(calls.includes("renew"));

  await Promise.resolve();
  setClock(60000);
  manager.recordActivity();
  tick();
  assert.equal(calls.filter((c) => c === "renew").length, 2);

  const m2 = managerWith();
  m2.manager.start();
  m2.setClock(0);
  m2.tick();
  m2.setClock(40000);
  m2.tick();
  assert.ok(!m2.calls.includes("renew"));
  assert.equal(m2.manager.isWarningActive(), false);

  m2.setClock(55000);
  m2.tick();
  assert.ok(m2.calls.some((c) => Array.isArray(c) && c[0] === "warning"));
  m2.setClock(60000);
  m2.tick();
  assert.deepEqual(m2.calls.slice(-1), [["expire", "inactivity"]]);
});

test("seconds remaining counts down", () => {
  const { manager, setClock, tick } = managerWith();
  manager.start();
  setClock(0);
  tick();
  setClock(60000 - 10000);
  tick();
  assert.equal(manager.secondsRemaining(), 10);
  setClock(60000 - 10000 + 3000);
  assert.equal(manager.secondsRemaining(), 7);
  setClock(60000 + 10000);
  assert.equal(manager.secondsRemaining(), 0);
});

test("expireAbsolute, expireRevoked and expireManual end the session", async () => {
  const { manager, setClock, tick, calls } = managerWith();
  manager.start();
  setClock(0);
  tick();

  setClock(60000 - 10000);
  tick();
  assert.deepEqual(calls, [["warning", 10]]);

  manager.expireAbsolute();
  assert.deepEqual(calls, [["warning", 10], ["expire", "absolute"]]);
  assert.equal(manager.isExpired(), true);

  const m2 = managerWith();
  m2.manager.start();
  m2.setClock(0);
  m2.tick();
  m2.manager.expireRevoked();
  assert.deepEqual(m2.calls, [["expire", "revoked"]]);

  const m3 = managerWith();
  m3.manager.start();
  m3.setClock(0);
  m3.tick();
  await m3.manager.signOutNow();
  assert.deepEqual(m3.calls, [["expire", "manual"]]);
  assert.equal(m3.signOutCalls(), 1);
});
