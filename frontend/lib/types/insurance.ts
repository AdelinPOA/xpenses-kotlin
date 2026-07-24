export interface InsuranceFile {
  id: number;
  user_id: number | null;
  user_display_name: string | null;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
}
