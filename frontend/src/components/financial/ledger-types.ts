export type LedgerShipment = {
  id: number;
  display_code: string;
  cod_amount?: number | null;
};

export type LedgerActor = {
  id: number;
  name: string;
};

export type LedgerAllocation = {
  id: number;
  amount: number;
  obligation?: { shipment?: LedgerShipment | null; opening_entry?: LedgerOpeningReference | null } | null;
  earning?: { shipment?: LedgerShipment | null; opening_entry?: LedgerOpeningReference | null } | null;
  entitlement?: { shipment?: LedgerShipment | null; opening_entry?: LedgerOpeningReference | null } | null;
};

export type LedgerOpeningReference = {
  id: number;
  reference: string;
  support_reference?: string;
};

export type LedgerMovement = {
  id: number;
  reference: string;
  amount: number;
  allocated_amount: number;
  balance_before?: number;
  balance_after?: number;
  movement_type?: "standard" | "reversal";
  status?: string;
  reversal_of_id?: number | null;
  method: string;
  external_reference?: string | null;
  notes?: string | null;
  received_at?: string | null;
  paid_at?: string | null;
  received_by?: LedgerActor | null;
  paid_by?: LedgerActor | null;
  approved_by?: LedgerActor | null;
  reversal_of?: { id: number; reference: string } | null;
  reversal?: { id: number; reference: string } | null;
  allocations: LedgerAllocation[];
};

export type DriverCodLine = {
  id: number;
  shipment_id: number | null;
  opening_entry_id?: number | null;
  collection_date: string;
  collected_amount: number;
  remitted_amount: number;
  payment_method?: string | null;
  status: string;
  shipment?: LedgerShipment | null;
  opening_entry?: LedgerOpeningReference | null;
};

export type DriverServiceLine = {
  id: number;
  shipment_id: number | null;
  operational_task_id?: number | null;
  opening_entry_id?: number | null;
  earned_date: string;
  amount: number;
  standard_amount?: number;
  paid_amount: number;
  service_type: string;
  status: string;
  shipment?: LedgerShipment | null;
  operational_task?: { id: number; task_code: string; task_type: string } | null;
  opening_entry?: LedgerOpeningReference | null;
  rate_rule?: {
    id: number;
    rule_key: string;
    version: number;
    name: string;
    scope_type: string;
  } | null;
  rate_snapshot_json?: {
    source?: string;
    rule_name?: string | null;
    rule_version?: number | null;
  } | null;
};

export type DriverReconciliation = {
  driver: { id: number; name: string; phone?: string | null };
  cod: {
    collected: number;
    remitted: number;
    pending: number;
    lines: DriverCodLine[];
  };
  services: {
    earned: number;
    paid: number;
    pending: number;
    lines: DriverServiceLine[];
  };
  remittances: LedgerMovement[];
  service_payments: LedgerMovement[];
  rule: string;
};

export type ClientCodLine = {
  id: number;
  shipment_id: number | null;
  opening_entry_id?: number | null;
  reported_amount: number;
  available_amount: number;
  transferred_amount: number;
  status: string;
  available_at?: string | null;
  shipment?: LedgerShipment | null;
  opening_entry?: LedgerOpeningReference | null;
};

export type ClientLedger = {
  client: { id: number; name: string; company?: string | null };
  reported: number;
  available: number;
  transferred: number;
  pending_transfer: number;
  lines: ClientCodLine[];
  payouts: LedgerMovement[];
};

export type MovementLine = {
  id: number;
  date: string;
  guide: string;
  description: string;
  originalAmount: number;
  appliedAmount: number;
  outstandingAmount: number;
};

export type MovementHistoryItem = {
  id: number;
  reference: string;
  date: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  movementType: "standard" | "reversal";
  status?: string;
  method: string;
  externalReference?: string | null;
  notes?: string | null;
  actorName?: string | null;
  approvedByName?: string | null;
  reversalOfReference?: string | null;
  reversalReference?: string | null;
  lines: Array<{ id: number; guide: string; amount: number }>;
};
