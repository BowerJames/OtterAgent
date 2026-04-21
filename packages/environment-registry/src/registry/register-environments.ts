import { NoOpAgentEnvironmentTemplate } from "../environments/no-op/index.js";
import { registerEnvironment } from "./registry.js";

registerEnvironment("no-op", NoOpAgentEnvironmentTemplate);
