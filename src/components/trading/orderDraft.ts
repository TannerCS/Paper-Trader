import type { PaperOrderKind, PerpSide, SpotOrderSide } from "../../data/paper/types";

export interface RiskLimitDraft {
  stopLimitEnabled: boolean;
  stopLimitPrice: string;
  profitLimitEnabled: boolean;
  profitLimitPrice: string;
}

export interface OrderTicketDraft extends RiskLimitDraft {
  kind: PaperOrderKind;
  side: SpotOrderSide | PerpSide;
  quantity: number;
  entryPrice: number | null;
  limitPrice: number | null;
  leverage: number;
}

export const defaultRiskLimitDraft: RiskLimitDraft = {
  stopLimitEnabled: false,
  stopLimitPrice: "",
  profitLimitEnabled: false,
  profitLimitPrice: "",
};
