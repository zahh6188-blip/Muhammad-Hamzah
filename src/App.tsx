/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfDay, parseISO, addDays, getDaysInMonth, subDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
  Users, 
  Clock, 
  UserPlus, 
  ChevronLeft, 
  ChevronRight,
  LayoutDashboard,
  CalendarDays,
  Settings,
  Search,
  MoreVertical,
  Briefcase,
  Download,
  Menu,
  GripVertical
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, onSnapshot, setDoc, doc, deleteDoc, getDocFromServer, writeBatch } from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { LogIn, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';

import { Employee, SHIFT_COLORS, ShiftType, EmployeeType } from './types';
import { getShiftForDate, MOCK_EMPLOYEES } from './lib/roster-utils';

const DAYS = [
  { label: 'Min', value: 0 },
  { label: 'Sen', value: 1 },
  { label: 'Sel', value: 2 },
  { label: 'Rab', value: 3 },
  { label: 'Kam', value: 4 },
  { label: 'Jum', value: 5 },
  { label: 'Sab', value: 6 },
];

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test Connection
  useEffect(() => {
    if (isAuthReady) {
      const testConnection = async () => {
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          }
        }
      };
      testConnection();
    }
  }, [isAuthReady]);

  // Firestore Real-time Listener
  useEffect(() => {
    if (!isAuthReady) return;

    const path = 'employees';
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const emps: Employee[] = [];
      snapshot.forEach((doc) => {
        emps.push(doc.data() as Employee);
      });
      
      // If no data in Firebase and not logged in, show mock data
      // Otherwise show what's in Firebase
      if (emps.length === 0 && !user) {
        setEmployees(MOCK_EMPLOYEES);
      } else {
        setEmployees(emps);
      }
    }, (error) => {
      // Only log error if it's not a permission error for unauthenticated users
      // or if we want to see why it failed
      console.error("Firestore sync error:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('daily');
  const [viewingDate, setViewingDate] = useState<Date | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'success' | 'error' | null>(null);

  const isAuthorized = useMemo(() => {
    const adminEmails = ['zahh6188@gmail.com', 'hamzah@gmail.com'];
    return user?.email && adminEmails.includes(user.email) && user?.emailVerified;
  }, [user]);
  
  // State for Add Employee Form
  const [newEmployeeType, setNewEmployeeType] = useState<EmployeeType>('Roster');
  const [newEmployeeOffDays, setNewEmployeeOffDays] = useState<number[]>([0, 6]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    const workingToday = employees.filter(emp => {
      const shift = getShiftForDate(emp, today);
      return shift !== 'Libur' && shift !== 'Cuti';
    }).length;
    const offToday = employees.length - workingToday;
    return {
      total: employees.length,
      working: workingToday,
      off: offToday
    };
  }, [employees]);

  // Filtered employees based on search query
  const filteredEmployees = useMemo(() => {
    return employees
      .filter(emp => 
        searchQuery === '' || emp.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return a.name.localeCompare(b.name);
      });
  }, [employees, searchQuery]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !isAuthorized) return;
    
    const items = Array.from(filteredEmployees) as Employee[];
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update local state immediately for smooth UI
    const updatedEmployees = employees.map(emp => {
      const newIndex = items.findIndex(item => item.id === emp.id);
      if (newIndex !== -1) {
        return { ...emp, order: newIndex };
      }
      return emp;
    });
    setEmployees(updatedEmployees);
    
    // Persist to Firestore
    try {
      const batch = writeBatch(db);
      items.forEach((emp: Employee, index: number) => {
        const empRef = doc(db, 'employees', emp.id);
        batch.update(empRef, { order: index });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error updating order:", error);
    }
  };

  // Today's schedule
  const todaySchedule = useMemo(() => {
    return filteredEmployees
      .map(emp => ({
        ...emp,
        shift: getShiftForDate(emp, selectedDate)
      }))
      .filter(emp => {
        const matchesStatus = statusFilter === 'all' || emp.shift === statusFilter;
        return matchesStatus;
      });
  }, [filteredEmployees, selectedDate, statusFilter]);

  // Calendar days for the current month
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const exportToExcel = () => {
    const data = employees.map(emp => {
      const row: any = {
        'Nama': emp.name,
        'Jabatan': emp.position,
        'Tipe': emp.type,
      };

      // Add schedule for each day in current month
      calendarDays.forEach(day => {
        const dateKey = format(day, 'd MMM');
        row[dateKey] = getShiftForDate(emp, day);
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jadwal Pegawai");
    
    // Generate filename with current month
    const fileName = `Jadwal_Pegawai_${format(currentMonth, 'MMMM_yyyy')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleAddEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const position = formData.get('position') as string;
    const type = formData.get('type') as EmployeeType;
    const patternStr = formData.get('pattern') as string; // e.g. "4,2"
    const startDate = formData.get('startDate') as string;
    
    let rosterPattern = [1, 1, 1, 1, 1, 0, 0]; // Default 5-on-2-off
    if (patternStr && patternStr.includes(',')) {
      const [on, off] = patternStr.split(',').map(Number);
      if (!isNaN(on) && !isNaN(off) && on >= 0 && off >= 0) {
        rosterPattern = [...Array(on).fill(1), ...Array(off).fill(0)];
      }
    }

    const newEmployee: Employee = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      position,
      type,
      rosterPattern,
      offDays: type === 'Lokal' ? newEmployeeOffDays : undefined,
      startDate: startDate || format(new Date(), 'yyyy-MM-dd'),
    };

    const updatedEmployees = [...employees, newEmployee];
    
    // Save to Firestore
    const path = `employees/${newEmployee.id}`;
    try {
      await setDoc(doc(db, 'employees', newEmployee.id), newEmployee);
      
      // Reset form state and close dialog immediately for better UX
      setNewEmployeeType('Roster');
      setNewEmployeeOffDays([0, 6]);
      setIsAddDialogOpen(false);
      
      // Sync to Google Sheets in the background
      setIsSyncing(true);
      fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newEmployee, allEmployees: updatedEmployees, operation: 'ADD' }),
      })
      .then(res => res.json())
      .then(result => {
        console.log('GDrive Sync Result:', result);
        setLastSyncStatus('success');
      })
      .catch(err => {
        console.error('Failed to sync with GDrive:', err);
        setLastSyncStatus('error');
      })
      .finally(() => {
        setIsSyncing(false);
        setTimeout(() => setLastSyncStatus(null), 3000);
      });

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleEditEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingEmployee) return;

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const position = formData.get('position') as string;
    const type = formData.get('type') as EmployeeType;
    const patternStr = formData.get('pattern') as string;
    const startDate = formData.get('startDate') as string;

    let rosterPattern = editingEmployee.rosterPattern;
    let finalStartDate = startDate || editingEmployee.startDate;

    if (patternStr && patternStr.includes(',')) {
      const [on, off] = patternStr.split(',').map(Number);
      if (!isNaN(on) && !isNaN(off) && on >= 0 && off >= 0) {
        const newPattern = [...Array(on).fill(1), ...Array(off).fill(0)];
        
        // If pattern changed and user didn't manually change startDate, 
        // align it to the start of the current month to ensure future consistency
        const patternChanged = JSON.stringify(newPattern) !== JSON.stringify(editingEmployee.rosterPattern);
        if (patternChanged && startDate === editingEmployee.startDate) {
          finalStartDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        }
        
        rosterPattern = newPattern;
      }
    }

    const updatedEmp: Employee = { 
      ...editingEmployee, 
      name, 
      position, 
      type, 
      rosterPattern, 
      startDate: finalStartDate,
      offDays: type === 'Lokal' ? editingEmployee.offDays : undefined,
      manualOverrides: editingEmployee.manualOverrides 
    };

    // Save to Firestore
    const path = `employees/${updatedEmp.id}`;
    try {
      await setDoc(doc(db, 'employees', updatedEmp.id), updatedEmp);
      
      // Update local state only after successful Firestore write
      const updatedEmployees = employees.map(emp => emp.id === updatedEmp.id ? updatedEmp : emp);
      setEmployees(updatedEmployees);
      setEditingEmployee(null);

      // Sync to Google Sheets via backend
      fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedEmp, allEmployees: updatedEmployees, operation: 'EDIT' }),
      })
      .then(res => res.json())
      .then(result => console.log('GDrive Sync Result (EDIT):', result))
      .catch(err => console.error('Failed to sync EDIT with GDrive:', err));

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const toggleManualShift = (date: Date) => {
    if (!editingEmployee) return;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const currentShift = getShiftForDate(editingEmployee, date);
    const newOverrides = { ...(editingEmployee.manualOverrides || {}) };
    
    // Cycle: Libur -> Pagi -> Siang -> Malam -> Cuti -> Libur
    if (currentShift === 'Libur') {
      newOverrides[dateStr] = 'Pagi';
    } else if (currentShift === 'Pagi') {
      if (editingEmployee.type === 'Roster') {
        newOverrides[dateStr] = 'Malam';
      } else {
        newOverrides[dateStr] = 'Siang';
      }
    } else if (currentShift === 'Siang') {
      newOverrides[dateStr] = 'Malam';
    } else if (currentShift === 'Malam') {
      newOverrides[dateStr] = 'Cuti';
    } else {
      newOverrides[dateStr] = 'Libur';
    }
    
    setEditingEmployee({
      ...editingEmployee,
      manualOverrides: newOverrides
    });
  };

  const handleDeleteEmployee = async (id: string) => {
    const empToDelete = employees.find(emp => emp.id === id);
    const updatedEmployees = employees.filter(emp => emp.id !== id);

    if (empToDelete) {
      // Delete from Firestore
      const path = `employees/${id}`;
      try {
        await deleteDoc(doc(db, 'employees', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }

      // Sync to Google Sheets via backend
      fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...empToDelete, allEmployees: updatedEmployees, operation: 'DELETE' }),
      })
      .then(res => res.json())
      .then(result => console.log('GDrive Sync Result (DELETE):', result))
      .catch(err => console.error('Failed to sync DELETE with GDrive:', err));
    }
    setEmployees(updatedEmployees);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#1A1C1E] font-sans">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 w-full bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center z-20">
        <div className="flex items-center">
          <img 
            src="https://www.pangansari.co.id/assets/images/logo.png" 
            alt="PanganSari Logo" 
            className="h-8 md:h-10 w-auto object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <span className="text-xl font-bold text-[#7AB533]">PanganSari</span>
        </div>
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon">
                <Menu className="w-6 h-6" />
              </Button>
            }
          />
          <SheetContent side="left" className="w-64 p-6">
            <SheetHeader className="text-left mb-10">
              <div className="flex items-center">
                <img 
                  src="https://www.pangansari.co.id/assets/images/logo.png" 
                  alt="PanganSari Logo" 
                  className="h-10 w-auto object-contain"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <span className="text-xl font-bold text-[#7AB533]">PanganSari</span>
              </div>
            </SheetHeader>
            <nav className="space-y-2 flex-1">
              <Button 
                variant="ghost" 
                className={`w-full justify-start gap-3 ${activeTab === 'daily' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
                onClick={() => setActiveTab('daily')}
              >
                <LayoutDashboard className="w-5 h-5" />
                Jadwal Harian
              </Button>
              <Button 
                variant="ghost" 
                className={`w-full justify-start gap-3 ${activeTab === 'monthly' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
                onClick={() => setActiveTab('monthly')}
              >
                <CalendarDays className="w-5 h-5" />
                Jadwal Bulanan
              </Button>
              <Button 
                variant="ghost" 
                className={`w-full justify-start gap-3 ${activeTab === 'calendar' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
                onClick={() => setActiveTab('calendar')}
              >
                <CalendarIcon className="w-5 h-5" />
                Kalender Ringkasan
              </Button>
              {isAuthorized && (
                <Button 
                  variant="ghost" 
                  className={`w-full justify-start gap-3 ${activeTab === 'employees' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
                  onClick={() => setActiveTab('employees')}
                >
                  <Settings className="w-5 h-5" />
                  Setting
                </Button>
              )}
            </nav>
            <div className="mt-auto pt-6 border-t border-gray-100">
              {user ? (
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group relative">
                  <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                    <AvatarImage src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} />
                    <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold truncate">{user.displayName || 'User'}</p>
                    <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-400 hover:text-red-500"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                  onClick={handleLogin}
                >
                  <LogIn className="w-4 h-4" />
                  Login dengan Google
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Sidebar Navigation (Desktop) */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 hidden lg:flex flex-col p-6 z-10">
        <div className="flex items-center mb-10">
          <img 
            src="https://www.pangansari.co.id/assets/images/logo.png" 
            alt="PanganSari Logo" 
            className="h-12 w-auto object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <span className="text-2xl font-bold text-[#7AB533]">PanganSari</span>
        </div>

        <nav className="space-y-2 flex-1">
          <Button 
            variant="ghost" 
            className={`w-full justify-start gap-3 ${activeTab === 'daily' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
            onClick={() => setActiveTab('daily')}
          >
            <LayoutDashboard className="w-5 h-5" />
            Jadwal Harian
          </Button>
          <Button 
            variant="ghost" 
            className={`w-full justify-start gap-3 ${activeTab === 'monthly' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
            onClick={() => setActiveTab('monthly')}
          >
            <CalendarDays className="w-5 h-5" />
            Jadwal Bulanan
          </Button>
          <Button 
            variant="ghost" 
            className={`w-full justify-start gap-3 ${activeTab === 'calendar' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
            onClick={() => setActiveTab('calendar')}
          >
            <CalendarIcon className="w-5 h-5" />
            Kalender Ringkasan
          </Button>
          {isAuthorized && (
            <Button 
              variant="ghost" 
              className={`w-full justify-start gap-3 ${activeTab === 'employees' ? 'bg-primary/5 text-primary' : 'text-gray-500'}`}
              onClick={() => setActiveTab('employees')}
            >
              <Settings className="w-5 h-5" />
              Setting
            </Button>
          )}
        </nav>

        <div className="pt-6 border-t border-gray-100">
          {user ? (
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group relative">
              <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                <AvatarImage src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} />
                <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold truncate">{user.displayName || 'User'}</p>
                <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-gray-400 hover:text-red-500"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="w-full gap-2 border-primary/20 hover:bg-primary/5 text-primary"
              onClick={handleLogin}
            >
              <LogIn className="w-4 h-4" />
              Login dengan Google
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 md:p-8 lg:p-10 pt-20 lg:pt-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-bold tracking-tight">Jadwal Harian</h2>
              {isSyncing && (
                <Badge variant="outline" className="animate-pulse text-blue-500 border-blue-200 bg-blue-50">
                  Syncing...
                </Badge>
              )}
              {lastSyncStatus === 'success' && (
                <Badge variant="outline" className="text-green-500 border-green-200 bg-green-50">
                  Synced to GSheet
                </Badge>
              )}
              {lastSyncStatus === 'error' && (
                <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50">
                  Sync Failed
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!user && (
              <Button 
                variant="outline" 
                className="gap-2 md:hidden"
                onClick={handleLogin}
              >
                <LogIn className="w-4 h-4" />
                Login
              </Button>
            )}
            <Button variant="outline" className="gap-2 hidden md:flex" onClick={exportToExcel}>
              <Download className="w-4 h-4" />
              Export Excel
            </Button>
            {isAuthorized && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger
                  render={
                    <Button className="gap-2 shadow-sm" />
                  }
                >
                  <UserPlus className="w-4 h-4" />
                  Tambah Pegawai
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <form onSubmit={handleAddEmployee}>
                    <DialogHeader>
                      <DialogTitle>Tambah Pegawai Baru</DialogTitle>
                      <DialogDescription>
                        Masukkan detail pegawai dan pola roster mereka.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Nama Lengkap</Label>
                        <Input id="name" name="name" placeholder="Contoh: John Doe" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="position">Jabatan</Label>
                        <Input id="position" name="position" placeholder="Contoh: Security" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="startDate">Tanggal Mulai Roster</Label>
                        <Input id="startDate" name="startDate" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="type">Tipe Pegawai</Label>
                        <Select 
                          name="type" 
                          defaultValue={newEmployeeType} 
                          onValueChange={(v) => setNewEmployeeType(v as EmployeeType)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Tipe" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Roster">Pegawai Roster (Otomatis)</SelectItem>
                            <SelectItem value="Lokal">Pegawai Lokal (Tetap)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newEmployeeType === 'Roster' ? (
                        <div className="grid gap-2">
                          <Label htmlFor="pattern">Pola Roster (Masuk,Libur)</Label>
                          <Input id="pattern" name="pattern" placeholder="Contoh: 4,2" />
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Label>Hari Libur Mingguan</Label>
                          <div className="flex flex-wrap gap-2">
                            {DAYS.map((day) => (
                              <Button
                                key={day.value}
                                type="button"
                                variant={newEmployeeOffDays.includes(day.value) ? 'default' : 'outline'}
                                size="sm"
                                className="h-8 px-2 text-[10px]"
                                onClick={() => {
                                  if (newEmployeeOffDays.includes(day.value)) {
                                    setNewEmployeeOffDays(newEmployeeOffDays.filter(d => d !== day.value));
                                  } else {
                                    setNewEmployeeOffDays([...newEmployeeOffDays, day.value]);
                                  }
                                }}
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="submit">Simpan Pegawai</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </header>

        {user && !isAuthorized && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-sm font-medium">
              Akun <strong>{user.email}</strong> tidak memiliki izin akses ke database ini. Silakan hubungi administrator atau login dengan akun yang tepat.
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Total Pegawai</CardTitle>
                <Users className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.total}</div>
                <p className="text-xs text-gray-400 mt-1">Terdaftar di sistem</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Masuk Hari Ini</CardTitle>
                <Briefcase className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{stats.working}</div>
                <p className="text-xs text-gray-400 mt-1">Pegawai aktif bertugas</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Libur Hari Ini</CardTitle>
                <CalendarIcon className="w-4 h-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">{stats.off}</div>
                <p className="text-xs text-gray-400 mt-1">Pegawai sedang off</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {activeTab !== 'calendar' && (
            <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input 
                    placeholder="Cari nama pegawai..." 
                    className="pl-10 bg-white border-gray-200"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[150px] bg-white border-gray-200">
                    <SelectValue placeholder="Filter Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="Pagi">Pagi</SelectItem>
                    <SelectItem value="Siang">Siang</SelectItem>
                    <SelectItem value="Malam">Malam</SelectItem>
                    <SelectItem value="Libur">Libur</SelectItem>
                    <SelectItem value="Cuti">Cuti</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            <TabsContent value="daily" key="daily">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <Card className="border-none shadow-sm overflow-hidden">
                  <CardHeader className="bg-white border-b border-gray-100 flex flex-row items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => setSelectedDate(subDays(selectedDate, 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <div className="text-center">
                        <span className="font-semibold">{format(selectedDate, 'EEEE, d MMMM yyyy', { locale: id })}</span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                    <Badge variant="secondary" className="font-normal">
                      {todaySchedule.length} Pegawai
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-gray-50/50">
                        <TableRow>
                          <TableHead className="w-[300px]">Pegawai</TableHead>
                          <TableHead>Jabatan</TableHead>
                          <TableHead>Status / Shift</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todaySchedule.length > 0 ? (
                          todaySchedule.map((emp) => (
                            <TableRow key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                  <Avatar className="w-9 h-9 border border-gray-100">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} />
                                    <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-sm">{emp.name}</p>
                                      <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${emp.type === 'Roster' ? 'text-blue-500 border-blue-200 bg-blue-50' : 'text-green-500 border-green-200 bg-green-50'}`}>
                                        {emp.type}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-600 text-sm">{emp.position}</TableCell>
                              <TableCell>
                                <Badge className={`font-medium border ${SHIFT_COLORS[emp.shift]}`}>
                                  {emp.shift}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-32 text-center text-gray-400">
                              Tidak ada pegawai ditemukan.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex flex-wrap gap-6 justify-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-xs text-gray-600 font-medium">Shift Pagi (07.00-15.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-500" />
                        <span className="text-xs text-gray-600 font-medium">Shift Siang (15.00-23.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="text-xs text-gray-600 font-medium">Shift Malam (23.00-07.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-xs text-gray-600 font-medium">Cuti</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            <TabsContent value="monthly" key="monthly">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Card className="border-none shadow-sm overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-white">
                    <div>
                      <CardTitle>Jadwal Bulanan</CardTitle>
                      <CardDescription>Rekapitulasi shift seluruh pegawai dalam satu bulan.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="font-semibold min-w-[120px] text-center">
                        {format(currentMonth, 'MMMM yyyy', { locale: id })}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-gray-50/50">
                          <TableRow>
                            <TableHead className="sticky left-0 bg-gray-50 z-20 min-w-[180px] border-r border-gray-100">Pegawai</TableHead>
                            {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, i) => (
                              <TableHead key={i} className="text-center min-w-[40px] px-1 text-[10px] font-bold">
                                {i + 1}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredEmployees.map((emp) => (
                            <TableRow key={emp.id} className="hover:bg-gray-50/30 transition-colors">
                              <TableCell className="sticky left-0 bg-white z-10 font-medium border-r border-gray-100 py-3">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} />
                                    <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col">
                                    <span className="text-xs truncate max-w-[120px]">{emp.name}</span>
                                    <Badge variant="outline" className={`text-[8px] px-1 py-0 h-3 w-fit ${emp.type === 'Roster' ? 'text-blue-500 border-blue-200 bg-blue-50' : 'text-green-500 border-green-200 bg-green-50'}`}>
                                      {emp.type}
                                    </Badge>
                                  </div>
                                </div>
                              </TableCell>
                              {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, i) => {
                                const date = addDays(startOfMonth(currentMonth), i);
                                const shift = getShiftForDate(emp, date);
                                const shorthand = shift === 'Libur' ? 'L' : shift.charAt(0);
                                
                                return (
                                  <TableCell key={i} className="p-1 text-center">
                                    <div 
                                      className={`
                                        w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold mx-auto
                                        ${shift === 'Pagi' ? 'bg-blue-600 text-white' : 
                                          shift === 'Siang' ? 'bg-orange-600 text-white' : 
                                          shift === 'Malam' ? 'bg-purple-600 text-white' : 
                                          shift === 'Cuti' ? 'bg-red-600 text-white' :
                                          'bg-gray-100 text-gray-400'}
                                      `}
                                      title={`${format(date, 'd MMMM')}: ${shift}`}
                                    >
                                      {shorthand}
                                    </div>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex flex-wrap gap-6 justify-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-blue-600" />
                        <span className="text-[10px] text-gray-500 font-medium">P: Pagi (07.00-15.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-orange-600" />
                        <span className="text-[10px] text-gray-500 font-medium">S: Siang (15.00-23.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-purple-600" />
                        <span className="text-[10px] text-gray-500 font-medium">M: Malam (23.00-07.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" />
                        <span className="text-[10px] text-gray-500 font-medium">L: Libur</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-red-600" />
                        <span className="text-[10px] text-gray-500 font-medium">C: Cuti</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            <TabsContent value="calendar" key="calendar">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Card className="border-none shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Kalender Ringkasan</CardTitle>
                      <CardDescription>Pilih tanggal untuk melihat detail shift.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="font-semibold min-w-[120px] text-center">
                        {format(currentMonth, 'MMMM yyyy', { locale: id })}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 gap-2">
                      {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(day => (
                        <div key={day} className="text-center text-xs font-bold text-gray-400 py-2 uppercase tracking-wider">
                          {day}
                        </div>
                      ))}
                      {/* Empty slots for start of month */}
                      {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-24 rounded-lg bg-gray-50/30" />
                      ))}
                      {calendarDays.map(day => {
                        const dayShifts = employees.map(emp => getShiftForDate(emp, day));
                        const pagiCount = dayShifts.filter(s => s === 'Pagi').length;
                        const siangCount = dayShifts.filter(s => s === 'Siang').length;
                        const malamCount = dayShifts.filter(s => s === 'Malam').length;
                        const cutiCount = dayShifts.filter(s => s === 'Cuti').length;
                        const liburCount = dayShifts.filter(s => s === 'Libur').length;
                        const workingCount = pagiCount + siangCount + malamCount;
                        
                        const isToday = isSameDay(day, new Date());
                        const isSelected = isSameDay(day, selectedDate);

                        return (
                          <div 
                            key={day.toString()}
                            onClick={() => {
                              setSelectedDate(day);
                              setViewingDate(day);
                            }}
                            className={`min-h-[100px] p-2 rounded-lg border transition-all cursor-pointer flex flex-col gap-1
                              ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-gray-100 bg-white hover:border-primary/50'}
                              ${isToday ? 'relative after:absolute after:top-1 after:right-1 after:w-1.5 after:h-1.5 after:bg-primary after:rounded-full' : ''}
                            `}
                          >
                            <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-gray-700'}`}>
                              {format(day, 'd')}
                            </span>
                            <div className="flex flex-col gap-0.5">
                              {pagiCount > 0 && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    <span className="text-[9px] text-gray-500">Pagi</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-blue-600">{pagiCount}</span>
                                </div>
                              )}
                              {siangCount > 0 && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                    <span className="text-[9px] text-gray-500">Siang</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-orange-600">{siangCount}</span>
                                </div>
                              )}
                              {malamCount > 0 && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    <span className="text-[9px] text-gray-500">Malam</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-purple-600">{malamCount}</span>
                                </div>
                              )}
                              {cutiCount > 0 && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                    <span className="text-[9px] text-gray-500">Cuti</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-red-600">{cutiCount}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                  <span className="text-[9px] text-gray-500">Libur</span>
                                </div>
                                <span className="text-[9px] font-bold text-gray-400">{liburCount}</span>
                              </div>
                              <div className="mt-1 pt-1 border-t border-gray-50 flex justify-between items-center">
                                <span className="text-[8px] text-gray-400 uppercase font-bold">Total</span>
                                <span className="text-[9px] font-bold text-gray-700">{workingCount}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Dialog open={!!viewingDate} onOpenChange={(open) => !open && setViewingDate(null)}>
                  <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Detail Shift: {viewingDate && format(viewingDate, 'EEEE, d MMMM yyyy', { locale: id })}</DialogTitle>
                      <DialogDescription>
                        Daftar pegawai yang bertugas pada tanggal ini.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pegawai</TableHead>
                            <TableHead>Shift</TableHead>
                            <TableHead>Jabatan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {viewingDate && employees
                            .map(emp => ({ ...emp, shift: getShiftForDate(emp, viewingDate) }))
                            .filter(emp => emp.shift !== 'Libur' && emp.shift !== 'Cuti')
                            .map(emp => (
                              <TableRow key={emp.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="w-6 h-6">
                                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} />
                                      <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs">{emp.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] ${SHIFT_COLORS[emp.shift]}`}>
                                    {emp.shift}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-gray-500">{emp.position}</TableCell>
                              </TableRow>
                            ))}
                          {viewingDate && employees
                            .map(emp => ({ ...emp, shift: getShiftForDate(emp, viewingDate) }))
                            .filter(emp => emp.shift === 'Libur' || emp.shift === 'Cuti')
                            .length === employees.length && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-gray-400">
                                  Tidak ada pegawai yang bertugas hari ini.
                                </TableCell>
                              </TableRow>
                            )}
                        </TableBody>
                      </Table>
                    </div>
                  </DialogContent>
                </Dialog>
              </motion.div>
            </TabsContent>

            <TabsContent value="employees" key="employees">
              {isAuthorized ? (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                <Card className="border-none shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Daftar Pegawai</CardTitle>
                      <CardDescription>Manajemen data pegawai dan pola kerja mereka.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="font-semibold min-w-[120px] text-center">
                        {format(currentMonth, 'MMMM yyyy', { locale: id })}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <DragDropContext onDragEnd={onDragEnd}>
                        <Table>
                          <TableHeader className="bg-gray-50/50">
                            <TableRow>
                              <TableHead className="sticky left-0 bg-gray-50 z-20 min-w-[200px] border-r border-gray-100">Pegawai</TableHead>
                              {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, i) => (
                                <TableHead key={i} className="text-center min-w-[40px] px-1 text-[10px] font-bold">
                                  {i + 1}
                                </TableHead>
                              ))}
                              <TableHead className="sticky right-0 bg-gray-50 z-20 text-right min-w-[100px] border-l border-gray-100">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <Droppable droppableId="employees-list">
                            {(provided) => (
                              <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                                {filteredEmployees.map((emp, index) => (
                                  // @ts-ignore - Draggable key issue in some versions
                                  <Draggable key={emp.id} draggableId={emp.id} index={index}>
                                    {(provided, snapshot) => (
                                      <TableRow 
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`hover:bg-gray-50/30 transition-colors ${snapshot.isDragging ? 'bg-white shadow-lg z-50' : ''}`}
                                      >
                                        <TableCell className="sticky left-0 bg-white z-10 font-medium border-r border-gray-100 py-3">
                                          <div className="flex items-center gap-2">
                                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-primary transition-colors">
                                              <GripVertical className="w-4 h-4" />
                                            </div>
                                            <Avatar className="w-6 h-6">
                                              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} />
                                              <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col min-w-0">
                                              <span className="text-xs font-semibold truncate max-w-[100px]">{emp.name}</span>
                                              <Badge variant="outline" className={`text-[7px] px-1 py-0 h-3 w-fit shrink-0 ${emp.type === 'Roster' ? 'text-blue-500 border-blue-200 bg-blue-50' : 'text-green-500 border-green-200 bg-green-50'}`}>
                                                {emp.type}
                                              </Badge>
                                            </div>
                                          </div>
                                        </TableCell>
                                        {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, i) => {
                                          const date = addDays(startOfMonth(currentMonth), i);
                                          const shift = getShiftForDate(emp, date);
                                          const shorthand = shift === 'Libur' ? 'L' : shift.charAt(0);
                                          
                                          return (
                                            <TableCell key={i} className="p-1 text-center">
                                              <div 
                                                className={`
                                                  w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold mx-auto
                                                  ${shift === 'Pagi' ? 'bg-blue-600 text-white' : 
                                                    shift === 'Siang' ? 'bg-orange-600 text-white' : 
                                                    shift === 'Malam' ? 'bg-purple-600 text-white' : 
                                                    shift === 'Cuti' ? 'bg-red-600 text-white' :
                                                    'bg-gray-100 text-gray-400'}
                                                `}
                                                title={`${format(date, 'd MMMM')}: ${shift}`}
                                              >
                                                {shorthand}
                                              </div>
                                            </TableCell>
                                          );
                                        })}
                                        <TableCell className="sticky right-0 bg-white z-10 text-right border-l border-gray-100">
                                          <div className="flex justify-end gap-1">
                                            <Dialog open={!!editingEmployee && editingEmployee.id === emp.id} onOpenChange={(open) => !open && setEditingEmployee(null)}>
                                              <DialogTrigger
                                                render={
                                                  <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/5"
                                                    onClick={() => setEditingEmployee(emp)}
                                                  />
                                                }
                                              >
                                                <Settings className="w-4 h-4" />
                                              </DialogTrigger>
                                              <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                                                <form onSubmit={handleEditEmployee}>
                                                  <DialogHeader>
                                                    <DialogTitle>Edit Jadwal Pegawai</DialogTitle>
                                                    <DialogDescription>
                                                      Perbarui detail dan tentukan jadwal libur/masuk secara manual.
                                                    </DialogDescription>
                                                  </DialogHeader>
                                                  <div className="grid gap-6 py-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                      <div className="grid gap-2">
                                                        <Label htmlFor="edit-name">Nama Lengkap</Label>
                                                        <Input id="edit-name" name="name" defaultValue={emp.name} required />
                                                      </div>
                                                      <div className="grid gap-2">
                                                        <Label htmlFor="edit-position">Jabatan</Label>
                                                        <Input id="edit-position" name="position" defaultValue={emp.position} required />
                                                      </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                      <div className="grid gap-2">
                                                        <Label htmlFor="edit-type">Tipe Pegawai</Label>
                                                        <Select 
                                                          name="type" 
                                                          defaultValue={emp.type}
                                                          onValueChange={(v) => {
                                                            if (editingEmployee) {
                                                              setEditingEmployee({ ...editingEmployee, type: v as EmployeeType });
                                                            }
                                                          }}
                                                        >
                                                          <SelectTrigger>
                                                            <SelectValue placeholder="Pilih Tipe" />
                                                          </SelectTrigger>
                                                          <SelectContent>
                                                            <SelectItem value="Roster">Pegawai Roster (Otomatis)</SelectItem>
                                                            <SelectItem value="Lokal">Pegawai Lokal (Tetap)</SelectItem>
                                                          </SelectContent>
                                                        </Select>
                                                      </div>
                                                      <div className="grid gap-2">
                                                        <Label htmlFor="edit-startDate">Tanggal Mulai Roster</Label>
                                                        <Input id="edit-startDate" name="startDate" type="date" defaultValue={emp.startDate} required />
                                                      </div>
                                                    </div>

                                                    {editingEmployee?.type === 'Roster' ? (
                                                      <div className="grid gap-2">
                                                        <Label htmlFor="edit-pattern">Pola Roster (Masuk,Libur)</Label>
                                                        <Input 
                                                          id="edit-pattern" 
                                                          name="pattern" 
                                                          defaultValue={`${emp.rosterPattern.filter(x => x === 1).length},${emp.rosterPattern.filter(x => x === 0).length}`}
                                                          placeholder="Contoh: 42,14" 
                                                        />
                                                        <p className="text-[10px] text-gray-400">Hanya berlaku untuk Pegawai Roster</p>
                                                      </div>
                                                    ) : (
                                                      <div className="grid gap-2">
                                                        <Label>Hari Libur Mingguan</Label>
                                                        <div className="flex flex-wrap gap-2">
                                                          {DAYS.map((day) => (
                                                            <Button
                                                              key={day.value}
                                                              type="button"
                                                              variant={editingEmployee?.offDays?.includes(day.value) ? 'default' : 'outline'}
                                                              size="sm"
                                                              className="h-8 px-2 text-[10px]"
                                                              onClick={() => {
                                                                if (editingEmployee) {
                                                                  const currentOffDays = editingEmployee.offDays || [0, 6];
                                                                  const newOffDays = currentOffDays.includes(day.value)
                                                                    ? currentOffDays.filter(d => d !== day.value)
                                                                    : [...currentOffDays, day.value];
                                                                  setEditingEmployee({ ...editingEmployee, offDays: newOffDays });
                                                                }
                                                              }}
                                                            >
                                                              {day.label}
                                                            </Button>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}

                                                    <div className="space-y-4">
                                                      <div className="flex items-center justify-between">
                                                        <Label className="text-base">Atur Jadwal ({format(currentMonth, 'MMMM yyyy', { locale: id })})</Label>
                                                        <div className="flex flex-wrap gap-2 justify-end">
                                                          <div className="flex items-center gap-1">
                                                            <div className="w-2.5 h-2.5 bg-blue-600 rounded-sm" />
                                                            <span className="text-[9px] text-gray-500">Pagi</span>
                                                          </div>
                                                          <div className="flex items-center gap-1">
                                                            <div className="w-2.5 h-2.5 bg-orange-600 rounded-sm" />
                                                            <span className="text-[9px] text-gray-500">Siang</span>
                                                          </div>
                                                          <div className="flex items-center gap-1">
                                                            <div className="w-2.5 h-2.5 bg-purple-600 rounded-sm" />
                                                            <span className="text-[9px] text-gray-500">Malam</span>
                                                          </div>
                                                          <div className="flex items-center gap-1">
                                                            <div className="w-2.5 h-2.5 bg-gray-100 border border-gray-200 rounded-sm" />
                                                            <span className="text-[9px] text-gray-500">Libur</span>
                                                          </div>
                                                          <div className="flex items-center gap-1">
                                                            <div className="w-2.5 h-2.5 bg-red-600 rounded-sm" />
                                                            <span className="text-[9px] text-gray-500">Cuti</span>
                                                          </div>
                                                        </div>
                                                      </div>
                                                      
                                                      <div className="grid grid-cols-7 gap-2 border p-4 rounded-lg bg-gray-50/50">
                                                        {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((day, i) => (
                                                          <div key={i} className="text-center text-[10px] font-bold text-gray-400 mb-1">{day}</div>
                                                        ))}
                                                        {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, i) => {
                                                          const date = addDays(startOfMonth(currentMonth), i);
                                                          const shift = getShiftForDate(editingEmployee || emp, date);
                                                          const isLibur = shift === 'Libur';
                                                          const shorthand = isLibur ? 'L' : shift.charAt(0);
                                                          
                                                          return (
                                                            <button
                                                              key={i}
                                                              type="button"
                                                              onClick={() => toggleManualShift(date)}
                                                              className={`
                                                                aspect-square rounded-md flex flex-col items-center justify-center transition-all border
                                                                ${shift === 'Pagi' ? 'bg-blue-600 text-white border-blue-700' : 
                                                                  shift === 'Siang' ? 'bg-orange-600 text-white border-orange-700' : 
                                                                  shift === 'Malam' ? 'bg-purple-600 text-white border-purple-700' : 
                                                                  shift === 'Cuti' ? 'bg-red-600 text-white border-red-700' :
                                                                  'bg-white text-gray-400 border-gray-100 hover:border-primary/30'}
                                                              `}
                                                            >
                                                              <span className="text-[10px] font-bold">{format(date, 'd')}</span>
                                                              <span className="text-[8px] font-bold opacity-80">{shorthand}</span>
                                                            </button>
                                                          );
                                                        })}
                                                      </div>
                                                      <p className="text-[10px] text-gray-400 italic text-center">
                                                        Klik berulang pada tanggal untuk ganti status (Pagi → Siang → Malam → Libur)
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <DialogFooter>
                                                    <Button type="submit" className="w-full">Simpan Perubahan</Button>
                                                  </DialogFooter>
                                                </form>
                                              </DialogContent>
                                            </Dialog>
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                              onClick={() => handleDeleteEmployee(emp.id)}
                                            >
                                              Hapus
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </TableBody>
                            )}
                          </Droppable>
                        </Table>
                      </DragDropContext>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex flex-wrap gap-6 justify-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-blue-600" />
                        <span className="text-[10px] text-gray-500 font-medium">P: Pagi (07.00-15.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-orange-600" />
                        <span className="text-[10px] text-gray-500 font-medium">S: Siang (15.00-23.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-purple-600" />
                        <span className="text-[10px] text-gray-500 font-medium">M: Malam (23.00-07.00)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" />
                        <span className="text-[10px] text-gray-500 font-medium">L: Libur</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-red-600" />
                        <span className="text-[10px] text-gray-500 font-medium">C: Cuti</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-dashed border-gray-200">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Settings className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Akses Terbatas</h3>
                <p className="text-sm text-gray-500 max-w-xs mx-auto mt-2">
                  Anda tidak memiliki izin untuk mengakses menu Setting. Silakan hubungi administrator untuk mendapatkan akses.
                </p>
              </div>
            )}
          </TabsContent>
          </AnimatePresence>
        </Tabs>
      </main>

      {/* Mobile Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center z-20">
        <Button 
          variant="ghost" 
          size="icon" 
          className={activeTab === 'daily' ? 'text-primary' : 'text-gray-400'}
          onClick={() => setActiveTab('daily')}
        >
          <LayoutDashboard className="w-6 h-6" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className={activeTab === 'monthly' ? 'text-primary' : 'text-gray-400'}
          onClick={() => setActiveTab('monthly')}
        >
          <CalendarDays className="w-6 h-6" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className={activeTab === 'calendar' ? 'text-primary' : 'text-gray-400'}
          onClick={() => setActiveTab('calendar')}
        >
          <CalendarIcon className="w-6 h-6" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className={activeTab === 'employees' ? 'text-primary' : 'text-gray-400'}
          onClick={() => setActiveTab('employees')}
        >
          <Settings className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
