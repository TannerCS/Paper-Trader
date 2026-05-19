import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { replayRepository } from "./replayRepository";
import type { ReplaySession } from "./types";

export const replayQueryKeys = {
  sessions: ["strategyReplaySessions"] as const,
};

export function useReplaySessions() {
  return useQuery({
    queryKey: replayQueryKeys.sessions,
    queryFn: () => replayRepository.listSessions(),
  });
}

export function useSaveReplaySession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (session: ReplaySession) => replayRepository.saveSession(session),
    onMutate: async (session) => {
      await queryClient.cancelQueries({ queryKey: replayQueryKeys.sessions });
      queryClient.setQueryData<ReplaySession[]>(replayQueryKeys.sessions, (currentSessions = []) => [
        session,
        ...currentSessions.filter((candidateSession) => candidateSession.id !== session.id),
      ]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: replayQueryKeys.sessions });
    },
  });
}

export function useDeleteReplaySession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => replayRepository.deleteSession(sessionId),
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: replayQueryKeys.sessions });
      queryClient.setQueryData<ReplaySession[]>(replayQueryKeys.sessions, (currentSessions = []) =>
        currentSessions.filter((session) => session.id !== sessionId),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: replayQueryKeys.sessions });
    },
  });
}
