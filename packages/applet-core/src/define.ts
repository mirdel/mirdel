import type { Action, AppletScript } from "./types";

function assertMethod(name: "init" | "onAction" | "render", value: unknown): void {
  if (typeof value !== "function") {
    throw new Error(`Invalid applet definition: "${name}" must be a function.`);
  }
}

export function defineApplet<
  TState extends Record<string, unknown>,
  TAction extends Action = Action,
>(script: AppletScript<TState, TAction>): AppletScript<TState, TAction> {
  if (!script || typeof script !== "object") {
    throw new Error("Invalid applet definition: expected an object from defineApplet(...).");
  }
  const row = script as Partial<AppletScript<TState, TAction>>;
  assertMethod("init", row.init);
  assertMethod("onAction", row.onAction);
  assertMethod("render", row.render);
  return script;
}
