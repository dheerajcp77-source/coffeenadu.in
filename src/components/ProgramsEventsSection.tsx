import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  MapPin,
  Share2,
  Users,
} from 'lucide-react';
import {
  KOPPA_PLACE_OPTIONS,
  getKannadaLocationLabel,
  matchesSelectedLocation,
} from '../constants/newsData';
import { recordEventView } from '../services/eventsStore';
import type { ProgramEvent } from '../types/news';
import { buildEventPublicUrl } from '../utils/slug';
import { NewsImage } from './NewsImage';

interface ProgramsEventsSectionProps {
  events: ProgramEvent[];
  directEvent?: ProgramEvent | null;
  isLoading?: boolean;
  selectedEventId: string | null;
  hasMoreEvents?: boolean;
  loadingMoreEvents?: boolean;
  quotaExceeded?: boolean;
  onLoadMoreEvents?: () => void;
  onSelectEvent: (event: ProgramEvent) => void;
  onCloseEvent: () => void;
  onBackToNews: () => void;
}

type EventViewMode = 'today' | 'tomorrow' | 'yesterday' | 'all' | 'date';

function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(base: Date, offsetDays: number): string {
  const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  return toLocalYmd(copy);
}

function formatReadableEventDate(ymd: string, todayYmd: string, tomorrowYmd: string, yesterdayYmd: string): string {
  if (ymd === todayYmd) return `Today · ${ymd}`;
  if (ymd === tomorrowYmd) return `Tomorrow · ${ymd}`;
  if (ymd === yesterdayYmd) return `Yesterday · ${ymd}`;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ymd;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ProgramsEventsSection({
  events,
  directEvent = null,
  isLoading = false,
  selectedEventId,
  hasMoreEvents = false,
  loadingMoreEvents = false,
  quotaExceeded = false,
  onLoadMoreEvents,
  onSelectEvent,
  onCloseEvent,
  onBackToNews,
}: ProgramsEventsSectionProps) {
  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => toLocalYmd(now), [now]);
  const tomorrowYmd = useMemo(() => addDaysYmd(now, 1), [now]);
  const yesterdayYmd = useMemo(() => addDaysYmd(now, -1), [now]);

  const [viewMode, setViewMode] = useState<EventViewMode>('all');
  const [selectedDateYmd, setSelectedDateYmd] = useState<string>(todayYmd);
  const [placeFilter, setPlaceFilter] = useState<string>('All');
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    const fromList = events.find((ev) => ev.id === selectedEventId);
    if (fromList) return fromList;
    if (directEvent && directEvent.id === selectedEventId) {
      return directEvent;
    }
    return null;
  }, [events, selectedEventId, directEvent]);

  useEffect(() => {
    if (!selectedEvent?.id) return;
    void recordEventView(selectedEvent.id);
  }, [selectedEvent?.id]);

  const getEventShareUrl = (eventId: string) => buildEventPublicUrl(eventId);

  const handleCopyEventLink = async (eventId: string) => {
    try {
      await navigator.clipboard.writeText(getEventShareUrl(eventId));
      setCopiedEventId(eventId);
      window.setTimeout(() => {
        setCopiedEventId((curr) => (curr === eventId ? null : curr));
      }, 2200);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleShareEvent = async (ev: ProgramEvent) => {
    const shareUrl = getEventShareUrl(ev.id);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: ev.titleKannada,
          text: `${ev.titleKannada} (${ev.eventDate} · ${ev.eventTime})`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyEventLink(ev.id);
  };

  const placeFilteredEvents = useMemo(
    () => events.filter((ev) => matchesSelectedLocation(ev.location, placeFilter)),
    [events, placeFilter]
  );

  // Map YYYY-MM-DD -> count of scheduled events for calendar green markers
  const eventCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const ev of placeFilteredEvents) {
      map.set(ev.eventDate, (map.get(ev.eventDate) || 0) + 1);
    }
    return map;
  }, [placeFilteredEvents]);

  const displayedEvents = useMemo(() => {
    if (viewMode === 'today') {
      return placeFilteredEvents.filter((ev) => ev.eventDate === todayYmd);
    }
    if (viewMode === 'tomorrow') {
      return placeFilteredEvents.filter((ev) => ev.eventDate === tomorrowYmd);
    }
    if (viewMode === 'yesterday') {
      return placeFilteredEvents.filter((ev) => ev.eventDate === yesterdayYmd);
    }
    if (viewMode === 'date') {
      return placeFilteredEvents.filter((ev) => ev.eventDate === selectedDateYmd);
    }
    return placeFilteredEvents;
  }, [
    placeFilteredEvents,
    viewMode,
    todayYmd,
    tomorrowYmd,
    yesterdayYmd,
    selectedDateYmd,
  ]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1);
    const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const startWeekday = firstDay.getDay();
    const cells: { key: string; day: number | null; ymd: string | null }[] = [];

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ key: `blank-${i}`, day: null, ymd: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const mStr = String(calendarMonth.month + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const ymd = `${calendarMonth.year}-${mStr}-${dStr}`;
      cells.push({ key: ymd, day, ymd });
    }
    return cells;
  }, [calendarMonth]);

  const monthHeading = new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric' }
  );

  const handleShiftMonth = (delta: number) => {
    const next = new Date(calendarMonth.year, calendarMonth.month + delta, 1);
    setCalendarMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  const handleClickCalendarDate = (ymd: string) => {
    setSelectedDateYmd(ymd);
    setViewMode('date');
  };

  const todayCount = eventCountByDate.get(todayYmd) || 0;
  const tomorrowCount = eventCountByDate.get(tomorrowYmd) || 0;
  const yesterdayCount = eventCountByDate.get(yesterdayYmd) || 0;

  if (selectedEventId && !selectedEvent && isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading program details"
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6"
      >
        <div className="h-8 w-44 rounded bg-slate-200 animate-pulse" />
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
          <div className="h-4 w-52 rounded bg-slate-200 animate-pulse" />
          <div className="h-8 w-4/5 rounded bg-slate-200 animate-pulse" />
          <div className="aspect-[16/9] w-full rounded-lg bg-slate-200 animate-pulse" />
        </div>
      </section>
    );
  }

  if (selectedEvent) {
    return (
      <section
        aria-label="Program details"
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 select-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <button
            type="button"
            onClick={onCloseEvent}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-[#0F274A] transition-colors cursor-pointer min-h-[40px] px-2 -ml-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to Programs Calendar</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleShareEvent(selectedEvent)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-md transition-colors cursor-pointer min-h-[38px]"
            >
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Share Program</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopyEventLink(selectedEvent.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer min-h-[38px]"
            >
              {copiedEventId === selectedEvent.id ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                  <span>Link Copied</span>
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        <article className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 mt-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1 text-emerald-800 tabular-nums">
              <CalendarDays className="w-4 h-4" aria-hidden="true" />
              <span>{formatReadableEventDate(selectedEvent.eventDate, todayYmd, tomorrowYmd, yesterdayYmd)}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-[#0F274A] tabular-nums">
              <Clock className="w-4 h-4" aria-hidden="true" />
              <span>{selectedEvent.eventTime}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-kannada text-slate-800">
              <MapPin className="w-4 h-4 text-red-600" aria-hidden="true" />
              <span>{getKannadaLocationLabel(selectedEvent.location)}</span>
            </span>
          </div>

          <h1 className="font-kannada text-2xl sm:text-3xl font-bold text-slate-950 leading-snug">
            {selectedEvent.titleKannada}
          </h1>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 pb-4 border-b border-slate-200">
            <Users className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <span>
              Organized by <strong className="font-semibold text-slate-900">{selectedEvent.organizer}</strong>
            </span>
          </div>

          {selectedEvent.imageUrl && (
            <NewsImage
              src={selectedEvent.imageUrl}
              alt={selectedEvent.titleKannada}
              fitMode="natural"
              maxHeightClass="max-h-[540px]"
              className="rounded-lg border border-slate-200"
              watermarkApplied={Boolean(selectedEvent.watermarkApplied)}
            />
          )}

          <div className="font-kannada text-base text-slate-800 leading-[1.85] whitespace-pre-line max-w-prose">
            {selectedEvent.descriptionKannada}
          </div>
        </article>
      </section>
    );
  }

  return (
    <section
      aria-label="Programs and Events Calendar"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 select-none"
    >
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToNews}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0F274A] cursor-pointer mb-1"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to News</span>
          </button>
          <div className="flex items-center gap-2.5">
            <CalendarDays className="w-6 h-6 text-emerald-700 shrink-0" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F274A] tracking-tight">
              Programs &amp; Events · ಕಾರ್ಯಕ್ರಮಗಳು
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Green-marked dates on the calendar indicate scheduled local programs and events across Koppa &amp; Malnad. Tap any date to view details.
          </p>
        </div>

        {/* Kannada Place Filter */}
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="events-place-filter" className="text-xs font-semibold text-slate-600">
            Place:
          </label>
          <select
            id="events-place-filter"
            value={placeFilter}
            onChange={(e) => setPlaceFilter(e.target.value)}
            className="font-kannada px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[40px]"
          >
            <option value="All">ಎಲ್ಲಾ ಸ್ಥಳಗಳು (Show All)</option>
            {KOPPA_PLACE_OPTIONS.map((place) => (
              <option key={place.id} value={place.labelKn}>
                {place.labelKn}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Filter Tabs: Today, Tomorrow, Yesterday, All Scheduled */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setViewMode('today');
            setSelectedDateYmd(todayYmd);
          }}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap min-h-[40px] ${
            viewMode === 'today'
              ? 'bg-[#0F274A] text-white border-[#0F274A]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          Today ({todayCount})
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode('tomorrow');
            setSelectedDateYmd(tomorrowYmd);
          }}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap min-h-[40px] ${
            viewMode === 'tomorrow'
              ? 'bg-[#0F274A] text-white border-[#0F274A]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          Tomorrow ({tomorrowCount})
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode('yesterday');
            setSelectedDateYmd(yesterdayYmd);
          }}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap min-h-[40px] ${
            viewMode === 'yesterday'
              ? 'bg-[#0F274A] text-white border-[#0F274A]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          Yesterday ({yesterdayCount})
        </button>
        <button
          type="button"
          onClick={() => setViewMode('all')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap min-h-[40px] ${
            viewMode === 'all'
              ? 'bg-[#0F274A] text-white border-[#0F274A]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          All Scheduled ({placeFilteredEvents.length})
        </button>
        {viewMode === 'date' && (
          <span className="text-xs font-semibold text-emerald-800 px-2">
            Showing Calendar Date: {selectedDateYmd}
          </span>
        )}
      </div>

      {/* Main Split: Interactive Calendar + Scheduled Events List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Calendar Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#0F274A]">{monthHeading}</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleShiftMonth(-1)}
                aria-label="Previous month"
                className="p-2 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
                  setSelectedDateYmd(todayYmd);
                  setViewMode('today');
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#0F274A] bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleShiftMonth(1)}
                aria-label="Next month"
                className="p-2 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map((dayName) => (
              <div
                key={dayName}
                className="py-1.5 text-[11px] font-semibold text-slate-500"
              >
                {dayName}
              </div>
            ))}

            {calendarCells.map((cell) => {
              if (!cell.day || !cell.ymd) {
                return <div key={cell.key} className="h-12" />;
              }
              const count = eventCountByDate.get(cell.ymd) || 0;
              const hasEvents = count > 0;
              const isSelected = viewMode === 'date' && selectedDateYmd === cell.ymd;
              const isToday = cell.ymd === todayYmd;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => handleClickCalendarDate(cell.ymd!)}
                  aria-label={`${cell.ymd}${hasEvents ? `, ${count} scheduled events` : ''}`}
                  className={`relative h-12 rounded-lg flex flex-col items-center justify-center text-xs font-semibold tabular-nums transition-colors cursor-pointer border ${
                    hasEvents
                      ? isSelected
                        ? 'bg-emerald-700 text-white border-[#0F274A] ring-2 ring-[#0F274A]'
                        : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                      : isSelected
                      ? 'bg-[#0F274A] text-white border-[#0F274A]'
                      : isToday
                      ? 'bg-amber-50 text-[#0F274A] border-amber-400 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{cell.day}</span>
                  {hasEvents && (
                    <span className="text-[10px] leading-none font-bold opacity-95">
                      {count} prog
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-emerald-600 inline-block" aria-hidden="true" />
              <span>Green Date = Program Scheduled</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-amber-50 border border-amber-400 inline-block" aria-hidden="true" />
              <span>Today</span>
            </span>
          </div>
        </div>

        {/* Scheduled Events Feed */}
        <div className="lg:col-span-7 space-y-4">
          {quotaExceeded && (
            <div
              role="status"
              className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed"
            >
              Daily live database read limit temporarily reached. Showing cached programs and events — live updates resume after quota reset.
            </div>
          )}

          {isLoading && displayedEvents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3" aria-busy="true">
              <div className="h-4 w-44 bg-slate-200 rounded animate-pulse" />
              <div className="h-6 w-3/4 bg-slate-200 rounded animate-pulse" />
              <div className="h-24 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : displayedEvents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                No programs or events scheduled for this view
              </h3>
              <p className="text-sm text-slate-600">
                {viewMode === 'date'
                  ? `No events recorded on ${selectedDateYmd}. Dates highlighted in green on the calendar have scheduled programs.`
                  : 'Switch to All Scheduled or tap a green-marked date on the calendar to view upcoming programs.'}
              </p>
              {viewMode !== 'all' && (
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className="mt-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] rounded-lg cursor-pointer min-h-[40px]"
                >
                  Show All Scheduled Events
                </button>
              )}
            </div>
          ) : (
            displayedEvents.map((ev) => (
              <article
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectEvent(ev);
                  }
                }}
                role="button"
                tabIndex={0}
                className="group bg-white border border-slate-200 hover:border-[#0F274A]/40 rounded-xl p-4 sm:p-5 space-y-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="text-emerald-800 tabular-nums">
                      {formatReadableEventDate(ev.eventDate, todayYmd, tomorrowYmd, yesterdayYmd)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-[#0F274A] tabular-nums">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{ev.eventTime}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-kannada text-slate-800">
                      <MapPin className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
                      <span>{getKannadaLocationLabel(ev.location)}</span>
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{ev.organizer}</span>
                  </span>
                </div>

                {ev.imageUrl && (
                  <NewsImage
                    src={ev.imageUrl}
                    alt={ev.titleKannada}
                    fitMode="natural"
                    maxHeightClass="max-h-72"
                    className="rounded-lg border border-slate-200"
                    watermarkApplied={Boolean(ev.watermarkApplied)}
                  />
                )}

                <h2 className="font-kannada text-lg sm:text-xl font-bold text-slate-950 group-hover:text-[#0F274A] transition-colors leading-snug">
                  {ev.titleKannada}
                </h2>
                <p className="font-kannada text-sm text-slate-700 leading-relaxed line-clamp-3 whitespace-pre-line">
                  {ev.descriptionKannada}
                </p>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#0F274A] group-hover:underline">
                    View full details →
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyEventLink(ev.id);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                  >
                    {copiedEventId === ev.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        <span>Copied Link</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            ))
          )}

          {hasMoreEvents && onLoadMoreEvents && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={onLoadMoreEvents}
                disabled={loadingMoreEvents}
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#0F274A] bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-colors cursor-pointer disabled:opacity-60 min-h-[40px]"
              >
                {loadingMoreEvents ? 'Loading older programs...' : 'Load More Programs'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
