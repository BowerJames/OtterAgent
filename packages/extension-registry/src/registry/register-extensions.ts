import { NoOpExtensionTemplate } from "../extensions/no-op/index.js";
import { registerExtension } from "./registry.js";

registerExtension("no-op", NoOpExtensionTemplate);
