import {
  filterProjects,
  MAX_QUERY_CHARS,
  parseProjectDiscovery,
  parseSessionizerConfig,
  parseSpaceMatch,
  sameLocalSpaceSnapshot,
  SessionizerError,
  type Project,
  type ProjectDiscovery,
  type SpaceReference,
} from "./model.js";

export interface SessionizerAdapter {
  readConfig(): Promise<string | null>;
  discover(roots: readonly string[]): Promise<string>;
  spaces(): readonly SpaceReference[];
  findLocalSpace(folder: string, spaces: readonly SpaceReference[]): Promise<string>;
  selectSpace(id: string): void;
  createLocalSpace(folder: string): void;
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
  };

  private loadStarted = false;
  private chooseStarted = false;
  private cancelled = false;

  constructor(
    private readonly adapter: SessionizerAdapter,
    private readonly configPath: string,
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
          message: `Add one or more absolute project roots to ${this.configPath}, then reopen this picker.`,
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

      const output = await this.adapter.discover(config.roots);
      if (this.cancelled) return;
      const result: ProjectDiscovery = parseProjectDiscovery(output);
      this.state = {
        ...this.state,
        status: "ready",
        message: result.projects.length === 0 ? "No project folders found. Check the configured roots." : null,
        projects: result.projects,
        selectedKey: result.projects[0]?.key ?? null,
        warnings: result.warnings,
        truncated: result.truncated,
      };
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
    this.state = { ...this.state, selectedKey: projects[nextIndex].key };
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
      for (let attempt = 0; attempt < 2; attempt++) {
        const localSpaces = snapshot.filter((space) => space.machine === null);
        const match = parseSpaceMatch(await this.adapter.findLocalSpace(project.path, localSpaces));
        if (this.cancelled) return false;
        if (match.kind === "folder-missing") {
          throw new SessionizerError("That folder is no longer available. Reopen the picker and try again.");
        }

        const latest = [...this.adapter.spaces()];
        if (!sameLocalSpaceSnapshot(snapshot, latest)) {
          if (attempt === 0) {
            snapshot = latest;
            continue;
          }
          throw new SessionizerError("Your local spaces changed while selecting. Choose the project again.");
        }

        if (match.spaceId !== null && !localSpaces.some((space) => space.id === match.spaceId)) {
          throw new SessionizerError("Space lookup returned an unknown local space.");
        }
        if (match.spaceId !== null) this.adapter.selectSpace(match.spaceId);
        else this.adapter.createLocalSpace(project.path);
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
}
