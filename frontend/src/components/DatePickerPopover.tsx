import React, { useState, useEffect, useRef } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RotateCcw } from 'lucide-react';

interface DatePickerPopoverProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
}

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  selectedDate,
  onSelectDate,
  onClose,
}) => {
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(selectedDate));
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Sync viewMonth when selectedDate changes externally
  useEffect(() => {
    setViewMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-2 z-50 w-72 p-3 bg-white dark:bg-[#151922] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Month & Year Navigation Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E8E3D9] dark:border-[#262B36]">
        <button
          type="button"
          onClick={() => setViewMonth((prev) => subMonths(prev, 1))}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2330] text-[#5A6070] dark:text-[#A0A8B6] transition-colors cursor-pointer"
          title="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="font-serif text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4]">
          {format(viewMonth, 'MMMM yyyy')}
        </span>

        <button
          type="button"
          onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2330] text-[#5A6070] dark:text-[#A0A8B6] transition-colors cursor-pointer"
          title="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-[#7B8191] uppercase tracking-wider font-semibold">
        {weekDayLabels.map((day) => (
          <div key={day} className="py-0.5">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 text-xs">
        {calendarDays.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrMonth = isSameMonth(day, viewMonth);
          const isCurrentToday = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => {
                onSelectDate(day);
                onClose();
              }}
              className={`h-8 w-8 mx-auto flex items-center justify-center rounded-lg font-mono text-xs transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#C74E22] dark:bg-[#F26A3D] text-white font-bold shadow-xs'
                  : isCurrentToday
                  ? 'border border-[#F26A3D] text-[#C74E22] dark:text-[#FFA67F] font-semibold hover:bg-slate-100 dark:hover:bg-[#1E2330]'
                  : !isCurrMonth
                  ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[#1A1E27]'
                  : 'text-[#15181F] dark:text-[#ECEFF4] hover:bg-slate-100 dark:hover:bg-[#1E2330]'
              }`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* Quick navigation shortcuts */}
      <div className="flex items-center justify-between pt-2 border-t border-[#E8E3D9] dark:border-[#262B36] text-[11px] font-mono">
        <button
          type="button"
          onClick={() => {
            const today = new Date();
            onSelectDate(today);
            onClose();
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[#C74E22] dark:text-[#FFA67F] hover:bg-amber-500/10 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Today</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const tm = new Date();
            tm.setDate(tm.getDate() + 1);
            onSelectDate(tm);
            onClose();
          }}
          className="px-2.5 py-1 rounded-lg text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-[#1E2330] transition-colors cursor-pointer"
        >
          Tomorrow
        </button>

        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[#7B8191] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};

