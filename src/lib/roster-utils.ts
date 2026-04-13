import { addDays, differenceInDays, parseISO, startOfDay, format, getDay } from 'date-fns';
import { Employee, ShiftType } from '../types';

/**
 * Calculates the shift type for an employee on a specific date based on their roster pattern.
 */
export function getShiftForDate(employee: Employee, targetDate: Date): ShiftType {
  const dateStr = format(targetDate, 'yyyy-MM-dd');
  
  if (employee.manualOverrides && employee.manualOverrides[dateStr]) {
    return employee.manualOverrides[dateStr];
  }

  // Pegawai Lokal: Use offDays if provided, otherwise default to Sat-Sun
  if (employee.type === 'Lokal') {
    const dayOfWeek = getDay(targetDate); // 0 (Sun) to 6 (Sat)
    const offDays = employee.offDays || [0, 6];
    if (offDays.includes(dayOfWeek)) {
      return 'Libur';
    }
    return 'Pagi';
  }

  const start = startOfDay(parseISO(employee.startDate));
  const target = startOfDay(targetDate);
  
  const diff = differenceInDays(target, start);
  
  if (diff < 0) return 'Libur'; // Before start date, assume off
  
  const patternLength = employee.rosterPattern.length;
  const patternIndex = diff % patternLength;
  
  const isWorking = employee.rosterPattern[patternIndex] === 1;
  
  if (!isWorking) return 'Libur';
  
  // Calculate total work days completed more efficiently
  const workDaysInOnePattern = employee.rosterPattern.filter(x => x === 1).length;
  const fullPatternsCount = Math.floor(diff / patternLength);
  const remainingDays = diff % patternLength;
  
  let workDaysInRemaining = 0;
  for (let i = 0; i <= remainingDays; i++) {
    if (employee.rosterPattern[i] === 1) {
      workDaysInRemaining++;
    }
  }
  
  const totalWorkDaysCount = (fullPatternsCount * workDaysInOnePattern) + workDaysInRemaining;
  
  if (employee.type === 'Roster') {
    const shiftRotation = ['Pagi', 'Malam'] as ShiftType[];
    return shiftRotation[(totalWorkDaysCount - 1) % 2];
  }
  
  const shiftRotation = ['Pagi', 'Siang', 'Malam'] as ShiftType[];
  return shiftRotation[(totalWorkDaysCount - 1) % 3];
}

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: '1',
    name: 'Budi Santoso',
    position: 'Security Guard',
    type: 'Roster',
    rosterPattern: [1, 1, 1, 1, 0, 0], // 4 on, 2 off
    startDate: '2026-01-01',
  },
  {
    id: '2',
    name: 'Siti Aminah',
    position: 'Receptionist',
    type: 'Lokal',
    rosterPattern: [1, 1, 1, 1, 1, 0, 0], // 5 on, 2 off
    startDate: '2026-01-01',
  },
  {
    id: '3',
    name: 'Agus Setiawan',
    position: 'Operations',
    type: 'Roster',
    rosterPattern: [1, 1, 0, 1, 1, 0], // 2 on, 1 off
    startDate: '2026-01-01',
  },
  {
    id: '4',
    name: 'Dewi Lestari',
    position: 'Security Guard',
    type: 'Roster',
    rosterPattern: [1, 1, 1, 1, 0, 0],
    startDate: '2026-01-02', // Staggered start
  },
  {
    id: '5',
    name: 'Eko Prasetyo',
    position: 'Maintenance',
    type: 'Lokal',
    rosterPattern: [1, 1, 1, 0, 0], // 3 on, 2 off
    startDate: '2026-01-01',
  }
];
