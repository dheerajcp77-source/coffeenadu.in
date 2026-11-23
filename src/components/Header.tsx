import { CalendarDays } from 'lucide-react';
import type { FilterCategory } from '../types/news';
import { CoffeeCupLogo } from './CoffeeCupLogo';

interface HeaderProps {
  activeCategory: FilterCategory;
  isBusTimingsView?: boolean;
  isEventsView?: boolean;
  isChatView?: boolean;
  onSelectCategory: (category: FilterCategory) => void;
  onResetHome: () => void;
  onJumpToBusTimings: () => void;
  onJumpToEvents: () => void;
}

const HEADER_NAV_ITEMS: { label: string; category: FilterCategory }[] = [
  { label: 'All News', category: 'All' },
  { label: 'Local', category: 'Local' },
  { label: 'Malnad', category: 'Malnad' },
  { label: 'Agriculture', category: 'Agriculture' },
  { label: 'Politics', category: 'Politics' },
];

export function Header({
  activeCategory,
  isBusTimingsView = false,
  isEventsView = false,
  isChatView = false,
  onSelectCategory,
  onResetHome,
  onJumpToBusTimings,
  onJumpToEvents,
}: HeaderProps) {
  const isFeedView = !isBusTimingsView && !isEventsView && !isChatView;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Single-line brand wordmark with logo */}
        <button
          type="button"
          onClick={onResetHome}
          className="inline-flex items-center gap-2 font-masthead text-lg sm:text-2xl font-extrabold tracking-tight text-[#0F274A] hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A] rounded-sm"
        >
          <CoffeeCupLogo className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
          <span>Coffeenadu News</span>
        </button>

        {/* Zone 2: Concise single-line English navigation links */}
        <nav
          aria-label="Primary categories"
          className="hidden lg:flex items-center gap-5"
        >
          {HEADER_NAV_ITEMS.map((item) => {
            const isActive = isFeedView && activeCategory === item.category;
            return (
              <button
                key={item.category}
                type="button"
                onClick={() => onSelectCategory(item.category)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A] rounded-xs ${
                  isActive
                    ? 'border-[#0F274A] text-[#0F274A] font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-950 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Bus Timings button followed by Programs & Events button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onJumpToBusTimings}
            aria-current={isBusTimingsView ? 'page' : undefined}
            className={`px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0F274A] ${
              isBusTimingsView
                ? 'bg-amber-400 text-[#0F274A] hover:bg-amber-300'
                : 'bg-[#0F274A] text-white hover:bg-[#173a6e]'
            }`}
          >
            Bus Timings
          </button>

          <button
            type="button"
            onClick={onJumpToEvents}
            aria-current={isEventsView ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-700 ${
              isEventsView
                ? 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Programs &amp; Events</span>
            <span className="sm:hidden">Events</span>
          </button>
        </div>
      </div>
    </header>
  );
}
