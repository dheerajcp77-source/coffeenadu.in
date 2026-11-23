import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { fetchAdmin2CmsState } from '../../services/admin2Client';
import type { Admin2ManagedDraft } from '../../types/admin2';
import type { NewsArticle, ProgramEvent } from '../../types/news';
import { stripRichTextToPlainText } from '../../utils/richText';

interface Admin2CalendarSectionProps {
  articles: NewsArticle[];
  events: ProgramEvent[];
  loadingEvents: boolean;
  onRefreshEvents: () => Promise<void>;
  onOpenAddEvent: () => void;
  onEditEvent: (event: ProgramEvent) => void;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onNavigateNewsScheduled: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function Admin2CalendarSection({
  articles,
  events,
  loadingEvents,
  onRefreshEvents,
  onOpenAddEvent,
  onEditEvent,
  onDeleteEvent,
  onNavigateNewsScheduled,
}: Admin2CalendarSectionProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => toDayKey(new Date()));
  const [scheduledDrafts, setScheduledDrafts] = useState<Admin2ManagedDraft[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadScheduled = async () => {
    try {
      const res = await fetchAdmin2CmsState();
      setScheduledDrafts((res.drafts || []).filter((d) => d.status === 'scheduled' && d.scheduledFor));
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    void loadScheduled();
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ProgramEvent[]>();
    for (const ev of events) {
      const key = (ev.eventDate || '').slice(0, 10);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const scheduledByDay = useMemo(() => {
    const map = new Map<string, Admin2ManagedDraft[]>();
    for (const d of scheduledDrafts) {
      if (!d.scheduledFor) continue;
      const key = d.scheduledFor.slice(0, 10);
      const list = map.get(key) || [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [scheduledDrafts]);

  const publishedByDay = useMemo(() => {
    const map = new Map<string, NewsArticle[]>();
    for (const a of articles) {
      let key = '';
      if (a.publishedTimestamp) {
        key = toDayKey(new Date(a.publishedTimestamp));
      } else if (a.publishedDate) {
        const parsed = new Date(a.publishedDate);
        if (!Number.isNaN(parsed.getTime())) key = toDayKey(parsed);
      }
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [articles]);

  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ key: string; day: number | null }> = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ key: `pad-${i}`, day: null });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dt = new Date(year, month, d);
      cells.push({ key: toDayKey(dt), day: d });
    }
    return cells;
  }, [viewMonth]);

  const selectedEvents = eventsByDay.get(selectedDayKey) || [];
  const selectedScheduled = scheduledByDay.get(selectedDayKey) || [];
  const selectedPublished = publishedByDay.get(selectedDayKey) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Publishing &amp; Programs Calendar
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unified schedule of published articles, upcoming scheduled posts, and Koppa Taluk Programs &amp; Events.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void Promise.all([onRefreshEvents(), loadScheduled()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingEvents ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onNavigateNewsScheduled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Schedule Article
          </button>
          <button
            type="button"
            onClick={onOpenAddEvent}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Program / Event
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Month Grid */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {viewMonth.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDayKey(toDayKey(now));
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Programs &amp; Events
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Scheduled News
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-600" /> Published News
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              if (cell.day === null) {
                return <div key={cell.key} className="h-16 rounded-lg bg-slate-50/40 dark:bg-slate-900/20" />;
              }
              const evCount = eventsByDay.get(cell.key)?.length || 0;
              const schCount = scheduledByDay.get(cell.key)?.length || 0;
              const pubCount = publishedByDay.get(cell.key)?.length || 0;
              const isSelected = selectedDayKey === cell.key;
              const isToday = toDayKey(new Date()) === cell.key;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDayKey(cell.key)}
                  className={`flex h-16 flex-col items-start justify-between rounded-lg border p-2 text-left transition-colors ${
                    isSelected
                      ? 'border-[#0B192C] bg-[#0B192C]/5 dark:border-blue-500 dark:bg-blue-500/10'
                      : 'border-slate-100 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      isToday
                        ? 'rounded bg-[#0B192C] px-1.5 py-0.5 text-[11px] text-white dark:bg-blue-600'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="flex items-center gap-1">
                    {evCount > 0 && <span className="h-2 w-2 rounded-full bg-emerald-500" title={`${evCount} event(s)`} />}
                    {schCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" title={`${schCount} scheduled`} />}
                    {pubCount > 0 && <span className="h-2 w-2 rounded-full bg-blue-600" title={`${pubCount} published`} />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Selected Day Agenda */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#1D4ED8] dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                Agenda for {selectedDayKey}
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {selectedEvents.length + selectedScheduled.length + selectedPublished.length} item(s)
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Scheduled News ({selectedScheduled.length})
              </h4>
              {selectedScheduled.length === 0 ? (
                <p className="text-slate-400">No scheduled articles on this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedScheduled.map((d) => (
                    <div key={d.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {stripRichTextToPlainText(d.titleKannada)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Scheduled at {d.scheduledFor ? new Date(d.scheduledFor).toLocaleTimeString('en-IN') : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Programs &amp; Events ({selectedEvents.length})
              </h4>
              {selectedEvents.length === 0 ? (
                <p className="text-slate-400">No community events listed on this date.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white">{ev.titleKannada}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          <MapPin className="h-3 w-3" /> {ev.location} · {ev.eventTime}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditEvent(ev)}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {confirmDeleteId === ev.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setConfirmDeleteId(null);
                              await onDeleteEvent(ev.id);
                            }}
                            className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(ev.id)}
                            className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Published Articles ({selectedPublished.length})
              </h4>
              {selectedPublished.length === 0 ? (
                <p className="text-slate-400">No articles published on this date.</p>
              ) : (
                <ul className="space-y-1.5">
                  {selectedPublished.map((art) => (
                    <li key={art.id} className="truncate text-slate-700 dark:text-slate-200">
                      • {stripRichTextToPlainText(art.titleKannada)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* All Programs & Events Directory (100% preserved existing event manager) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            All Programs &amp; Events ({events.length})
          </h3>
        </div>
        {events.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No events loaded yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
              >
                <div>
                  <p className="text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {ev.eventDate} · {ev.eventTime}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white">{ev.titleKannada}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {ev.descriptionKannada}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] dark:border-slate-800">
                  <span className="truncate text-slate-500">{ev.location}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onEditEvent(ev)}
                      className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteEvent(ev.id)}
                      className="font-semibold text-rose-600 hover:underline dark:text-rose-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
