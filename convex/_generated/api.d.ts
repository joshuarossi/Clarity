/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_templateVersions from "../admin/templateVersions.js";
import type * as admin_templates from "../admin/templates.js";
import type * as cases from "../cases.js";
import type * as draftCoach from "../draftCoach.js";
import type * as invites from "../invites.js";
import type * as jointChat from "../jointChat.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as privateCoaching from "../privateCoaching.js";
import type * as seed from "../seed.js";
import type * as synthesis from "../synthesis.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/templateVersions": typeof admin_templateVersions;
  "admin/templates": typeof admin_templates;
  cases: typeof cases;
  draftCoach: typeof draftCoach;
  invites: typeof invites;
  jointChat: typeof jointChat;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/prompts": typeof lib_prompts;
  "lib/stateMachine": typeof lib_stateMachine;
  privateCoaching: typeof privateCoaching;
  seed: typeof seed;
  synthesis: typeof synthesis;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
