import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chartDrawingRepository } from "./chartDrawingRepository";
import type { ChartOverlayPreferences } from "./terminalPreferences";

export const chartDrawingQueryKeys = {
  drawings: (marketId: string) => ["chartDrawings", marketId] as const,
};

export function useChartDrawings(marketId: string) {
  return useQuery({
    queryKey: chartDrawingQueryKeys.drawings(marketId),
    queryFn: () => chartDrawingRepository.getChartDrawings(marketId),
    enabled: marketId.trim().length > 0,
  });
}

export function useSaveChartDrawings(marketId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (drawings: ChartOverlayPreferences[]) => chartDrawingRepository.saveChartDrawings(marketId, drawings),
    onMutate: async (drawings) => {
      await queryClient.cancelQueries({ queryKey: chartDrawingQueryKeys.drawings(marketId) });
      queryClient.setQueryData(chartDrawingQueryKeys.drawings(marketId), drawings);
    },
    onSuccess: async (_result, drawings) => {
      queryClient.setQueryData(chartDrawingQueryKeys.drawings(marketId), drawings);
    },
  });
}
