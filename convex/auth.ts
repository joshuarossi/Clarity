import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import Google from "@auth/core/providers/google";
import type { GenericMutationCtx, AnyDataModel } from "convex/server";
import { ConvexError, type GenericId } from "convex/values";
import { getUserByEmail } from "./lib/auth.js";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Email({
      authorize: undefined,
      id: "magic-link",
      sendVerificationRequest: async ({
        identifier: email,
        url,
      }: {
        identifier: string;
        url: string;
      }) => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:
              process.env.AUTH_EMAIL_FROM ?? "Clarity <noreply@clarity.app>",
            to: email,
            subject: "Sign in to Clarity",
            html: `<a href="${url}">Click here to sign in to Clarity</a>`,
          }),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "(no body)");
          throw new Error(
            `Failed to send verification email: ${response.status} ${body}`,
          );
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    }),
  ],
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
