import { InMemorySessionManagerTemplate } from "../session-managers/in-memory/index.js";
import { registerSessionManager } from "./registry.js";

registerSessionManager("in-memory", InMemorySessionManagerTemplate);
