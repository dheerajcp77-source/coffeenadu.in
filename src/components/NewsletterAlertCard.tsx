import { useState, type FormEvent } from 'react';
import { BellRing, CheckCircle2, Mail, MessageSquare, Trash2 } from 'lucide-react';
import {
  persistNewsletterSubscription,
  readNewsletterSubscription,
  type NewsletterSubscriptionState,
} from '../utils/readerPreferences';

export function NewsletterAlertCard() {
  const [subscription, setSubscription] = useState<NewsletterSubscriptionState | null>(() =>
    readNewsletterSubscription()
  );
  const [channel, setChannel] = useState<'email' | 'whatsapp'>(
    subscription?.channel || 'whatsapp'
  );
  const [contact, setContact] = useState(subscription?.contact || '');
  const [frequency, setFrequency] = useState<'daily' | 'breaking'>(
    subscription?.frequency || 'daily'
  );
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (!consent) {
      setErrorMsg('Please confirm permission before subscribing.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/public/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactType: channel,
          contactValue: contact.trim(),
          frequency,
          consent: true,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        subscriber?: { contactValue?: string };
      };
      if (!resp.ok || !json.ok) {
        setErrorMsg(json.error || 'Unable to save subscription right now.');
        return;
      }

      const nextState: NewsletterSubscriptionState = {
        subscribed: true,
        contact: json.subscriber?.contactValue || contact.trim(),
        channel,
        frequency,
        categories: [],
        updatedAt: Date.now(),
      };
      persistNewsletterSubscription(nextState);
      setSubscription(nextState);
      setStatusMsg('Subscribed to Coffeenadu News alerts.');
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!subscription) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      await fetch('/api/public/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactType: subscription.channel,
          contactValue: subscription.contact,
        }),
      });
    } catch {
      // Clear local preference regardless
    } finally {
      persistNewsletterSubscription(null);
      setSubscription(null);
      setContact('');
      setConsent(false);
      setStatusMsg('You have been unsubscribed.');
      setSubmitting(false);
    }
  };

  return (
    <section
      className="bg-white dark:bg-[#0F1E33] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs"
      aria-label="Daily News Digest and Alerts"
    >
      <div className="bg-[#10243D] dark:bg-[#0A1728] text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-[#D9A441]" />
          <div>
            <h3 className="text-sm font-bold leading-tight">Daily News Alerts</h3>
            <p className="font-kannada text-[11px] text-slate-300">ದೈನಂದಿನ ಸುದ್ದಿ ಸಂಗ್ರಹ</p>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#D9A441]">
          Opt-In
        </span>
      </div>

      <div className="p-4">
        {subscription?.subscribed ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#176B4A] dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs">
                <p className="font-bold text-[#17263A] dark:text-white">
                  Alerts Active ({subscription.frequency === 'breaking' ? 'Breaking' : 'Daily Digest'})
                </p>
                <p className="text-[#738093] dark:text-slate-300 break-all mt-0.5">
                  {subscription.channel === 'whatsapp' ? 'WhatsApp: ' : 'Email: '}
                  {subscription.contact}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleUnsubscribe()}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer disabled:opacity-60"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Unsubscribe from alerts
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <p className="font-kannada text-xs text-[#738093] dark:text-slate-300 leading-relaxed">
              ಕೊಪ್ಪ ಹಾಗೂ ಮಲೆನಾಡು ಪ್ರಮುಖ ಸುದ್ದಿಗಳ ದೈನಂದಿನ ಅಪ್‌ಡೇಟ್ ಪಡೆಯಲು ಸೇರಿ.
            </p>

            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => {
                  setChannel('whatsapp');
                  setErrorMsg('');
                }}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  channel === 'whatsapp'
                    ? 'bg-[#176B4A] text-white'
                    : 'text-[#738093] dark:text-slate-300'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => {
                  setChannel('email');
                  setErrorMsg('');
                }}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  channel === 'email'
                    ? 'bg-[#10243D] text-white dark:bg-[#D9A441] dark:text-[#10243D]'
                    : 'text-[#738093] dark:text-slate-300'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
            </div>

            <input
              type={channel === 'email' ? 'email' : 'tel'}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={
                channel === 'email' ? 'reader@example.com' : '10-digit WhatsApp mobile number'
              }
              required
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#13253E] text-xs text-[#17263A] dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
            />

            <div className="flex items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-[#17263A] dark:text-slate-200">
                <input
                  type="radio"
                  name="cn-alert-freq"
                  checked={frequency === 'daily'}
                  onChange={() => setFrequency('daily')}
                />
                Daily Digest
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-[#17263A] dark:text-slate-200">
                <input
                  type="radio"
                  name="cn-alert-freq"
                  checked={frequency === 'breaking'}
                  onChange={() => setFrequency('breaking')}
                />
                Breaking Alerts
              </label>
            </div>

            <label className="flex items-start gap-2 text-[11px] text-[#738093] dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>I agree to receive Coffeenadu News updates and can unsubscribe anytime.</span>
            </label>

            {errorMsg && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>
            )}
            {statusMsg && !errorMsg && (
              <p className="text-xs font-semibold text-[#176B4A] dark:text-emerald-400">
                {statusMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[42px] rounded-lg bg-[#10243D] hover:bg-[#1A3659] dark:bg-[#D9A441] dark:hover:bg-[#E5B65C] text-white dark:text-[#10243D] text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Subscribe to News Alerts'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
