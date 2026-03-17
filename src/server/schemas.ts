import { z } from "zod";

const emptyShape = {};
const byNodeShape = { node: z.string().min(1) };
const byVmShape = { node: z.string().min(1), vmid: z.number().int().positive() };
const byContainerShape = { node: z.string().min(1), vmid: z.number().int().positive() };
const execInContainerShape = {
  ctid: z.number().int().positive(),
  command: z.string().min(1)
};
const dockerLogsShape = {
  ctid: z.number().int().positive(),
  containerName: z.string().min(1),
  tail: z.number().int().positive().max(2000).default(200)
};
const dockerPsShape = {
  ctid: z.number().int().positive()
};
const remoteDiagnosticShape = {
  ctid: z.number().int().positive(),
  command: z.string().min(1)
};

export const schemas = {
  emptyShape,
  byNodeShape,
  byNodeOptionalShape: { node: byNodeShape.node.optional() },
  byVmShape,
  byContainerShape,
  execInContainerShape,
  dockerLogsShape,
  dockerPsShape,
  remoteDiagnosticShape,
  empty: z.object(emptyShape).strict(),
  byNode: z.object(byNodeShape),
  byVm: z.object(byVmShape),
  byContainer: z.object(byContainerShape),
  execInContainer: z.object(execInContainerShape),
  dockerLogs: z.object(dockerLogsShape),
  dockerPs: z.object(dockerPsShape),
  remoteDiagnostic: z.object(remoteDiagnosticShape)
} as const;
