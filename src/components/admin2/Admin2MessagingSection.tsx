import { useState, type FormEvent } from 'react';
import {
  Inbox,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import type { SupportMessage, SupportThread } from '../../types/news';

interface Admin2MessagingSectionProps {
  threads: SupportThread[];
  hasMoreThreads: boolean;
  loadingInbox: boolean;
  loadingMoreThreads: boolean;
  selectedThreadId: string | null;
  threadMessages: SupportMessage[];
  replyText: string;
  isSendingReply: boolean;
  onSelectThread: (threadId: string) => void;
  onReplyTextChange: (value: string) => void;
  onSendReply: (e: FormEvent) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onRefreshInbox: () => Promise<void>;
  onLoadMoreThreads: () => Promise<void>;
}

export function Admin2MessagingSection({
  threads,
  hasMoreThreads,
  loadingInbox,
  loadingMoreThreads,
  selectedThreadId,
  threadMessages,
  replyText,
  isSendingReply,
  onSelectThread,
  onReplyTextChange,
  onSendReply,
  onDeleteThread,
  onRefreshInbox,
  onLoadMoreThreads,
}: Admin2MessagingSectionProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const selectedThread = threads.find((t) => t.id === selectedThreadId) || null;
  const totalUnread = threads.filter((t) => t.unreadByAdmin).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Messaging Centre (Reader Inbox)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All reader enquiries, mandatory contact details (name &amp; phone), live replies, and WhatsApp follow-up preserved 100%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
            {totalUnread} unread · {threads.length} thread(s)
          </span>
          <button
            type="button"
            onClick={() => void onRefreshInbox()}
            disabled={loadingInbox}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingInbox ? 'animate-spin' : ''}`} />
            Refresh Inbox
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Thread List */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E] lg:col-span-5">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-200">
            Reader Conversations
          </div>
          <div className="max-h-[540px] flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loadingInbox && threads.length === 0 ? (
              <div className="flex h-40 items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…
              </div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                No reader messages yet.
              </div>
            ) : (
              threads.map((thread) => {
                const active = thread.id === selectedThreadId;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      active
                        ? 'bg-[#0B192C]/5 dark:bg-blue-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {thread.senderName || 'Reader'}
                      </p>
                      {thread.unreadByAdmin && (
                        <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          New
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {thread.senderPhone && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Phone className="h-3 w-3" /> {thread.senderPhone}
                        </span>
                      )}
                      {thread.senderLocation && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {thread.senderLocation}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-xs text-slate-600 dark:text-slate-300">
                      {thread.lastMessage}
                    </p>
                  </button>
                );
              })
            )}
          </div>
          {hasMoreThreads && (
            <div className="border-t border-slate-100 p-2.5 text-center dark:border-slate-800">
              <button
                type="button"
                disabled={loadingMoreThreads}
                onClick={() => void onLoadMoreThreads()}
                className="text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400"
              >
                {loadingMoreThreads ? 'Loading…' : 'Load Older Conversations'}
              </button>
            </div>
          )}
        </section>

        {/* Conversation Detail & Reply Box */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E] lg:col-span-7">
          {!selectedThread ? (
            <div className="flex h-[540px] flex-col items-center justify-center p-8 text-center text-xs text-slate-500">
              <Inbox className="mb-2 h-8 w-8 text-slate-300" />
              <p className="font-semibold text-slate-700 dark:text-slate-200">Select a conversation</p>
              <p className="mt-1">Choose a reader message on the left to inspect contact details and reply live.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedThread.senderName || 'Reader'}
                  </h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedThread.senderPhone && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Phone className="h-3 w-3" /> {selectedThread.senderPhone}
                      </span>
                    )}
                    {selectedThread.senderLocation && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {selectedThread.senderLocation}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedThread.senderPhone && (
                    <a
                      href={`https://wa.me/91${selectedThread.senderPhone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                        `ನಮಸ್ಕಾರ ${selectedThread.senderName || ''}, ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ವತಿಯಿಂದ ನಿಮ್ಮ ಸಂದೇಶಕ್ಕೆ ಪ್ರತಿಕ್ರಿಯೆ:`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp Reader
                    </a>
                  )}
                  {confirmDeleteId === selectedThread.id ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setConfirmDeleteId(null);
                        await onDeleteThread(selectedThread.id);
                      }}
                      className="rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                    >
                      Confirm Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedThread.id)}
                      className="rounded-lg border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[380px] min-h-[300px] flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 dark:bg-slate-900/40">
                {threadMessages.map((msg) => {
                  const isAdmin = msg.senderRole === 'admin';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          isAdmin
                            ? 'bg-[#0B192C] text-white dark:bg-blue-600'
                            : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            isAdmin ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          {isAdmin ? msg.senderName || 'CoffeeNadu Desk' : selectedThread.senderName || 'Reader'}
                          {msg.createdTimestamp ? ` · ${new Date(msg.createdTimestamp).toLocaleString('en-IN')}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => void onSendReply(e)}
                className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => onReplyTextChange(e.target.value)}
                  placeholder="Write an official reply to this reader…"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0B192C] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={isSendingReply || !replyText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-50 dark:bg-blue-600"
                >
                  {isSendingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Reply
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
