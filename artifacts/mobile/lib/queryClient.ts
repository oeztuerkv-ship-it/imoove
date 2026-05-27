import { QueryClient } from "@tanstack/react-query";

/** Singleton — auch für Logout (`queryClient.clear()`). */
export const queryClient = new QueryClient();
