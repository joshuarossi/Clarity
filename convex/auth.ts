import { convexAuth } from "@convex-dev/auth/server";
import type { GenericMutationCtx, AnyDataModel } from "convex/server";
import { ConvexError, type GenericId } from "convex/values";
import { getUserByEmail } from "./lib/auth.js";
import authConfig from "./auth.config.js";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: authConfig.providers,
  callbacks: {
    createOrUpdateUser: async (
      ctx: GenericMutationCtx<AnyDataModel>,
      args: {
        existingUserId: GenericId<"users"> | null;
        profile: Record<string, unknown> & { email?: string };
      },
    ) => {
      const { existingUserId, profile } = args;
      if (existingUserId) return existingUserId;
      const email = profile.email;
      if (!email)
        throw new ConvexError({
          code: "INVALID_ARGUMENT" as const,
          message: "Email is required for sign-in",
          httpStatus: 400,
        });
      const user = await getUserByEmail(
        ctx as Parameters<typeof getUserByEmail>[0],
        email,
      );
      return user._id;
    },
  },
});
