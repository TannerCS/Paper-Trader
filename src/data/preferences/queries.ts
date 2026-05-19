import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  terminalPreferencesRepository,
  type TerminalPreferences,
} from "./terminalPreferences";

export const preferencesQueryKeys = {
  terminal: ["terminalPreferences"] as const,
};

export function useTerminalPreferences() {
  return useQuery({
    queryKey: preferencesQueryKeys.terminal,
    queryFn: () => terminalPreferencesRepository.getTerminalPreferences(),
  });
}

export function useSaveTerminalPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: TerminalPreferences) => terminalPreferencesRepository.saveTerminalPreferences(preferences),
    onSuccess: async (_result, preferences) => {
      queryClient.setQueryData(preferencesQueryKeys.terminal, preferences);
    },
  });
}
