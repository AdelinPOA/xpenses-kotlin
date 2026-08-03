export interface ReviewQueueItem {
  id: number;
  title: string;
  user_id: number;
  user_name: string;
  date_submitted: string | null;
  date_from: string | null;
  date_to: string | null;
  description: string | null;
  expense_count: number;
  total_amount_eur: number;
  currency: string;
  status: string;
}
