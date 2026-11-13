import assert from "node:assert/strict";
import test from "node:test";
import { startArgs, matchingTunnel, helperPayload } from "../../.build/mods/muxcle-port-forward/model.js";

test("manual forwarding defaults local port to remote and marks user origin", () => {
  assert.deepEqual(startArgs("mac", "3000", ""), [
    "start",
    "--machine",
    "mac",
    "--port",
    "3000",
    "--local-port",
    "3000",
    "--origin",
    "user",
  ]);
  assert.equal(startArgs("mac", "3000", "3001")[6], "3001");
});

test("invalid or absent ports and machine are rejected before invoking helper", () => {
  for (const value of ["", "0", "65536", "3000;rm", "3.5"]) assert.throws(() => startArgs("mac", value, ""));
  for (const machine of ["", null, {}, "mac\nother"]) assert.throws(() => startArgs(machine, "3000", ""));
  for (const value of [null, true, [3000], {}]) assert.throws(() => startArgs("mac", value, ""));
});

test("helper payload rejects missing or malformed results instead of claiming success", () => {
  for (const value of [null, [], {}, { ok: true }, { ok: true, tunnels: [{}] }]) {
    assert.throws(() => helperPayload(value, "status"));
  }
  assert.throws(() => helperPayload({ ok: false, error: "SSH unavailable" }, "start"), /SSH unavailable/);
  assert.throws(() => helperPayload({ ok: true, machines: [{ name: "mac", supported: "yes" }] }, "machines"));
  assert.throws(() => helperPayload({ ok: true, ports: [{ port: 65536, process: "node", address: "*" }] }, "list"));
});

test("helper payload preserves valid machine, port and tunnel results", () => {
  const tunnel = {
    id: "owned",
    machine: "mac",
    remote_port: 3000,
    local_port: 3001,
    origin: "user",
    state: "forwarding",
    local_url: "http://127.0.0.1:3001",
  };
  assert.deepEqual(helperPayload({ ok: true, tunnels: [tunnel] }, "status").tunnels, [tunnel]);
  assert.equal(helperPayload({ ok: true, tunnel, reused: true }, "start").reused, true);
  assert.equal(
    helperPayload({ ok: true, machines: [{ name: "mac", supported: true, state: "connected" }] }, "machines")
      .machines[0].name,
    "mac",
  );
  assert.equal(
    helperPayload({ ok: true, ports: [{ port: 3000, process: "node", address: "*:3000" }] }, "list").ports[0].port,
    3000,
  );
});

test("toggle matches machine and both ports, including agent-created tunnels", () => {
  const tunnel = { id: "a", machine: "mac", remote_port: 3000, local_port: 3001, state: "forwarding", origin: "agent" };
  assert.equal(matchingTunnel([tunnel], "mac", "3000", "3001"), tunnel);
  assert.equal(matchingTunnel([tunnel], "mac", "3000", ""), null);
  assert.equal(matchingTunnel([tunnel], "maya", "3000", "3001"), null);
  assert.equal(matchingTunnel([tunnel], "mac", "invalid", ""), null);
});
