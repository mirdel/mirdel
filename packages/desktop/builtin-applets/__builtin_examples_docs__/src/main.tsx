import { defineApplet } from "@mirdel/applet-core";
import { onAction } from "./onAction";
import { render } from "./render";
import { createInitialState } from "./utils";

const applet = defineApplet({
  init() {
    return createInitialState();
  },
  onAction,
  render,
});

export default applet;
