import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:5000"
).replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [twoFactorClient()],
});

export const { useSession } = authClient;
