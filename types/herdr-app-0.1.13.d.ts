// Minimal compile-time surface copied from the installed Herdr 0.1.13
// gpui-kit.d.ts. The shipped scaffold only extends View and returns a string;
// add more declarations from the matching installed types when code needs them.
declare module "gpui-kit" {
  export abstract class View {
    abstract render(cx: unknown): string | object;
  }
}
