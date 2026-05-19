import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketEngine } from "../marketEngine";
import type { PaperMarketTick, PlacePaperOrderInput, UpdatePaperOrderInput } from "./types";

export const paperTradingQueryKeys = {
  ledger: ["paperLedger"] as const,
};

export function usePaperLedger() {
  const queryClient = useQueryClient();
  const ledgerQuery = useQuery({
    queryKey: paperTradingQueryKeys.ledger,
    queryFn: () => marketEngine.getLedger(),
  });

  useEffect(
    () =>
      marketEngine.subscribeLedger((ledger) => {
        queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
      }),
    [queryClient],
  );

  return ledgerQuery;
}

export function usePlacePaperOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlacePaperOrderInput) => marketEngine.placeOrder(input),
    onSuccess: (ledger) => {
      queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
    },
  });
}

export function useProcessOpenPaperOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tick: PaperMarketTick) => marketEngine.processMarketTick(tick),
    onSuccess: (ledger) => {
      queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
    },
  });
}

export function useCancelPaperOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => marketEngine.cancelOrder(orderId),
    onSuccess: (ledger) => {
      queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
    },
  });
}

export function useClosePaperOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, currentPrice }: { orderId: string; currentPrice: number }) =>
      marketEngine.closeOrder(orderId, currentPrice),
    onSuccess: (ledger) => {
      queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
    },
  });
}

export function useTogglePaperOrderChartVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => marketEngine.toggleOrderChartVisibility(orderId),
    onSuccess: (ledger) => {
      queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
    },
  });
}

export function useUpdatePaperOrderRiskLimits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      stopLimitPrice,
      profitLimitPrice,
    }: {
      orderId: string;
      stopLimitPrice?: number;
      profitLimitPrice?: number;
    }) => marketEngine.updateOrderRiskLimits(orderId, { stopLimitPrice, profitLimitPrice }),
    onSuccess: (ledger) => {
      queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
    },
  });
}

export function useUpdatePaperOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePaperOrderInput) => marketEngine.updateOrder(input),
    onSuccess: (ledger) => {
      queryClient.setQueryData(paperTradingQueryKeys.ledger, ledger);
    },
  });
}
