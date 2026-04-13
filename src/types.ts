export type ShiftType = 'Pagi' | 'Siang' | 'Malam' | 'Libur' | 'Cuti';

export type EmployeeType = 'Roster' | 'Lokal';

export interface Employee {
  id: string;
  name: string;
  position: string;
  avatar?: string;
  type: EmployeeType;
  rosterPattern: number[]; // e.g., [1, 1, 1, 1, 0, 0] for 4-on-2-off (1=work, 0=off)
  startDate: string; // The date when the roster pattern started
  order?: number; // Sorting order
  offDays?: number[]; // For 'Lokal' type: 0=Sun, 1=Mon, ..., 6=Sat. Default [0, 6]
  manualOverrides?: Record<string, ShiftType>; // Date string (YYYY-MM-DD) -> ShiftType
}

export interface Shift {
  employeeId: string;
  date: string;
  type: ShiftType;
}

export const SHIFT_COLORS: Record<ShiftType, string> = {
  'Pagi': 'bg-blue-100 text-blue-700 border-blue-200',
  'Siang': 'bg-orange-100 text-orange-700 border-orange-200',
  'Malam': 'bg-purple-100 text-purple-700 border-purple-200',
  'Libur': 'bg-gray-100 text-gray-500 border-gray-200',
  'Cuti': 'bg-red-100 text-red-700 border-red-200',
};
