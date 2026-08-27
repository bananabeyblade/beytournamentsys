import { useQuery } from "@tanstack/react-query";

import { fetchDeckRegistrationEnabled } from "@/lib/deck";

const DECK_FEATURE_QUERY_KEY = ["feature-flag", "deck-registration"] as const;

/** Keeps every Deck/Combo surface in sync with the developer feature switch. */
export function useDeckRegistrationEnabled() {
  const query = useQuery({
    queryKey: DECK_FEATURE_QUERY_KEY,
    queryFn: fetchDeckRegistrationEnabled,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 4_000,
    retry: false,
  });

  // Preserve the existing fail-open behaviour if the flag cannot be read.
  return query.data ?? true;
}
