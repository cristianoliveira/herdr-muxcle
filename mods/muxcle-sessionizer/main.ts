import { appHome, closeOverlay, exec, home, props, readTextFile, run, spaces, theme } from "herdr";
import { createSessionizerAdapter, type NativeSessionizerApi } from "./sessionizer/adapter.js";
import { View, div, type AsyncContext, type Context, type KeyEvent, type NativeElement } from "gpui-kit";
import { h_flex, Input, InputState, v_flex, v_virtual_list, VirtualListScrollHandle, type ItemRange } from "gpui-base";
import { SessionizerController } from "./sessionizer/controller.js";
import type { Project } from "./sessionizer/model.js";

const MOD_NAME = "muxcle-sessionizer";
interface SessionizerPalette {
  background: string;
  foreground: string;
  dim: string;
  accent: string;
  border: string;
  hover: string;
}

export default class MuxcleSessionizer extends View {
  private input!: InputState;
  private focus!: ReturnType<Context["focus_handle"]>;
  private scroll!: VirtualListScrollHandle;
  private controller!: SessionizerController;

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.input = InputState.new({ placeholder: "Search project folders…" });
    this.focus = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    const configPath = appHomePath("data", MOD_NAME, "config.json");
    this.controller = new SessionizerController(
      createSessionizerAdapter(nativeApi, configPath, appHomePath("mods", MOD_NAME), props()?.overlay),
      configPath,
    );

    this.input.on("change", (_event, eventCx) => {
      this.controller.setQuery(this.input.value());
      this.scrollToSelection();
      eventCx.notify();
    });
    this.input.on("submit", (_event, eventCx) => this.launchSelected(eventCx));

    this.input.focus();
    cx.spawn(async (taskCx) => {
      await this.controller.load();
      taskCx.notify();
    });
  }

  close(): void {
    this.controller?.dispose();
  }

  render(_cx: Context): NativeElement {
    const currentTheme = theme();
    const palette: SessionizerPalette = {
      background: currentTheme.background,
      foreground: currentTheme.foreground,
      dim: currentTheme.dim,
      accent: currentTheme.accent,
      border: currentTheme.border,
      hover: currentTheme.hover,
    };
    const state = this.controller.snapshot();
    const surface = v_flex()
      .track_focus(this.focus)
      .on_key_down((event, cx) => this.onKeyDown(event, cx))
      .w(600)
      .max_h(620)
      .rounded(12)
      .border_1()
      .border_color(palette.border)
      .bg(palette.background)
      .p(14)
      .gap(10);

    surface.child(
      h_flex().items_center().justify_between()
        .child(div().font_semibold().text_size(15).text_color(palette.foreground).child("Sessionizer"))
        .child(div().text_size(11).text_color(palette.dim).child("Esc to close")),
    );
    surface.child(
      h_flex().h(38).items_center().rounded(8).border_1().border_color(palette.border).px(10)
        .child(Input.new(this.input).flex_1().h(32).text_size(13).text_color(palette.foreground)),
    );

    if (state.status === "ready") {
      if (state.visibleProjects.length > 0) {
        surface.child(this.projectList(state.visibleProjects, state.selectedKey, palette));
      } else {
        surface.child(this.emptyList(state.message ?? "No project matches that search.", palette));
      }
    } else {
      surface.child(this.emptyList(state.message ?? "Loading project folders…", palette));
    }

    if (state.status === "ready" && state.message && state.visibleProjects.length > 0) {
      surface.child(div().text_size(12).text_color(palette.foreground).child(safeDisplayText(state.message)));
    }

    if (state.warnings.length > 0) {
      const warningText = state.warnings.slice(0, 3).map(safeDisplayText);
      if (state.warnings.length > warningText.length) {
        warningText.push(`${state.warnings.length - warningText.length} more root warnings`);
      }
      surface.child(
        v_flex().gap(3).children(warningText.map((warning) =>
          div().text_size(11).text_color(palette.dim).child(warning))),
      );
    }

    const footer = state.truncated
      ? "Showing the first 500 folders. Narrow the configured roots to see more."
      : `${state.visibleProjects.length} projects · ↑/↓ or Ctrl-J/Ctrl-K · Enter to open`;
    surface.child(div().text_size(11).text_color(palette.dim).child(state.busy ? "Opening project…" : footer));
    return surface;
  }

  private projectList(projects: readonly Project[], selectedKey: string | null, palette: SessionizerPalette): NativeElement {
    return v_flex().h(320).min_h(0).child(
      v_virtual_list(
        "muxcle-sessionizer-projects",
        projects.length,
        48,
        (index) => projects[index].key,
        (range: ItemRange) => projects.slice(range.start, range.end)
          .map((project) => this.projectRow(project, project.key === selectedKey, palette)),
      )
        .track_scroll(this.scroll)
        .on_item_click((key, cx) => this.launch(key, cx)),
    );
  }

  private projectRow(project: Project, selected: boolean, palette: SessionizerPalette): NativeElement {
    const border = selected ? palette.accent : palette.background;
    return h_flex().h(46).px(9).gap(10).items_center().rounded(7).border_1().border_color(border)
      .hover((element) => element.bg(palette.hover))
      .child(
        v_flex().flex_1().min_h(0)
          .child(div().text_size(13).text_color(palette.foreground).child(safeDisplayText(project.name)))
          .child(div().text_size(10).text_color(palette.dim).child(shortPath(project.path))),
      );
  }

  private emptyList(message: string, palette: SessionizerPalette): NativeElement {
    return v_flex().h(180).min_h(0).items_center().justify_between().p(12)
      .child(div().text_size(12).text_color(palette.dim).child(safeDisplayText(message)));
  }

  private onKeyDown(event: KeyEvent, cx: Context): void {
    if (event.keystroke === "escape") {
      this.controller.cancel();
      cx.stop_propagation();
      return;
    }

    if (event.keystroke === "down" || event.keystroke === "ctrl-j") {
      this.controller.moveSelection(1);
      this.scrollToSelection();
      cx.stop_propagation();
      cx.notify();
    } else if (event.keystroke === "up" || event.keystroke === "ctrl-k") {
      this.controller.moveSelection(-1);
      this.scrollToSelection();
      cx.stop_propagation();
      cx.notify();
    }
  }

  private launchSelected(cx: Context): void {
    const state = this.controller.snapshot();
    if (state.selectedKey !== null) this.launch(state.selectedKey, cx);
  }

  private launch(key: string, cx: Context): void {
    const operation = this.controller.choose(key);
    cx.notify();
    cx.spawn(async (taskCx) => {
      await operation;
      taskCx.notify();
    });
  }

  private scrollToSelection(): void {
    const state = this.controller.snapshot();
    const index = state.visibleProjects.findIndex((project) => project.key === state.selectedKey);
    if (index >= 0) this.scroll.scroll_to_item(index, "center");
  }
}

const nativeApi: NativeSessionizerApi = {
  readTextFile: (path) => readTextFile(path),
  exec: (command, args, options) => exec(command, args, options),
  spaces: () => spaces(),
  home: () => home(),
  run: (name, args) => run(name, args),
  closeOverlay: (id) => closeOverlay(id),
};

function appHomePath(...parts: string[]): string {
  const base = appHome();
  const separator = base.includes("\\") ? "\\" : "/";
  const trimmedBase = base.replace(/[\\/]+$/, "");
  return [trimmedBase, ...parts].join(separator);
}

function shortPath(path: string): string {
  const display = safeDisplayText(path);
  return display.length <= 76 ? display : `…${display.slice(-75)}`;
}

function safeDisplayText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
