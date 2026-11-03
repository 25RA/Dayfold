import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
  Check,
} from 'lucide-react';
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';

interface DayfoldDatePickerProps {
  value?: string; // ISO string or empty
  onChange: (isoString: string | null) => void;
  placeholder?: string;
  className?: string;
}

export const DayfoldDatePicker: React.FC<DayfoldDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select due date...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial state from value
  const parsedDate = value ? new Date(value) : null;
  const [currentMonth, setCurrentMonth] = useState<Date>(parsedDate || new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(parsedDate);

  // Time toggle
  const hasSpecificTime = value
    ? !(parsedDate && parsedDate.getHours() === 23 && parsedDate.getMinutes() === 59)
    : false;
  const [includeTime, setIncludeTime] = useState<boolean>(hasSpecificTime);
  const [timeHour, setTimeHour] = useState<number>(
    parsedDate && hasSpecificTime ? parsedDate.getHours() : 17 // default 5 PM
  );
  const [timeMinute, setTimeMinute] = useState<number>(
    parsedDate && hasSpecificTime ? parsedDate.getMinutes() : 0
  );

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setSelectedDate(d);
      setCurrentMonth(d);
      const isEndOfDay = d.getHours() === 23 && d.getMinutes() === 59;
      setIncludeTime(!isEndOfDay);
      if (!isEndOfDay) {
        setTimeHour(d.getHours());
        setTimeMinute(d.getMinutes());
      }
    } else {
      setSelectedDate(null);
    }
  }, [value]);

  const handleSelectDay = (day: Date) => {
    const newDate = new Date(day);
    if (includeTime) {
      newDate.setHours(timeHour, timeMinute, 0, 0);
    } else {
      // Default to end of selected local day (23:59:59)
      newDate.setHours(23, 59, 59, 999);
    }
    setSelectedDate(newDate);
    onChange(newDate.toISOString());
  };

  const handleTimeChange = (newHour: number, newMin: number) => {
    setTimeHour(newHour);
    setTimeMinute(newMin);
    if (selectedDate) {
      const updated = new Date(selectedDate);
      updated.setHours(newHour, newMin, 0, 0);
      setSelectedDate(updated);
      onChange(updated.toISOString());
    }
  };

  const handleToggleIncludeTime = (enabled: boolean) => {
    setIncludeTime(enabled);
    if (selectedDate) {
      const updated = new Date(selectedDate);
      if (enabled) {
        updated.setHours(timeHour, timeMinute, 0, 0);
      } else {
        updated.setHours(23, 59, 59, 999);
      }
      setSelectedDate(updated);
      onChange(updated.toISOString());
    }
  };

  const handlePreset = (preset: 'today' | 'tomorrow' | '3days' | 'nextweek') => {
    const now = new Date();
    let target = now;
    if (preset === 'today') target = now;
    else if (preset === 'tomorrow') target = addDays(now, 1);
    else if (preset === '3days') target = addDays(now, 3);
    else if (preset === 'nextweek') target = addDays(now, 7);

    handleSelectDay(target);
    setCurrentMonth(target);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(null);
    onChange(null);
  };

  // Calendar matrix calculation
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const displayText = selectedDate
    ? includeTime
      ? format(selectedDate, 'MMM d, yyyy · h:mm a')
      : `${format(selectedDate, 'MMM d, yyyy')} (End of Day)`
    : placeholder;

  return (
    <div className={`relative inline-block w-full ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-[#ECEFF4] hover:border-[#F26A3D]/50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40"
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="w-3.5 h-3.5 text-[#F26A3D] shrink-0" />
          <span className={selectedDate ? 'font-medium' : 'text-[#7B8191] dark:text-[#636C7E]'}>
            {displayText}
          </span>
        </div>

        {selectedDate ? (
          <div
            onClick={handleClear}
            className="p-1 rounded-md text-[#7B8191] hover:text-[#D6453D] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Clear date"
          >
            <X className="w-3.5 h-3.5" />
          </div>
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#7B8191] rotate-90" />
        )}
      </button>

      {/* Popover Calendar Modal */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-72 sm:w-80 bg-white dark:bg-[#151821] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-4 shadow-xl select-none animate-in fade-in zoom-in-95 duration-150">
          {/* Quick Presets Bar */}
          <div className="flex items-center gap-1 pb-3 mb-3 border-b border-[#E8E3D9] dark:border-[#262B36] overflow-x-auto text-[10px] font-mono">
            <button
              type="button"
              onClick={() => handlePreset('today')}
              className="px-2 py-1 rounded-md bg-slate-100 dark:bg-[#1E232F] hover:bg-[#F26A3D]/10 hover:text-[#F26A3D] transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePreset('tomorrow')}
              className="px-2 py-1 rounded-md bg-slate-100 dark:bg-[#1E232F] hover:bg-[#F26A3D]/10 hover:text-[#F26A3D] transition-colors"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => handlePreset('3days')}
              className="px-2 py-1 rounded-md bg-slate-100 dark:bg-[#1E232F] hover:bg-[#F26A3D]/10 hover:text-[#F26A3D] transition-colors"
            >
              In 3 Days
            </button>
            <button
              type="button"
              onClick={() => handlePreset('nextweek')}
              className="px-2 py-1 rounded-md bg-slate-100 dark:bg-[#1E232F] hover:bg-[#F26A3D]/10 hover:text-[#F26A3D] transition-colors"
            >
              Next Week
            </button>
          </div>

          {/* Month Header Navigation */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-serif text-base font-normal text-[#15181F] dark:text-[#ECEFF4]">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 rounded-lg text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 rounded-lg text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono text-[#7B8191] dark:text-[#636C7E] mb-1">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-xs">
            {calendarDays.map((day) => {
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isCurrentDay = isToday(day);

              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  onClick={() => handleSelectDay(day)}
                  className={`h-8 rounded-lg flex items-center justify-center font-medium transition-all ${
                    isSelected
                      ? 'bg-[#F26A3D] text-white font-bold shadow-xs'
                      : isCurrentDay
                      ? 'border border-[#F26A3D] text-[#F26A3D] font-semibold'
                      : isCurrentMonth
                      ? 'text-[#15181F] dark:text-[#ECEFF4] hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'text-[#7B8191]/40 dark:text-[#636C7E]/40 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Optional Time Configuration */}
          <div className="mt-3 pt-3 border-t border-[#E8E3D9] dark:border-[#262B36] space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-[#5A6070] dark:text-[#A0A8B6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTime}
                  onChange={(e) => handleToggleIncludeTime(e.target.checked)}
                  className="rounded text-[#F26A3D] focus:ring-[#F26A3D]"
                />
                <span>Set specific deadline time</span>
              </label>
              {!includeTime && (
                <span className="text-[10px] font-mono text-[#7B8191]">Default: 11:59 PM</span>
              )}
            </div>

            {includeTime && (
              <div className="flex items-center gap-2 pt-1 animate-in fade-in duration-100">
                <Clock className="w-3.5 h-3.5 text-[#F26A3D] shrink-0" />
                <select
                  value={timeHour}
                  onChange={(e) => handleTimeChange(Number(e.target.value), timeMinute)}
                  className="px-2 py-1 text-xs bg-slate-50 dark:bg-[#1E232F] border border-[#E8E3D9] dark:border-[#262B36] rounded-md text-[#15181F] dark:text-white"
                >
                  {Array.from({ length: 24 }, (_, i) => {
                    const h = i % 12 === 0 ? 12 : i % 12;
                    const ampm = i < 12 ? 'AM' : 'PM';
                    return (
                      <option key={i} value={i}>
                        {h}:00 {ampm}
                      </option>
                    );
                  })}
                </select>

                <select
                  value={timeMinute}
                  onChange={(e) => handleTimeChange(timeHour, Number(e.target.value))}
                  className="px-2 py-1 text-xs bg-slate-50 dark:bg-[#1E232F] border border-[#E8E3D9] dark:border-[#262B36] rounded-md text-[#15181F] dark:text-white"
                >
                  <option value={0}>:00</option>
                  <option value={15}>:15</option>
                  <option value={30}>:30</option>
                  <option value={45}>:45</option>
                </select>
              </div>
            )}
          </div>

          {/* Popover Done action */}
          <div className="mt-3 pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F26A3D] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Check className="w-3 h-3" />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

