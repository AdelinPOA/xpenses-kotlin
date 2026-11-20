export type FuelType = "petrol" | "diesel" | "hybrid" | "electric" | "lpg";

export interface UserVehicle {
  id: number;
  plate_number: string;
  make_model: string | null;
  vehicle_category: string;
  fuel_type: FuelType | null;
  fuel_consumption_l_per_100km: number | null;
  last_odometer_km: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserVehicleCreatePayload {
  plate_number: string;
  make_model?: string | null;
  vehicle_category?: string | null;
  fuel_type?: FuelType | null;
  fuel_consumption_l_per_100km?: number | null;
  last_odometer_km?: number | null;
  is_default?: boolean;
}

export interface UserVehicleUpdatePayload {
  plate_number?: string;
  make_model?: string | null;
  clear_make_model?: boolean;
  vehicle_category?: string | null;
  fuel_type?: FuelType | null;
  clear_fuel_type?: boolean;
  fuel_consumption_l_per_100km?: number | null;
  clear_fuel_consumption?: boolean;
  last_odometer_km?: number | null;
  clear_last_odometer?: boolean;
  is_default?: boolean;
}
