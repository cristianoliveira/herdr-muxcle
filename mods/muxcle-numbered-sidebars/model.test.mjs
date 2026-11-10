import assert from "node:assert/strict";
import test from "node:test";
import {
  agentRows,
  agentSelection,
  roleFor,
  spaceRows,
  spaceSelection,
  statusColor,
} from "../../.build/mods/muxcle-numbered-sidebars/model.js";

const space = (id, active = false, status = null) => ({ id, active, status });
const agent = (address, pane, status = "idle") => ({ address, pane, status });
const livePane = (pane, terminal) => ({ pane, terminal });

const palette = {
  blocked: "blocked-tone",
  dim: "dim-tone",
  done: "done-tone",
  foreground: "foreground-tone",
  idle: "idle-tone",
  muted: "muted-tone",
  unknown: "unknown-tone",
  working: "working-tone",
};

test("space labels preserve native snapshot order and exact qualified ids beyond nine", () => {
  const spaces = Array.from({ length: 11 }, (_, index) =>
    space(index === 9 ? "build-box/project-remote" : `space-${index + 1}`, index === 9, index === 9 ? "blocked" : null),
  );
  const rows = spaceRows(spaces);

  assert.equal(rows[9].number, 10);
  assert.equal(rows[9].id, "build-box/project-remote");
  assert.equal(rows[9].selected, true);
  assert.equal(rows[9].status, "blocked");
  assert.deepEqual(
    rows.map((row) => row.id),
    spaces.map(({ id }) => id),
  );
  assert.equal(spaceRows([{ id: "missing-status", active: false }])[0].status, "unknown");
});

test("agent labels keep snapshot order, preserve qualified addresses, and mark missing status unknown", () => {
  const agents = Array.from({ length: 11 }, (_, index) =>
    agent(index === 9 ? "build-box/terminal-remote" : `terminal-${index + 1}`, `pane-${index + 1}`),
  );
  agents[10] = { address: "build-box/terminal-missing-pane", status: undefined };
  const rows = agentRows(agents);

  assert.equal(rows[9].number, 10);
  assert.equal(rows[9].address, "build-box/terminal-remote");
  assert.equal(rows[9].pane, "pane-10");
  assert.equal(rows[10].number, 11);
  assert.equal(rows[10].status, "unknown");
  assert.equal(rows[10].pane, null);
});

test("space selection uses an exact current id and refuses removed or similarly named targets", () => {
  const selected = spaceSelection("build-box/app", [space("local/app"), space("build-box/app")]);
  const stale = spaceSelection("gone/app", [space("local/app")]);
  const ambiguous = spaceSelection("build-box/app", [space("build-box/app"), space("build-box/app")]);

  assert.deepEqual(selected, { command: "space.select", args: { id: "build-box/app" } });
  assert.equal(stale, null);
  assert.equal(ambiguous, null);
});

test("agent focus revalidates exact address, pane, and current terminal association", () => {
  const target = { address: "build-box/agent-a", pane: "build-box/pane-7" };
  const currentAgents = [agent(target.address, target.pane, "working")];
  const currentPanes = [livePane(target.pane, target.address)];

  assert.deepEqual(agentSelection(target, currentAgents, currentPanes), {
    command: "pane.focus",
    args: { pane: target.pane },
  });
  assert.equal(agentSelection(target, [agent(target.address, "build-box/pane-new")], currentPanes), null);
  assert.equal(agentSelection(target, currentAgents, [livePane(target.pane, "other-agent")]), null);
  assert.equal(agentSelection(target, [], currentPanes), null);
});

test("status colors use theme tokens and unknown or absent metadata never implies a known state", () => {
  assert.equal(statusColor(palette, "working"), "working-tone");
  assert.equal(statusColor(palette, "unknown"), "unknown-tone");
  assert.equal(statusColor(palette, null), "muted-tone");
  assert.equal(statusColor({ dim: "dim-tone" }, "blocked"), "dim-tone");
});

test("only spaces and agents roles are supported", () => {
  assert.equal(roleFor("spaces"), "spaces");
  assert.equal(roleFor("agents"), "agents");
  assert.equal(roleFor(undefined), null);
  assert.equal(roleFor("tabs"), null);
});
