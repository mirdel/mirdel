import { app } from "electron";
import path from "node:path";

const userDataDirName = app.isPackaged ? "Mirdel" : "Mirdel Dev";
app.setPath("userData", path.join(app.getPath("appData"), userDataDirName));
