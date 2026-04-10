type AppletAction = import("@mirdel/applet-core").Action;
type AppletActionOf<TMap extends import("@mirdel/applet-core").ActionPayloadMap> = import("@mirdel/applet-core").ActionOf<TMap>;
type AppletCtx<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TAction extends import("@mirdel/applet-core").Action = import("@mirdel/applet-core").Action,
> = import("@mirdel/applet-core").AppletCtx<TState, TAction>;
type AppletScript<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TAction extends import("@mirdel/applet-core").Action = import("@mirdel/applet-core").Action,
> = import("@mirdel/applet-core").AppletScript<TState, TAction>;

declare module "*.json" {
  const value: any;
  export default value;
}
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.jpeg" {
  const src: string;
  export default src;
}
declare module "*.gif" {
  const src: string;
  export default src;
}
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.webp" {
  const src: string;
  export default src;
}
declare module "*.css" {
  const text: string;
  export default text;
}

declare namespace JSX {
  type Element = import("@mirdel/applet-core").UINode;
  interface ElementChildrenAttribute {
    children: {};
  }
  interface IntrinsicElements {
    [elemName: string]: never;
  }
}
