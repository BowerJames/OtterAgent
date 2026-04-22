import { JustBashAgentEnvironmentTemplate } from "../environments/just-bash/index.js";
import { NoOpAgentEnvironmentTemplate } from "../environments/no-op/index.js";
import { registerEnvironment } from "./registry.js";

registerEnvironment("no-op", NoOpAgentEnvironmentTemplate);
registerEnvironment("just-bash", JustBashAgentEnvironmentTemplate);
