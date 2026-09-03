import { useQuery } from "@tanstack/react-query";

import { fetchDeckRegistrationEnabled } from "@/lib/deck";

const DECK_FEATURE_QUERY_KEY = ["feature-flag", "deck-registration"] as const;

/** Keeps every Deck/Combo surface in sync with the developer feature switch. */
export function useDeckRegistrationEnabled(tournamentId?: string | null) {
  const query = useQuery({
    queryKey: [...DECK_FEATURE_QUERY_KEY, tournamentId],
    queryFn: () => fetchDeckRegistrationEnabled(tournamentId!),
    enabled: !!tournamentId,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 4_000,
    retry: false,
  });

  // Keep tenant-controlled features hidden until the tournament-scoped flag is known.
  return query.data ?? false;
}
