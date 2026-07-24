export interface InventoryItem {
  id: number;
  user_id: number | null;
  user_display_name: string | null;
  name: string;
  description: string | null;
  serial_number: string | null;
  category: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItemCreate {
  name: string;
  description?: string | null;
  serial_number?: string | null;
  category?: string | null;
  purchase_date?: string | null;
  purchase_value?: number | null;
  notes?: string | null;
}

export interface InventoryItemUpdate {
  name?: string | null;
  description?: string | null;
  serial_number?: string | null;
  category?: string | null;
  purchase_date?: string | null;
  purchase_value?: number | null;
  status?: string | null;
  notes?: string | null;
}

export interface InventoryRequest {
  id: number;
  user_id: number | null;
  user_display_name: string | null;
  item_name: string;
  description: string | null;
  quantity: number;
  status: string;
  rejection_reason: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryRequestCreate {
  item_name: string;
  description?: string | null;
  quantity?: number;
}

export interface InventoryRejectBody {
  reason: string;
}

export interface InventoryApproveResponse {
  request: InventoryRequest;
  items: InventoryItem[];
  item: InventoryItem;
}
