import { Email } from "@convex-dev/auth/providers/Email";
import Google from "@auth/core/providers/google";

const emailProvider = Email({
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
        from: process.env.AUTH_EMAIL_FROM ?? "Clarity <noreply@clarity.app>",
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
});

const googleProvider = Google({
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
});

export default {
  providers: [
    { ...emailProvider, id: "magic-link" as const },
    {
      ...googleProvider,
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    },
  ],
};
