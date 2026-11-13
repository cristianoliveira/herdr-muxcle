import { View, div, image, type Context, type FocusHandle, type NativeElement } from "gpui-kit";
import { h_flex, Input, InputState, v_flex, type InputState as InputStateType } from "gpui-base";
import { appHome, closeOverlay, exec, focused, machines, props, spaces, theme } from "herdr";
import { fitImage, imagePath, previewAsset, type PreviewResult } from "./model.js";

interface ImagePreviewOptions extends Record<string, unknown> {
  machine?: string;
  cwd?: string;
  path?: string;
}

interface LoadedPreview extends PreviewResult {
  asset: string;
  source: string;
  machine: string;
}

export default class ImagePreview extends View {
  machine = "";
  cwd = "";
  handle!: FocusHandle;
  preview: LoadedPreview | null = null;
  error = "";
  loading = false;
  controls = true;
  input!: InputStateType;

  init(options: ImagePreviewOptions = {}, cx: Context): void {
    const context = focused();
    const space = spaces().find((candidate) => candidate.id === context?.space);
    this.machine = options.machine ?? space?.machine ?? "";
    this.cwd = options.cwd ?? (this.machine === (space?.machine || "") ? (context?.cwd ?? space?.folder ?? "") : "");
    this.handle = cx.focus_handle();
    this.preview = null;
    this.error = "";
    this.loading = false;
    this.controls = true;

    const path = typeof options.path === "string" ? options.path : "";
    this.input = InputState.new({ value: path, placeholder: "Image path (PNG or JPEG)…" });
    this.input.on("submit", (_event, context) => this.load(context));
    this.input.focus();
    if (path) {
      this.load(cx);
      return;
    }

    cx.spawn(async (context) => {
      try {
        const result = await exec("python3", [`${appHome()}/mods/muxcle-image-preview/preview.py`, "--clipboard"]);
        if (result.code === 0) {
          const output: unknown = JSON.parse(result.stdout);
          if (
            typeof output === "object" &&
            output !== null &&
            "path" in output &&
            typeof output.path === "string" &&
            !this.input.value()
          ) {
            this.input.set_value(imagePath(output.path));
            this.load(context);
          }
        }
      } catch {
        // Manual paste remains available when no clipboard path is available.
      }
      context.notify();
    });
  }

  load(cx: Context): void {
    if (this.loading) return;

    let path: string;
    try {
      path = imagePath(this.input.value());
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Paste one image file path, not a URL.";
      cx.notify();
      return;
    }

    this.loading = true;
    this.error = "";
    const machine = this.machine;
    const cwd = this.cwd;
    cx.spawn(async (context) => {
      try {
        const home = appHome();
        const result = await exec("python3", [
          `${home}/mods/muxcle-image-preview/preview.py`,
          path,
          "--machine",
          machine,
          "--cwd",
          cwd,
          "--cache",
          `${home}/image-previews`,
        ]);
        if (result.code !== 0) throw new Error(result.stderr.trim() || "Image could not be loaded.");

        const data: unknown = JSON.parse(result.stdout);
        const asset = previewAsset(data, home);
        const preview = data as PreviewResult;
        this.preview = { ...preview, asset, source: path, machine };
        this.controls = false;
        this.handle.focus();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Image could not be loaded.";
      }
      this.loading = false;
      context.notify();
    });
  }

  selectMachine(machine: string, cx: Context): void {
    if (this.loading) return;
    this.machine = machine;
    this.controls = true;
    this.cwd = spaces().find((space) => (space.machine || "") === machine && space.active)?.folder ?? "";
    this.preview = null;
    this.error = "";
    this.input.focus();
    cx.notify();
  }

  render(_cx: Context): NativeElement {
    const colors = theme();
    const viewport = window.viewport_size();
    const width = viewport.width;
    const height = viewport.height;
    const editing = this.controls || !this.preview;
    const names = [
      ...new Set([
        "",
        this.machine,
        ...machines()
          .filter((machine) => machine.layout === "ready")
          .map((machine) => machine.name || ""),
      ]),
    ];
    const size = this.preview
      ? fitImage(
          this.preview.width,
          this.preview.height,
          Math.max(1, width - (editing ? 24 : 0)),
          Math.max(1, height - (editing ? 160 : 0)),
        )
      : null;

    return v_flex()
      .id("image-preview")
      .track_focus(this.handle)
      .w(width)
      .h(height)
      .p(editing ? 12 : 0)
      .gap(editing ? 8 : 0)
      .bg(colors.popover)
      .text_size(13)
      .on_drop((event, cx) => {
        if (this.loading || !event.paths.length) return;
        this.selectMachine("", cx);
        this.input.set_value(event.paths[0]);
        this.load(cx);
      })
      .on_key_down((event, cx) => {
        if (event.key === "escape") closeCurrentOverlay();
        else if (!editing && event.key === "e") {
          this.controls = true;
          this.input.focus();
          cx.notify();
        } else if (event.keystroke === "alt-m") {
          this.selectMachine(names[(names.indexOf(this.machine) + 1) % names.length], cx);
        } else return;
        cx.stop_propagation();
      })
      .when(editing, (root) =>
        root.child(
          h_flex()
            .justify_between()
            .items_center()
            .child(div().font_semibold().text_color(colors.foreground).child("Image preview"))
            .child(
              div()
                .id("image-close")
                .cursor_pointer()
                .text_color(colors.muted)
                .child("Close · Esc")
                .on_click(() => closeCurrentOverlay()),
            ),
        ),
      )
      .when(editing, (root) =>
        root.child(
          h_flex()
            .gap(8)
            .items_center()
            .children(
              names.map((machine) =>
                div()
                  .id(`image-machine-${machine || "local"}`)
                  .px(10)
                  .py(5)
                  .rounded(5)
                  .cursor_pointer()
                  .bg(machine === this.machine ? colors.selected : colors.background)
                  .text_color(colors.foreground)
                  .child(machine || "local")
                  .on_click((_event, cx) => this.selectMachine(machine, cx)),
              ),
            ),
        ),
      )
      .when(editing, (root) =>
        root.child(
          h_flex()
            .gap(8)
            .items_center()
            .child(
              Input.new(this.input)
                .h(36)
                .flex_1()
                .px(10)
                .bg(colors.background)
                .text_color(colors.foreground)
                .rounded(5),
            )
            .child(
              div()
                .id("image-load")
                .px(12)
                .py(8)
                .rounded(5)
                .bg(colors.selected)
                .text_color(colors.foreground)
                .cursor_pointer()
                .child(this.loading ? "Loading…" : "Open · Enter")
                .on_click((_event, cx) => this.load(cx)),
            ),
        ),
      )
      .child(
        div()
          .relative()
          .flex_1()
          .min_h(0)
          .w_full()
          .overflow_hidden()
          .bg(colors.background)
          .flex()
          .items_center()
          .justify_center()
          .child(
            this.preview && size
              ? image(this.preview.asset).w(size.width).h(size.height)
              : div()
                  .text_color(colors.muted)
                  .child(
                    this.loading
                      ? "Loading image…"
                      : "Paste a path above, drop an image here, or copy its path before opening.",
                  ),
          )
          .when(!editing, (canvas) =>
            canvas.child(
              h_flex()
                .absolute()
                .top(8)
                .right(8)
                .gap(12)
                .px(10)
                .py(6)
                .rounded(5)
                .bg(colors.popover)
                .text_color(colors.muted)
                .child(
                  div()
                    .id("image-edit")
                    .cursor_pointer()
                    .child("Edit · E")
                    .on_click((_event, cx) => {
                      this.controls = true;
                      this.input.focus();
                      cx.notify();
                    }),
                )
                .child(
                  div()
                    .id("image-close")
                    .cursor_pointer()
                    .child("Close · Esc")
                    .on_click(() => closeCurrentOverlay()),
                ),
            ),
          ),
      )
      .when(Boolean(this.error), (element) => element.child(div().text_color(colors.blocked).child(this.error)))
      .when(editing, (root) =>
        root.child(
          div()
            .text_size(11)
            .text_color(colors.dim)
            .truncate()
            .child(
              this.preview
                ? `${this.preview.machine || "local"} · ${this.preview.source} · ${this.preview.width} × ${this.preview.height} · Alt-m machine · Esc close`
                : "PNG/JPEG · Up to 16 MiB / 25 megapixels · Drop image to open · Alt-m machine · Esc close",
            ),
        ),
      );
  }
}

function closeCurrentOverlay(): void {
  const overlay = props()?.overlay;
  if (overlay) closeOverlay(overlay);
}
