export interface RemoteMachine {
  name: string;
  state: string | null;
  supported: boolean;
}

export interface ListeningPort {
  port: number;
  process: string;
  address: string;
}

export interface Tunnel {
  id: string;
  machine: string;
  remote_port: number;
  local_port: number;
  origin: "user" | "agent";
  state: "forwarding" | "disconnected";
  local_url: string;
}

export interface HelperPayload {
  machines: RemoteMachine[];
  ports: ListeningPort[];
  tunnels: Tunnel[];
  tunnel?: Tunnel;
  reused: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function portNumber(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Choose a port from 1 to 65535.");
  }
  const text = String(value).trim();
  const number = Number(text);
  if (!/^[0-9]{1,5}$/.test(text) || number < 1 || number > 65535) {
    throw new Error("Choose a port from 1 to 65535.");
  }
  return number;
}

export function startArgs(machine: unknown, remote: unknown, local: unknown): string[] {
  if (typeof machine !== "string" || !machine.trim() || /[\x00-\x1f\x7f]/.test(machine)) {
    throw new Error("Choose a remote machine first.");
  }
  const port = portNumber(remote);
  const localPort = typeof local === "string" && !local.trim() ? port : portNumber(local);
  return ["start", "--machine", machine, "--port", String(port), "--local-port", String(localPort), "--origin", "user"];
}

export function matchingTunnel<T extends Pick<Tunnel, "machine" | "remote_port" | "local_port">>(
  tunnels: readonly T[],
  machine: string,
  remote: unknown,
  local: unknown,
): T | null {
  try {
    const args = startArgs(machine, remote, local);
    return (
      tunnels.find(
        (tunnel) =>
          tunnel.machine === machine && tunnel.remote_port === Number(args[4]) && tunnel.local_port === Number(args[6]),
      ) ?? null
    );
  } catch {
    return null;
  }
}

function validPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function machineRow(value: unknown): value is RemoteMachine {
  return (
    record(value) &&
    typeof value.name === "string" &&
    Boolean(value.name) &&
    (typeof value.state === "string" || value.state === null) &&
    typeof value.supported === "boolean"
  );
}

function portRow(value: unknown): value is ListeningPort {
  return (
    record(value) && validPort(value.port) && typeof value.process === "string" && typeof value.address === "string"
  );
}

function tunnelRow(value: unknown): value is Tunnel {
  return (
    record(value) &&
    typeof value.id === "string" &&
    Boolean(value.id) &&
    typeof value.machine === "string" &&
    Boolean(value.machine) &&
    validPort(value.remote_port) &&
    validPort(value.local_port) &&
    (value.origin === "user" || value.origin === "agent") &&
    (value.state === "forwarding" || value.state === "disconnected") &&
    value.local_url === `http://127.0.0.1:${value.local_port}`
  );
}

function rows<T>(value: unknown, predicate: (item: unknown) => item is T): T[] {
  if (!Array.isArray(value) || !value.every(predicate)) {
    throw new Error("Port-forward helper returned invalid rows.");
  }
  return value;
}

export function helperPayload(value: unknown, command: string): HelperPayload {
  if (!record(value) || value.ok !== true) {
    throw new Error(record(value) && typeof value.error === "string" ? value.error : "Port-forward operation failed.");
  }
  const result: HelperPayload = { machines: [], ports: [], tunnels: [], reused: value.reused === true };
  if (command === "machines") result.machines = rows(value.machines, machineRow);
  if (command === "list") result.ports = rows(value.ports, portRow);
  if (command === "status") result.tunnels = rows(value.tunnels, tunnelRow);
  if (command === "start") {
    if (!tunnelRow(value.tunnel)) throw new Error("Port-forward helper returned an invalid tunnel.");
    result.tunnel = value.tunnel;
  }
  return result;
}
