/**
 * Types for `next-version.mjs`.
 *
 * Declared here rather than by enabling `allowJs`, which would pull every
 * script in this directory into the typecheck program.
 */

export type BumpLevel = "major" | "minor" | "patch" | "none";

export type CommitClassification = {
  subject: string;
  /** `null` when the commit was ignored rather than classified. */
  level: BumpLevel | null;
  reason: string;
};

export type Classification = {
  level: BumpLevel;
  releasable: boolean;
  considered: CommitClassification[];
  ignored: CommitClassification[];
};

export declare const classifyCommit: (message: unknown) => CommitClassification;
export declare const classify: (messages: readonly unknown[]) => Classification;
export declare const nextVersion: (current: string, level: BumpLevel) => string;
export declare const commitsSinceLastTag: () => string[];
