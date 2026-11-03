import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar, AlertCircle, Info, Sparkles, Pin, CheckCircle2, Navigation, Coffee } from 'lucide-react';
import { format, parseISO, isSameDay } from 'date-fns';

export interface TimelineBlock {
  id: string;
  kind: 'task' | 'break' | 'buffer' | 'fixed_event' | 'prep';
  title: string;
  starts_at: string;
  ends_at: string;
  task_id?: string;
  rationale?: string[];
  pinned?: boolean;
  color?: string;
  is_simulation?: boolean;
}

interface TimelineCanvasProps {
  blocks: TimelineBlock[];
  date?: Date;
  onBlockClick?: (block: TimelineBlock) => void;
  startHour?: number; // User operating start hour (default 9)
  endHour?: number;   // User operating end hour (default 18)
  isSimulationMode?: boolean;
  onScroll?: (scrollTop: number) => void;
  syncScrollTop?: number;
}

interface PositionedBlock extends TimelineBlock {
  topPx: number;
  heightPx: number;
  colIndex: number;
  colCount: number;
}

const HOUR_HEIGHT = 80; // pixels per hour for optimal breathing room and legible cards
const TOTAL_HOURS = 24; // 12 AM to 11 PM (0-23)
const MIN_TASK_HEIGHT = 34; // Minimum height for legible short tasks
const MIN_BREAK_HEIGHT = 28; // Minimum height for break cards
const GUTTER_PX = 4; // Crisp vertical gutter between adjacent blocks

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
  blocks = [],
  date = new Date(),
  onBlockClick,
  startHour = 9,
  endHour = 18,
  isSimulationMode = false,
  onScroll,
  syncScrollTop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedBlock, setSelectedBlock] = useState<TimelineBlock | null>(null);
  const [nowMinute, setNowMinute] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const isToday = isSameDay(date, new Date());
  const currentHour = Math.floor(nowMinute / 60);

  // Sync scroll from external controller if provided
  useEffect(() => {
    if (
      syncScrollTop !== undefined &&
      containerRef.current &&
      Math.abs(containerRef.current.scrollTop - syncScrollTop) > 2
    ) {
      containerRef.current.scrollTop = syncScrollTop;
    }
  }, [syncScrollTop]);

  // Update current time indicator every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setNowMinute(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Initial auto-scroll to operating start or current time
  useEffect(() => {
    if (containerRef.current) {
      const targetHour = isToday
        ? Math.max(0, Math.floor(nowMinute / 60) - 1)
        : Math.max(0, startHour - 1);
      containerRef.current.scrollTop = targetHour * HOUR_HEIGHT;
    }
  }, [date, isToday, startHour]);

  const scrollToCurrentTime = () => {
    if (containerRef.current) {
      const targetHour = Math.max(0, Math.floor(nowMinute / 60) - 1);
      containerRef.current.scrollTo({
        top: targetHour * HOUR_HEIGHT,
        behavior: 'smooth',
      });
    }
  };

  // Overlap handling & positioning algorithm
  const positionedBlocks: PositionedBlock[] = useMemo(() => {
    if (!blocks || blocks.length === 0) return [];

    // Parse and normalize time into minutes from midnight
    interface ParsedItem {
      block: TimelineBlock;
      startMin: number;
      endMin: number;
    }

    const items: ParsedItem[] = blocks.map((b) => {
      const s = parseISO(b.starts_at);
      const e = parseISO(b.ends_at);
      const sMin = s.getHours() * 60 + s.getMinutes();
      let eMin = e.getHours() * 60 + e.getMinutes();
      if (eMin <= sMin) eMin = sMin + 30; // fallback minimal duration
      return { block: b, startMin: sMin, endMin: eMin };
    });

    // Sort chronologically by start minute, then by end minute
    items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    // Group into clusters based on ACTUAL event time intervals
    const clusters: ParsedItem[][] = [];
    let currentCluster: ParsedItem[] = [];
    let clusterEnd = -1;

    for (const item of items) {
      if (currentCluster.length === 0) {
        currentCluster.push(item);
        clusterEnd = item.endMin;
      } else if (item.startMin < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMin);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.endMin;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    const result: PositionedBlock[] = [];

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        // Non-overlapping sequential activity: full width single column
        const item = cluster[0];
        const durationMin = item.endMin - item.startMin;
        const isBreak = item.block.kind === 'break' || item.block.kind === 'buffer';
        const minH = isBreak ? MIN_BREAK_HEIGHT : MIN_TASK_HEIGHT;
        const naturalTop = (item.startMin / 60) * HOUR_HEIGHT;
        const heightPx = Math.max(minH, (durationMin / 60) * HOUR_HEIGHT - GUTTER_PX);

        // Stacking prevention: ensure sequential card never starts above previous card's bottom
        const prevBlock = result.length > 0 ? result[result.length - 1] : null;
        let topPx = naturalTop;
        if (prevBlock && prevBlock.colIndex === 0 && prevBlock.colCount === 1) {
          const prevBottom = prevBlock.topPx + prevBlock.heightPx + GUTTER_PX;
          topPx = Math.max(naturalTop, prevBottom);
        }

        result.push({
          ...item.block,
          topPx,
          heightPx,
          colIndex: 0,
          colCount: 1,
        });
        continue;
      }

      // Legitimate overlapping items: allocate columns
      const columns: ParsedItem[][] = [];
      for (const item of cluster) {
        let placed = false;
        for (let col = 0; col < columns.length; col++) {
          const lastInCol = columns[col][columns[col].length - 1];
          if (lastInCol.endMin <= item.startMin) {
            columns[col].push(item);
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([item]);
        }
      }

      const totalCols = columns.length;
      for (let c = 0; c < totalCols; c++) {
        let prevInColBottom = 0;
        for (const item of columns[c]) {
          const durationMin = item.endMin - item.startMin;
          const isBreak = item.block.kind === 'break' || item.block.kind === 'buffer';
          const minH = isBreak ? MIN_BREAK_HEIGHT : MIN_TASK_HEIGHT;
          const naturalTop = (item.startMin / 60) * HOUR_HEIGHT;
          const topPx = Math.max(naturalTop, prevInColBottom);
          const heightPx = Math.max(minH, (durationMin / 60) * HOUR_HEIGHT - GUTTER_PX);
          prevInColBottom = topPx + heightPx + GUTTER_PX;

          result.push({
            ...item.block,
            topPx,
            heightPx,
            colIndex: c,
            colCount: totalCols,
          });
        }
      }
    }

    // Sort by topPx for consistent render & tab order
    result.sort((a, b) => a.topPx - b.topPx || a.colIndex - b.colIndex);
    return result;
  }, [blocks]);

  const handleBlockSelect = (block: TimelineBlock) => {
    setSelectedBlock(block);
    if (onBlockClick) onBlockClick(block);
  };

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i);
  const nowPx = (nowMinute / 60) * HOUR_HEIGHT;

  return (
    <div className="relative flex flex-col w-full bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-sm overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FFF1EB] dark:bg-[#2A1710] flex items-center justify-center text-[#F26A3D]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
                {format(date, 'EEEE, MMMM d, yyyy')}
              </h3>
              {isToday && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#F26A3D] font-semibold border border-[#F26A3D]/20">
                  Today
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
              24-Hour Timeline Canvas • Operating window {startHour % 12 === 0 ? 12 : startHour % 12}:00 {startHour < 12 ? 'AM' : 'PM'} – {endHour % 12 === 0 ? 12 : endHour % 12}:00 {endHour < 12 ? 'AM' : 'PM'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isToday && (
            <button
              onClick={scrollToCurrentTime}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white text-xs font-mono transition-colors cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-[#F26A3D]" />
              <span>Jump to Now</span>
            </button>
          )}

          {isSimulationMode && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>What-If Simulation</span>
            </div>
          )}
        </div>
      </div>

      {/* 24-Hour Scrollable Canvas */}
      <div
        ref={containerRef}
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="relative h-[680px] overflow-y-auto overflow-x-hidden scroll-smooth select-none"
      >
        <div
          className="relative flex min-w-[500px]"
          style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        >
          {/* Time Axis Labels */}
          <div className="w-20 sm:w-22 shrink-0 select-none pr-3 border-r border-[#E8E3D9] dark:border-[#262B36] bg-[#FAF8F5]/50 dark:bg-[#12151C]/60 z-10 sticky left-0">
            {hours.map((h) => {
              const displayHour = h % 12 === 0 ? 12 : h % 12;
              const ampm = h < 12 ? 'AM' : 'PM';
              const isOperating = h >= startHour && h < endHour;
              return (
                <div
                  key={h}
                  className="relative text-right"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span
                    className={`inline-block text-[12px] sm:text-[13px] font-mono font-medium -translate-y-2.5 transition-colors ${
                      isOperating
                        ? 'text-[#15181F] dark:text-[#ECEFF4] font-semibold'
                        : 'text-[#7A8294] dark:text-[#7A8498]'
                    }`}
                  >
                    {displayHour}:00 {ampm}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Schedule Canvas Body */}
          <div className="relative flex-1">
            {/* Non-Operating Hours Background Shading */}
            {/* Morning Shading (0 to startHour) */}
            {startHour > 0 && (
              <div
                className="absolute left-0 right-0 bg-[#F5F2EB]/50 dark:bg-[#0D1017]/70 border-b border-dashed border-[#E8E3D9] dark:border-[#262B36] pointer-events-none"
                style={{
                  top: 0,
                  height: `${startHour * HOUR_HEIGHT}px`,
                }}
              >
                <div className="p-3 text-[10px] font-mono uppercase tracking-wider text-[#8C93A3] dark:text-[#636C7E]">
                  Rest / Off-hours
                </div>
              </div>
            )}

            {/* Evening Shading (endHour to 24) */}
            {endHour < 24 && (
              <div
                className="absolute left-0 right-0 bg-[#F5F2EB]/50 dark:bg-[#0D1017]/70 border-t border-dashed border-[#E8E3D9] dark:border-[#262B36] pointer-events-none"
                style={{
                  top: `${endHour * HOUR_HEIGHT}px`,
                  height: `${(24 - endHour) * HOUR_HEIGHT}px`,
                }}
              >
                <div className="p-3 text-[10px] font-mono uppercase tracking-wider text-[#8C93A3] dark:text-[#636C7E]">
                  Evening / Off-hours
                </div>
              </div>
            )}

            {/* Hour Grid Lines & Past/Current Differentiation */}
            {hours.map((h) => {
              const isPast = isToday && h < currentHour;
              const isCurrent = isToday && h === currentHour;
              return (
                <div
                  key={h}
                  className={`absolute left-0 right-0 border-b border-[#E8E3D9]/50 dark:border-[#262B36]/50 pointer-events-none transition-colors ${
                    isCurrent
                      ? 'bg-[#F26A3D]/[0.025] dark:bg-[#F26A3D]/[0.04]'
                      : isPast
                      ? 'bg-slate-500/[0.015] dark:bg-black/[0.12]'
                      : ''
                  }`}
                  style={{
                    top: `${h * HOUR_HEIGHT}px`,
                    height: `${HOUR_HEIGHT}px`,
                  }}
                >
                  {/* 30-minute subtle dashed divider */}
                  <div className="absolute left-0 right-0 top-1/2 border-b border-dashed border-[#E8E3D9]/25 dark:border-[#262B36]/25" />
                </div>
              );
            })}

            {/* Current Time Indicator Line */}
            {isToday && (
              <div
                className="absolute left-0 right-0 z-30 flex items-center pointer-events-none transition-all duration-300"
                style={{ top: `${nowPx}px` }}
              >
                <div className="w-3 h-3 rounded-full bg-[#F26A3D] shadow-[0_0_8px_#F26A3D] -ml-1.5 ring-2 ring-white dark:ring-[#12151C]" />
                <div className="flex-1 h-[2px] bg-[#F26A3D] shadow-[0_0_6px_#F26A3D]" />
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F26A3D] text-white shadow-sm mr-4">
                  NOW {format(new Date(), 'h:mm a')}
                </span>
              </div>
            )}

            {/* Render Positioned Blocks with Overlap Multi-column Support */}
            {positionedBlocks.map((block) => {
              const isFixed = block.kind === 'fixed_event';
              const isBreak = block.kind === 'break' || block.kind === 'buffer';
              const isSim = block.is_simulation;
              const isShort = block.heightPx < 52;

              const colWidthPercent = 100 / block.colCount;
              const leftPercent = block.colIndex * colWidthPercent;

              let blockClasses =
                'absolute rounded-xl text-xs transition-all cursor-pointer shadow-xs overflow-hidden group ';

              if (isSim) {
                blockClasses +=
                  'bg-amber-500/10 dark:bg-amber-950/40 border-2 border-dashed border-amber-500 text-amber-950 dark:text-amber-200 hover:ring-2 hover:ring-amber-500/40 ';
              } else if (isFixed) {
                blockClasses +=
                  'bg-[#EEF0FF] dark:bg-[#181B38] border-l-4 border-l-[#5B63F0] border-t border-r border-b border-[#5B63F0]/30 text-[#15181F] dark:text-[#ECEFF4] hover:border-[#5B63F0] ';
              } else if (isBreak) {
                blockClasses +=
                  'bg-[#FAF8F5] dark:bg-[#161922] border-l-4 border-l-amber-500 border-t border-r border-b border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] italic ';
              } else {
                // Focus task block
                blockClasses +=
                  'bg-gradient-to-r from-[#FFF5F0] via-white to-[#FAF8F5] dark:from-[#251610] dark:via-[#161922] dark:to-[#12151C] border-l-4 border-l-[#F26A3D] border-t border-r border-b border-[#F26A3D]/30 text-[#15181F] dark:text-[#ECEFF4] hover:border-[#F26A3D] ';
              }

              if (selectedBlock?.id === block.id) {
                blockClasses += ' ring-2 ring-[#F26A3D] z-20';
              }

              const formattedStart = format(parseISO(block.starts_at), 'h:mm a');
              const formattedEnd = format(parseISO(block.ends_at), 'h:mm a');
              const durationMin = Math.round((parseISO(block.ends_at).getTime() - parseISO(block.starts_at).getTime()) / 60000);

              return (
                <motion.div
                  key={block.id}
                  onClick={() => handleBlockSelect(block)}
                  whileHover={{ scale: 1.006, zIndex: 25 }}
                  className={`${blockClasses} ${isShort ? 'px-3 py-1.5' : 'px-3.5 py-2 sm:py-2.5 flex flex-col justify-between'}`}
                  style={{
                    top: `${block.topPx}px`,
                    height: `${block.heightPx}px`,
                    left: `calc(${leftPercent}% + 6px)`,
                    width: `calc(${colWidthPercent}% - 10px)`,
                  }}
                >
                  {isShort ? (
                    /* Compact Single-Row Layout for short blocks (< 52px): Title on left, Time + Duration on right */
                    <div
                      className="flex items-center justify-between gap-2.5 h-full w-full min-w-0"
                      title={`${block.title} (${formattedStart} – ${formattedEnd}, ${durationMin}m)`}
                    >
                      {/* Left: Indicator Icon + Task Title */}
                      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        {isFixed ? (
                          <Calendar className="w-3.5 h-3.5 text-[#5B63F0] shrink-0" />
                        ) : isSim ? (
                          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        ) : isBreak ? (
                          <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-[#F26A3D] shrink-0" />
                        )}
                        <span className="font-semibold text-[13px] sm:text-[14px] truncate text-[#15181F] dark:text-[#ECEFF4] leading-tight">
                          {block.title}
                        </span>
                        {block.pinned && (
                          <span className="shrink-0 hidden sm:flex items-center gap-0.5 text-[9px] font-mono font-semibold px-1 py-0.5 rounded bg-[#E0E4FF] dark:bg-[#202555] text-[#3D45D8] dark:text-[#9EA8FF]">
                            <Pin className="w-2.5 h-2.5" /> Fixed
                          </span>
                        )}
                      </div>

                      {/* Right: Time Range & Duration Badge */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] sm:text-[12px] font-mono font-medium text-[#484F5E] dark:text-[#CBD2E1] whitespace-nowrap">
                          {block.colCount > 1 ? formattedStart : `${formattedStart} – ${formattedEnd}`}
                        </span>
                        {durationMin > 0 && (
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[#484F5E] dark:text-[#CBD2E1] shrink-0">
                            {durationMin}m
                          </span>
                        )}
                        {block.colCount > 1 && (
                          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-semibold shrink-0" title="Overlapping time slot">
                            Parallel
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Standard Multi-Row Layout for standard/longer blocks (>= 52px) */
                    <div className="flex flex-col justify-between h-full w-full min-w-0" title={`${block.title} (${formattedStart} – ${formattedEnd}, ${durationMin}m)`}>
                      {/* Top Row: Icon + Title on left, badges on right */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isFixed ? (
                            <Calendar className="w-4 h-4 text-[#5B63F0] shrink-0" />
                          ) : isSim ? (
                            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                          ) : isBreak ? (
                            <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#F26A3D] shrink-0" />
                          )}
                          <span className="font-semibold text-[14px] sm:text-[15px] truncate text-[#15181F] dark:text-[#ECEFF4] leading-snug">
                            {block.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {block.colCount > 1 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-semibold" title="Overlapping time slot">
                              Parallel
                            </span>
                          )}
                          {block.pinned && (
                            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#E0E4FF] dark:bg-[#202555] text-[#3D45D8] dark:text-[#9EA8FF]">
                              <Pin className="w-2.5 h-2.5" /> Fixed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Row: Time Range on left, Duration Badge on right */}
                      <div className="flex items-center justify-between gap-2 text-[12px] sm:text-[13px] font-mono font-medium text-[#484F5E] dark:text-[#CBD2E1] mt-auto pt-1">
                        <span>
                          {formattedStart} – {formattedEnd}
                        </span>
                        {durationMin > 0 && (
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[#484F5E] dark:text-[#CBD2E1]">
                            {durationMin}m
                          </span>
                        )}
                      </div>

                      {/* Rationale hint for tall blocks (>= 80px) */}
                      {block.rationale && block.rationale.length > 0 && block.heightPx >= 80 && (
                        <div className="mt-1 text-[11px] text-[#1B7F83] dark:text-[#28A5AA] truncate font-sans">
                          💡 {block.rationale[0]}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Empty Canvas Prompt */}
            {blocks.length === 0 && (
              <div
                className="absolute inset-x-0 flex flex-col items-center justify-center text-center p-8 pointer-events-none text-[#5A6070] dark:text-[#A0A8B6]"
                style={{ top: `${startHour * HOUR_HEIGHT}px`, height: `${(endHour - startHour) * HOUR_HEIGHT}px` }}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#FFF1EB] dark:bg-[#2A1710] flex items-center justify-center text-[#F26A3D] mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
                  Your day canvas is open
                </p>
                <p className="text-xs max-w-sm mt-1 text-[#7B8191] dark:text-[#A0A8B6]">
                  Speak into the Voice Planning Dock or enter your commitments to unfold a balanced, deterministic schedule.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Block Details Inspector Drawer */}
      <AnimatePresence>
        {selectedBlock && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-[#E8E3D9] dark:border-[#262B36] bg-[#FAF8F5] dark:bg-[#161A23] p-4 text-xs"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#15181F] dark:text-[#ECEFF4]">
                    {selectedBlock.title}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                    {selectedBlock.kind}
                  </span>
                  {selectedBlock.is_simulation && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                      Simulation Ghost Block
                    </span>
                  )}
                </div>

                <div className="font-mono text-[#5A6070] dark:text-[#A0A8B6]">
                  {format(parseISO(selectedBlock.starts_at), 'EEEE, MMMM d • h:mm a')} –{' '}
                  {format(parseISO(selectedBlock.ends_at), 'h:mm a')}
                </div>
              </div>

              <button
                onClick={() => setSelectedBlock(null)}
                className="text-[#7B8191] hover:text-[#15181F] dark:hover:text-white px-2 py-1 rounded-md text-xs cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {selectedBlock.rationale && selectedBlock.rationale.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#E8E3D9]/60 dark:border-[#262B36]/60">
                <div className="font-medium text-[#1B7F83] dark:text-[#28A5AA] flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Deterministic Scheduling Rationale:</span>
                </div>
                <ul className="space-y-0.5 pl-4 list-disc text-[#5A6070] dark:text-[#A0A8B6]">
                  {selectedBlock.rationale.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
