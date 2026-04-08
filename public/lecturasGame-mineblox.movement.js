import { withGameVersion } from "./lecturasGame-build.js";

const runtime = await import(withGameVersion("./lecturasGame-mineblox/runtime/movement-controller.js"));

export const createASCraftMovementController = runtime.createASCraftMovementController;
export const createASCraftCollisionBroadphase = runtime.createASCraftCollisionBroadphase;
