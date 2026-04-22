import { InMemoryAuthStorageTemplate } from "../auth-storages/in-memory/index.js";
import { registerAuthStorage } from "./registry.js";

registerAuthStorage("in-memory", InMemoryAuthStorageTemplate);
