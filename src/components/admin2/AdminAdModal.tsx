import { Megaphone, X } from 'lucide-react';
import type { AdPlatformSettings, Advertisement, AdvertisementPayload } from '../../types/ads';
import { AdminAdEditor } from './AdminAdEditor';

interface AdminAdModalProps {
  isOpen: boolean;
  editingAd: Advertisement | null;
  nextAdNumber: string;
  platformSettings?: AdPlatformSettings | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: AdvertisementPayload) => Promise<void>;
  onDelete?: (ad: Advertisement) => Promise<void>;
}

export function AdminAdModal({
  isOpen,
  editingAd,
  nextAdNumber,
  platformSettings,
  isSaving,
  onClose,
  onSubmit,
  onDelete,
}: AdminAdModalProps) {
  if (!isOpen) return null;

  const displayAdNumber = editingAd?.adNumber || nextAdNumber || 'AD001';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 sm:p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-ad-modal-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-[#0F172A]">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0B192C] px-4 py-3.5 text-white sm:px-6 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
              <Megaphone className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="admin-ad-modal-title" className="truncate text-sm sm:text-base font-bold">
                {editingAd ? 'Edit Local Advertisement' : 'Create Local Advertisement'}
              </h2>
              <p className="text-[11px] text-slate-300 tabular-nums">
                Advertisement ID:{' '}
                <span className="font-mono font-bold text-amber-300">{displayAdNumber}</span>
                {' · '}Original image preserved cleanly
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close advertisement modal"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Accordion Editor Body + Sticky Footer */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 sm:px-6">
          <AdminAdEditor
            editingAd={editingAd}
            nextAdNumber={nextAdNumber}
            platformSettings={platformSettings}
            isSaving={isSaving}
            onSubmit={onSubmit}
            onDelete={onDelete}
            formId="admin-ad-modal-form"
            embedded={false}
          />
        </div>
      </div>
    </div>
  );
}
