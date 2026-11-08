// Hand-maintained subset of Herdr 0.1.13's installed gpui-kit.d.ts.
// The actual render accepts Context and returns Element | Entity | string.
// This scaffold uses only string rendering and never accesses its context.
// Add matching installed declarations before using more of the native API.
declare module "gpui-kit" {
  export abstract class View {
    abstract render(cx: unknown): string;
  }
}
