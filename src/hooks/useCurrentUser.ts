import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { type Doc } from "../../convex/_generated/dataModel";

export function useCurrentUser(): {
  user: Doc<"users"> | null | undefined;
  isLoading: boolean;
} {
  const user = useQuery(api.users.me);
  return {
    user,
    isLoading: user === undefined,
  };
}
