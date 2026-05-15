import { Email } from "@convex-dev/auth/providers/Email";
import Google from "@auth/core/providers/google";

export default {
  providers: [
    Email({
      id: "magic-link",
      authorize: undefined,
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
          throw new Error("Failed to send verification email");
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    }),
  ],
};
