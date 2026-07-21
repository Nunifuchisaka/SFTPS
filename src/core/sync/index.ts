export type {
  SyncEntry,
  SyncAction,
  SyncActionType,
  CompareBy,
  PlanOptions,
} from './types';
export { DEFAULT_IGNORE, isIgnored } from './ignore';
export { walkTree, type WalkOptions } from './walk';
export { planSync, summarizePlan, type PlanSummary } from './planner';
export { runSync, type RunSyncContext, type RunSyncResult } from './runner';
export {
  validateSyncDestination,
  confirmMirrorDeletion,
  type SyncDestinationCheck,
  type SyncDestinationLevel,
  type MirrorDeletionConfirm,
} from './guard';
