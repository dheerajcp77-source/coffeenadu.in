import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Loader2, MessageCircle, MessageSquare, Send } from 'lucide-react';
import { KOPPA_LOCATIONS } from '../data/newsData';
import {
  getOrCreateReaderThreadId,
  getSavedReaderProfile,
  hasReaderStartedThread,
  markThreadReadByReader,
  sendReaderMessage,
  subscribeToReaderThread,
} from '../services/chatStore';
import type { SupportMessage, SupportThread } from '../types/news';

interface SupportChatSectionProps {
  onBackToNews: () => void;
}

const ADMIN_WHATSAPP_NUMBER = '919481033743';
const ADMIN_WHATSAPP_DISPLAY = '9481033743';

const CHAT_TOPIC_OPTIONS: {
  id: string;
  labelEn: string;
  labelKn: string;
  starterHint: string;
}[] = [
  {
    id: 'news',
    labelEn: 'Submit Local News',
    labelKn: 'ಸ್ಥಳೀಯ ಸುದ್ದಿ ಕಳುಹಿಸಿ',
    starterHint: 'ನಮ್ಮ ಊರಿನ ಸುದ್ದಿ / Local news update: ',
  },
  {
    id: 'event',
    labelEn: 'Program / Event Notice',
    labelKn: 'ಕಾರ್ಯಕ್ರಮ ಮಾಹಿತಿ',
    starterHint: 'ಕಾರ್ಯಕ್ರಮದ ದಿನಾಂಕ ಮತ್ತು ವಿವರ / Program details: ',
  },
  {
    id: 'bus',
    labelEn: 'Bus Timings Query',
    labelKn: 'ಬಸ್ ಸಮಯದ ವಿಚಾರಣೆ',
    starterHint: 'ಬಸ್ ಮಾರ್ಗ ಮತ್ತು ಸಮಯದ ಬಗ್ಗೆ ಮಾಹಿತಿ ಬೇಕಾಗಿದೆ: ',
  },
  {
    id: 'feedback',
    labelEn: 'Correction / Feedback',
    labelKn: 'ತಿದ್ದುಪಡಿ / ಅಭಿಪ್ರಾಯ',
    starterHint: 'ಸಲಹೆ ಅಥವಾ ತಿದ್ದುಪಡಿ / Feedback: ',
  },
  {
    id: 'general',
    labelEn: 'Other / General',
    labelKn: 'ಇತರೆ ವಿಚಾರ',
    starterHint: '',
  },
];

function formatMsgTime(ms?: number): string {
  if (!ms) return 'Sending...';
  return new Date(ms).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildWhatsAppHelpUrl(params: {
  topicKn: string;
  senderName?: string;
  senderPhone?: string;
  senderLocation?: string;
  messageText?: string;
}): string {
  const lines: string[] = [
    'ನಮಸ್ಕಾರ ಕಾಫಿನಾಡು ನ್ಯೂಸ್,',
    `ನನಗೆ "${params.topicKn}" ಬಗ್ಗೆ ಹೆಚ್ಚಿನ ಮಾಹಿತಿ ಮತ್ತು ಸಹಾಯ ಬೇಕಾಗಿದೆ.`,
  ];

  const cleanName = params.senderName?.trim();
  const cleanPhone = params.senderPhone?.trim();
  const cleanLocation = params.senderLocation?.trim();
  const cleanMsg = params.messageText?.trim();

  if (cleanName) {
    lines.push(`ಹೆಸರು: ${cleanName}`);
  }
  if (cleanPhone) {
    lines.push(`ಮೊಬೈಲ್ ಸಂಖ್ಯೆ: ${cleanPhone}`);
  }
  if (cleanLocation) {
    lines.push(`ಸ್ಥಳ: ${cleanLocation}`);
  }
  if (cleanMsg) {
    lines.push(`ವಿವರ: ${cleanMsg}`);
  }

  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function SupportChatSection({ onBackToNews }: SupportChatSectionProps) {
  const threadId = useMemo(() => getOrCreateReaderThreadId(), []);
  const savedProfile = useMemo(() => getSavedReaderProfile(), []);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [senderName, setSenderName] = useState(savedProfile.name);
  const [senderPhone, setSenderPhone] = useState(savedProfile.phone);
  const [senderLocation, setSenderLocation] = useState(savedProfile.location || '');
  const [selectedTopicId, setSelectedTopicId] = useState<string>(CHAT_TOPIC_OPTIONS[0].id);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasStartedChat, setHasStartedChat] = useState(() => hasReaderStartedThread());
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedTopicOption = useMemo(
    () => CHAT_TOPIC_OPTIONS.find((opt) => opt.id === selectedTopicId) ?? CHAT_TOPIC_OPTIONS[0],
    [selectedTopicId]
  );

  const selectedTopic = `${selectedTopicOption.labelEn} · ${selectedTopicOption.labelKn}`;

  const whatsappHelpHref = useMemo(
    () =>
      buildWhatsAppHelpUrl({
        topicKn: selectedTopicOption.labelKn,
        senderName,
        senderPhone,
        senderLocation,
        messageText,
      }),
    [selectedTopicOption.labelKn, senderName, senderPhone, senderLocation, messageText]
  );

  useEffect(() => {
    if (!hasStartedChat) return;
    const unsubscribe = subscribeToReaderThread(
      threadId,
      (nextThread) => {
        setThread(nextThread);
        if (nextThread?.unreadByReader) {
          void markThreadReadByReader(threadId);
        }
      },
      (nextMessages) => {
        setMessages(nextMessages);
      },
      (err) => {
        setErrorMessage(err.message);
      }
    );
    return () => unsubscribe();
  }, [threadId, hasStartedChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const handleChooseTopic = (option: (typeof CHAT_TOPIC_OPTIONS)[number]) => {
    setSelectedTopicId(option.id);
    if (!messageText.trim() && option.starterHint) {
      setMessageText(option.starterHint);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (isSending) return;

    const cleanName = senderName.trim();
    const cleanPhone = senderPhone.trim();
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    const trimmed = messageText.trim();

    if (!cleanName) {
      setErrorMessage('Please enter your name / ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ನಮೂದಿಸಿ.');
      return;
    }

    if (phoneDigits.length < 10) {
      setErrorMessage(
        'Please enter a valid 10-digit mobile number / ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ.'
      );
      return;
    }

    if (!trimmed) {
      setErrorMessage('Please type your message in Kannada or English / ದಯವಿಟ್ಟು ಸಂದೇಶ ಬರೆಯಿರಿ.');
      return;
    }

    setErrorMessage('');
    setIsSending(true);
    try {
      await sendReaderMessage({
        threadId,
        senderName: cleanName,
        senderPhone: cleanPhone,
        senderLocation,
        topic: selectedTopic,
        text: trimmed,
      });
      setHasStartedChat(true);
      setMessageText('');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to send message right now.'
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section
      aria-label="Message Coffeenadu Admin"
      className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5"
    >
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <button
            type="button"
            onClick={onBackToNews}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0F274A] cursor-pointer mb-1"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to News</span>
          </button>
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-6 h-6 text-[#0F274A] shrink-0" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F274A] tracking-tight font-kannada">
              Message Coffeenadu Admin · ಸಂಪಾದಕರೊಂದಿಗೆ ಚಾಟ್
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 font-kannada mt-0.5">
            Ask questions, send Koppa &amp; Malnad news tips, or share event info — replies from our Admin appear right here.
          </p>
        </div>
      </div>

      {/* Bilingual Topic Selector: What do you want? / ನಿಮಗೆ ಏನು ಬೇಕು? */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-[#0F274A] font-kannada">
            What do you want? · ನಿಮಗೆ ಏನು ಬೇಕು?
          </h2>
          <p className="text-xs text-slate-500 font-kannada mt-0.5">
            Select a topic below to message our Admin Desk or get quick help on WhatsApp
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {CHAT_TOPIC_OPTIONS.map((opt) => {
            const fullTopic = `${opt.labelEn} · ${opt.labelKn}`;
            const active = selectedTopicId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleChooseTopic(opt)}
                className={`font-kannada px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer text-left ${
                  active
                    ? 'bg-[#0F274A] text-white border-[#0F274A]'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                }`}
              >
                {fullTopic}
              </button>
            );
          })}
        </div>

        {/* Direct WhatsApp Help / Information Button */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5">
          <div className="space-y-0.5">
            <p className="text-xs sm:text-sm font-bold text-emerald-950 font-kannada">
              ಹೆಚ್ಚಿನ ಮಾಹಿತಿ ಅಥವಾ ಸಹಾಯ ಬೇಕೇ? · Need Help or More Information?
            </p>
            <p className="text-[11px] sm:text-xs text-emerald-900/80 font-kannada">
              &ldquo;{selectedTopicOption.labelKn}&rdquo; ಕುರಿತು ನೇರವಾಗಿ WhatsApp ({ADMIN_WHATSAPP_DISPLAY}) ಮೂಲಕ ಸಂಪರ್ಕಿಸಿ
            </p>
          </div>
          <a
            href={whatsappHelpHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shrink-0 min-h-[42px] font-kannada"
          >
            <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>ಸಹಾಯ / ಮಾಹಿತಿಗಾಗಿ WhatsApp ಮಾಡಿ</span>
          </a>
        </div>
      </div>

      {/* Interactive Chat Thread & Composer */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        {/* Conversation Header */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-[#0F274A]">
            Direct Admin Desk Chat · ನೇರ ಸಂಪರ್ಕ
          </span>
          <span className="text-slate-500 font-kannada">
            {thread?.lastSenderRole === 'admin'
              ? 'Admin replied · ಸಂಪಾದಕರು ಉತ್ತರಿಸಿದ್ದಾರೆ'
              : thread
              ? 'Sent to Admin Inbox · ಇನ್‌ಬಾಕ್ಸ್‌ಗೆ ತಲುಪಿದೆ'
              : 'Start a conversation · ಸಂಭಾಷಣೆ ಪ್ರಾರಂಭಿಸಿ'}
          </span>
        </div>

        {/* Message Stream */}
        <div className="p-4 sm:p-5 space-y-3 max-h-[420px] min-h-[220px] overflow-y-auto bg-[#FBFBF9]">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs sm:text-sm text-slate-800 max-w-xl font-kannada space-y-1">
            <p className="font-bold text-emerald-900">Coffeenadu Admin Desk</p>
            <p>
              ನಮಸ್ಕಾರ! ನಿಮಗೆ ಏನು ಸಹಾಯ ಬೇಕು? ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ ಸ್ಥಳೀಯ ಸುದ್ದಿ, ಕಾರ್ಯಕ್ರಮಗಳ ಮಾಹಿತಿ, ಅಥವಾ ಬಸ್ ಸಮಯದ ಬಗ್ಗೆ ಇಲ್ಲಿ ಸಂದೇಶ ಕಳುಹಿಸಿ.
            </p>
            <p className="text-slate-600 text-xs">
              Enter your Name &amp; Mobile Number (Place is optional) and send a message in Kannada or English — our Admin will reply here.
            </p>
          </div>

          {messages.map((msg) => {
            const isAdminMsg = msg.senderRole === 'admin';
            return (
              <div
                key={msg.id}
                className={`flex ${isAdminMsg ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-2.5 text-sm space-y-1 ${
                    isAdminMsg
                      ? 'bg-emerald-50 border border-emerald-200 text-slate-900'
                      : 'bg-[#0F274A] text-white'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between gap-4 text-[11px] font-semibold ${
                      isAdminMsg ? 'text-emerald-900' : 'text-amber-300'
                    }`}
                  >
                    <span>{msg.senderName}</span>
                    <span className="tabular-nums opacity-85">
                      {formatMsgTime(msg.createdTimestamp)}
                    </span>
                  </div>
                  <p className="font-kannada whitespace-pre-wrap leading-relaxed break-words">
                    {msg.text}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Simple Composer Form: Name (Required), Mobile Number (Required), Place (Optional) */}
        <form onSubmit={handleSend} className="p-4 sm:p-5 border-t border-slate-200 bg-white space-y-3">
          {errorMessage && (
            <div
              role="alert"
              className="px-3 py-2 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="chat-sender-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Name · ನಿಮ್ಮ ಹೆಸರು <span className="text-red-600">*</span>
              </label>
              <input
                id="chat-sender-name"
                type="text"
                required
                maxLength={80}
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="ನಿಮ್ಮ ಹೆಸರು / Your Name"
                className="w-full px-3 py-2 text-sm font-kannada bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[40px]"
              />
            </div>

            <div>
              <label htmlFor="chat-sender-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number · ಮೊಬೈಲ್ ಸಂಖ್ಯೆ <span className="text-red-600">*</span>
              </label>
              <input
                id="chat-sender-phone"
                type="tel"
                inputMode="tel"
                required
                maxLength={20}
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[40px] tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="chat-sender-place" className="block text-xs font-semibold text-slate-700 mb-1">
                Place · ಸ್ಥಳ <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <select
                id="chat-sender-place"
                value={senderLocation}
                onChange={(e) => setSenderLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm font-kannada bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[40px]"
              >
                <option value="">Optional · ಐಚ್ಛಿಕ</option>
                {KOPPA_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="chat-message-input" className="block text-xs font-semibold text-slate-700 mb-1">
              Message · ನಿಮ್ಮ ಸಂದೇಶ (English or Kannada)
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <textarea
                id="chat-message-input"
                rows={2}
                maxLength={2000}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಇಲ್ಲಿ ಬರೆಯಿರಿ..."
                className="flex-1 px-3 py-2 text-sm font-kannada bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0F274A]"
              />
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] disabled:opacity-60 rounded-lg transition-colors cursor-pointer shrink-0 min-h-[44px]"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{isSending ? 'Sending...' : 'Send · ಕಳುಹಿಸಿ'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
