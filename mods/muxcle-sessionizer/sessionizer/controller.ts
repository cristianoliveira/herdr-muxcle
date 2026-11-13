import {
  filterProjects,
  MAX_QUERY_CHARS,
  parseSessionizerConfig,
  parseSpaceMatch,
  sameMachineSpaceSnapshot,
  SessionizerError,
  type Project,
  type SessionizerConfig,
  type SpaceReference,
} from "./model.js";
import type { ConnectedMachine, PublishedProjects } from "./discovery.js";

export interface SessionizerAdapter {
  readConfig(): Promise<string | null>;
  discover(config: SessionizerConfig, publish: (state: PublishedProjects) => void): Promise<void>;
  spaces(): readonly SpaceReference[];
  connectedMachines(): Promise<readonly ConnectedMachine[]>;
  findSpace(folder: string, machine: string | null, spaces: readonly SpaceReference[]): Promise<string>;
  selectSpace(id: string): void;
  createSpace(folder: string, machine: string | null): void;
  close(): void;
}

export type SessionizerStatus = "loading" | "setup" | "ready" | "error" | "closed";

export interface SessionizerViewState {
  status: SessionizerStatus;
  message: string | null;
  query: string;
  projects: Project[];
  visibleProjects: Project[];
  selectedKey: string | null;
  warnings: string[];
  truncated: boolean;
  busy: boolean;
  refreshing: boolean;
}

interface MutableState {
  status: SessionizerStatus;
  message: string | null;
  query: string;
  projects: Project[];
  selectedKey: string | null;
  warnings: string[];
  truncated: boolean;
  busy: boolean;
  refreshing: boolean;
}

export class SessionizerController {
  private state: MutableState = {
    status: "loading",
    message: null,
    query: "",
    projects: [],
    selectedKey: null,
    warnings: [],
    truncated: false,
    busy: false,
    refreshing: false,
  };

  private loadStarted = false;
  private chooseStarted = false;
  private cancelled = false;
  private selectionInvalidated = false;

  constructor(
    private readonly adapter: SessionizerAdapter,
    private readonly configPath: string,
    private readonly onChange: () => void = () => {},
  ) {}

  snapshot(): SessionizerViewState {
    const visibleProjects = this.visibleProjects();
    return {
      ...this.state,
      projects: [...this.state.projects],
      visibleProjects,
      warnings: [...this.state.warnings],
    };
  }

  async load(): Promise<void> {
    if (this.loadStarted || this.cancelled) return;
    this.loadStarted = true;

    try {
      const rawConfig = await this.adapter.readConfig();
      if (this.cancelled) return;

      const config = parseSessionizerConfig(rawConfig);
      if (config.kind === "missing") {
        this.state = {
          ...this.state,
          status: "setup",
          message: `No config file at ${this.configPath}. Copy the bundled config.example.json there, add roots, then reopen this picker.`,
        };
        return;
      }
      if (config.kind === "empty") {
        this.state = {
          ...this.state,
          status: "setup",
          message: `Add one or more roots to ${this.configPath}, then reopen this picker. Use roots and remoteRoots for absolute paths, or homeRoots and connectedHomeRoots for paths beneath machine homes.`,
        };
        return;
      }
      if (config.kind === "invalid") {
        this.state = {
          ...this.state,
          status: "error",
          message: `${config.message} Fix ${this.configPath}, then reopen this picker.`,
        };
        return;
      }

      await this.adapter.discover(config, (result) => {
        if (this.cancelled) return;
        const selectedKey = this.state.selectedKey;
        const selectedProjectStillExists =
          selectedKey !== null && result.projects.some((project) => project.key === selectedKey);
        if (selectedKey !== null && !selectedProjectStillExists) this.selectionInvalidated = true;
        const nextSelectedKey = this.selectionInvalidated ? null : (selectedKey ?? result.projects[0]?.key ?? null);
        this.state = {
          ...this.state,
          status: "ready",
          message: this.selectionInvalidated
            ? "Selected project changed while refreshing. Choose a project again."
            : result.projects.length === 0 && !result.loading
              ? "No project folders found on configured machines."
              : null,
          projects: result.projects,
          selectedKey: nextSelectedKey,
          warnings: result.warnings,
          truncated: result.truncated,
          refreshing: result.loading,
        };
        this.onChange();
      });
    } catch (error) {
      if (this.cancelled) return;
      this.state = {
        ...this.state,
        status: "error",
        message:
          error instanceof SessionizerError
            ? error.message
            : "Could not load projects. Check the config and Python 3 installation.",
      };
    }
  }

  setQuery(query: string): void {
    if (this.state.status !== "ready" || this.cancelled) return;
    const boundedQuery = query.slice(0, MAX_QUERY_CHARS);
    const projects = filterProjects(this.state.projects, boundedQuery);
    this.selectionInvalidated = false;
    this.state = {
      ...this.state,
      query: boundedQuery,
      selectedKey: projects[0]?.key ?? null,
      message: null,
    };
  }

  moveSelection(delta: -1 | 1): void {
    if (this.state.status !== "ready" || this.cancelled) return;
    const projects = this.visibleProjects();
    if (projects.length === 0) return;

    const currentIndex = projects.findIndex((project) => project.key === this.state.selectedKey);
    const nextIndex = currentIndex < 0 ? 0 : Math.max(0, Math.min(projects.length - 1, currentIndex + delta));
    this.selectionInvalidated = false;
    this.state = { ...this.state, selectedKey: projects[nextIndex].key, message: null };
  }

  chooseSelected(): Promise<boolean> {
    return this.state.selectedKey === null ? Promise.resolve(false) : this.choose(this.state.selectedKey);
  }

  async choose(projectKey: string): Promise<boolean> {
    if (this.cancelled || this.state.status !== "ready" || this.chooseStarted) return false;
    const project = this.visibleProjects().find((entry) => entry.key === projectKey);
    if (!project) {
      this.state = { ...this.state, message: "That selection is no longer visible. Choose a project again." };
      return false;
    }

    this.chooseStarted = true;
    this.state = { ...this.state, busy: true, message: null };
    try {
      let snapshot = [...this.adapter.spaces()];
      const machine = project.machine;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (this.cancelled) return false;
        if (machine !== null) {
          const current = await this.isCurrentMachine(project);
          if (this.cancelled) return false;
          if (!current) {
            throw new SessionizerError(
              `Machine ${machine} is no longer connected. Reopen the picker; no local space was opened.`,
            );
          }
        }
        const targetSpaces = snapshot.filter((space) => space.machine === machine);
        const match = parseSpaceMatch(await this.adapter.findSpace(project.path, machine, targetSpaces));
        if (this.cancelled) return false;
        if (!this.visibleProjects().some((entry) => entry.key === projectKey)) {
          throw new SessionizerError("That selection is no longer visible. Choose a project again.");
        }
        if (match.kind === "folder-missing") {
          throw new SessionizerError("That folder is no longer available. Reopen the picker and try again.");
        }

        const machineDisconnected = machine !== null && !(await this.isCurrentMachine(project));
        if (this.cancelled) return false;
        if (!this.visibleProjects().some((entry) => entry.key === projectKey)) {
          throw new SessionizerError("That selection is no longer visible. Choose a project again.");
        }
        const latest = [...this.adapter.spaces()];
        const targetChanged = !sameMachineSpaceSnapshot(snapshot, latest, machine);
        if (targetChanged || machineDisconnected) {
          if (attempt === 0 && !machineDisconnected) {
            snapshot = latest;
            continue;
          }
          throw new SessionizerError(
            machineDisconnected
              ? `Machine ${machine} disconnected while selecting. No local space was opened.`
              : "Spaces on the selected machine changed while selecting. Choose the project again.",
          );
        }

        if (match.spaceId !== null && !targetSpaces.some((space) => space.id === match.spaceId)) {
          throw new SessionizerError("Space lookup returned an unknown machine-scoped space.");
        }
        if (match.spaceId !== null) this.adapter.selectSpace(match.spaceId);
        else this.adapter.createSpace(project.path, machine);
        this.cancelled = true;
        this.state = { ...this.state, status: "closed", busy: false };
        try {
          this.adapter.close();
        } catch {
          // The selected Herdr command has already been dispatched.
        }
        return true;
      }
    } catch (error) {
      if (!this.cancelled) {
        this.state = {
          ...this.state,
          message:
            error instanceof SessionizerError
              ? error.message
              : "Could not open that project. Check Herdr and try again.",
        };
      }
    } finally {
      this.chooseStarted = false;
      if (!this.cancelled) this.state = { ...this.state, busy: false };
    }

    return false;
  }

  dispose(): boolean {
    if (this.cancelled) return false;
    this.cancelled = true;
    this.state = { ...this.state, status: "closed", busy: false };
    return true;
  }

  cancel(): boolean {
    if (!this.dispose()) return false;
    try {
      this.adapter.close();
    } catch {
      // The overlay may already have closed through another host action.
    }
    return true;
  }

  private visibleProjects(): Project[] {
    return filterProjects(this.state.projects, this.state.query);
  }

  private async isCurrentMachine(project: Project): Promise<boolean> {
    if (project.machine === null || project.machineId === null) return project.machine === null;
    const machines = await this.adapter.connectedMachines();
    return machines.some((machine) => machine.name === project.machine && machine.id === project.machineId);
  }
}
