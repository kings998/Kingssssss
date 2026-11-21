import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Send,
  Smile,
  Reply,
  Trash2,
  Pin,
  PinOff,
  Crown,
  Shield,
  MessageSquare,
  Headphones,
  X,
  Loader2,
} from 'lucide-react';
import { ChatChannel, ChatMessage, Page, User } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getEffectiveRole, getRoleBadgeMeta, hasPanelAccess } from '../constants';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

interface ChatPageProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
}

const QUICK_EMOJIS = ['😄', '🔥', '🎮', '🏆', '👍', '❤️', '😂', '👏'];
const REACTION_EMOJIS = ['😄', '🔥', '🎮', '👍'];

export default function ChatPage({ user, onPageChange }: ChatPageProps) {
  const [activeChannel, setActiveChannel] = useState<ChatChannel>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const currentRole = getEffectiveRole(user);
  const canModerate = hasPanelAccess(user);
  const currentRoleBadge = getRoleBadgeMeta(currentRole);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'chatMessages'), orderBy('createdAt', 'desc'), limit(120));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
          .filter((msg) => (msg.channel || 'general') === activeChannel)
          .reverse();
        setMessages(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'chatMessages');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChannel]);

  const pinnedMessages = messages.filter((m) => m.isPinned);

  const formatTime = (ts: any) => {
    try {
      const date = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
      if (!date || isNaN(date.getTime())) return 'Now';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending || !user?.id) return;
    if (user.isBanned) {
      setSendError('Your account is restricted from sending messages.');
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      const payload: any = {
        channel: activeChannel,
        senderId: user.id,
        senderName: user.username || 'Player',
        senderEmail: user.email || '',
        senderRole: currentRole,
        text: trimmed.slice(0, 500),
        reactions: {},
        isPinned: false,
        createdAt: serverTimestamp(),
      };

      if (replyTo?.id) {
        payload.replyToId = replyTo.id;
        payload.replyToName = replyTo.senderName;
        payload.replyToText = replyTo.text.slice(0, 100);
      }

      await addDoc(collection(db, 'chatMessages'), payload);
      setText('');
      setReplyTo(null);
      setShowEmojiBar(false);
      inputRef.current?.focus();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chatMessages');
      setSendError('Could not send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    if (!msg.id || !user?.id) return;
    try {
      const existingReactions = { ...(msg.reactions || {}) };
      const currentUsers = Array.isArray(existingReactions[emoji])
        ? [...existingReactions[emoji]]
        : [];
      const hasReacted = currentUsers.includes(user.id);
      const updatedUsers = hasReacted
        ? currentUsers.filter((id) => id !== user.id)
        : [...currentUsers, user.id];

      if (updatedUsers.length === 0) {
        delete existingReactions[emoji];
      } else {
        existingReactions[emoji] = updatedUsers;
      }

      await updateDoc(doc(db, 'chatMessages', msg.id), {
        reactions: existingReactions,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chatMessages/${msg.id}`);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'chatMessages', msgId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chatMessages/${msgId}`);
    }
  };

  const handleTogglePin = async (msg: ChatMessage) => {
    if (!msg.id || !canModerate) return;
    try {
      await updateDoc(doc(db, 'chatMessages', msg.id), {
        isPinned: !msg.isPinned,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chatMessages/${msg.id}`);
    }
  };

  const getPanelTarget = () => {
    if (currentRole === 'admin') return Page.ADMIN;
    if (currentRole === 'co_owner') return Page.CO_OWNER;
    return Page.STAFF;
  };

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 flex flex-col relative select-none">
      {/* Frosted iOS Top Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => onPageChange(Page.HOME)}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-extrabold text-slate-900 truncate">
                    Arena Messages
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  Global lobby & Staff support desk
                </p>
              </div>
            </div>

            {currentRole !== 'user' && (
              <button
                type="button"
                onClick={() => onPageChange(getPanelTarget())}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 ${currentRoleBadge.pillClass}`}
              >
                {currentRole === 'admin' ? <Crown size={11} /> : <Shield size={11} />}
                {currentRoleBadge.label}
              </button>
            )}
          </div>

          {/* iOS Segmented Channel Switcher */}
          <div className="bg-slate-200/75 p-1 rounded-2xl flex items-center mt-3">
            <button
              type="button"
              onClick={() => setActiveChannel('general')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeChannel === 'general' ? 'bg-white text-[#007AFF] shadow-xs' : 'text-slate-600'
              }`}
            >
              <MessageSquare size={14} />
              Global Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveChannel('support')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeChannel === 'support' ? 'bg-white text-[#007AFF] shadow-xs' : 'text-slate-600'
              }`}
            >
              <Headphones size={14} />
              Staff Support
            </button>
          </div>

          {/* Pinned Banner */}
          {pinnedMessages.length > 0 && (
            <div className="mt-2.5 px-3 py-2 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Pin size={13} className="text-[#007AFF] shrink-0" />
                <p className="text-xs text-slate-800 truncate">
                  <span className="font-bold text-[#007AFF]">
                    {pinnedMessages[pinnedMessages.length - 1].senderName}:{' '}
                  </span>
                  {pinnedMessages[pinnedMessages.length - 1].text}
                </p>
              </div>
              {canModerate && pinnedMessages[pinnedMessages.length - 1].id && (
                <button
                  type="button"
                  onClick={() => handleTogglePin(pinnedMessages[pinnedMessages.length - 1])}
                  className="text-[#007AFF] shrink-0"
                  title="Unpin"
                >
                  <PinOff size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Messages Feed */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 pt-4 pb-44 space-y-3 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={26} className="text-[#007AFF] animate-spin" />
            <p className="mt-3 text-xs font-semibold text-slate-500">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-[28px] text-center py-16 px-6 shadow-xs my-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center mx-auto mb-3">
              <MessageSquare size={26} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {activeChannel === 'general' ? 'Start the Conversation!' : 'Need Help from Staff?'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {activeChannel === 'general'
                ? 'Say hello to Free Fire players, recruit squadmates, or share results.'
                : 'Ask Staff, Co-Owners, or Admin about Room IDs, match rules, or wallet support.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === user?.id;
            const roleBadge = getRoleBadgeMeta(msg.senderRole || 'user');
            const isStaffRole = msg.senderRole && msg.senderRole !== 'user';
            const canDelete = isMine || canModerate;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`flex items-center gap-1.5 mb-1 px-1 ${
                    isMine ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <span className="text-[11px] font-bold text-slate-600">
                    {isMine ? 'You' : msg.senderName}
                  </span>
                  {isStaffRole && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase flex items-center gap-0.5 ${roleBadge.lightPillClass}`}
                    >
                      {msg.senderRole === 'admin' ? <Crown size={9} /> : <Shield size={9} />}
                      {roleBadge.label}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 font-medium">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>

                {/* iMessage-Style Bubble */}
                <div
                  className={`max-w-[82%] rounded-[22px] px-4 py-2.5 shadow-2xs ${
                    isMine
                      ? 'bg-[#007AFF] text-white rounded-br-md'
                      : isStaffRole
                      ? 'bg-white border-2 border-blue-200 text-slate-900 rounded-bl-md'
                      : 'bg-white border border-slate-200/90 text-slate-900 rounded-bl-md'
                  }`}
                >
                  {msg.replyToText && (
                    <div
                      className={`mb-1.5 pl-2.5 border-l-2 rounded-r-lg py-1 pr-2 text-[11px] ${
                        isMine
                          ? 'border-white/70 bg-white/15 text-white'
                          : 'border-[#007AFF] bg-blue-50 text-slate-700'
                      }`}
                    >
                      <p className="font-bold truncate">{msg.replyToName}</p>
                      <p className="opacity-85 truncate">{msg.replyToText}</p>
                    </div>
                  )}

                  <p className="text-sm leading-snug break-words whitespace-pre-wrap">{msg.text}</p>

                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(msg.reactions).map(([emoji, usersArr]) => {
                        if (!Array.isArray(usersArr) || usersArr.length === 0) return null;
                        const reacted = user?.id ? usersArr.includes(user.id) : false;
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleToggleReaction(msg, emoji)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 transition-all ${
                              reacted
                                ? isMine
                                  ? 'bg-white/25 text-white'
                                  : 'bg-blue-50 border border-blue-200 text-[#007AFF]'
                                : isMine
                                ? 'bg-black/15 text-white/90'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span>{usersArr.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Actions Row */}
                <div
                  className={`flex items-center gap-2.5 mt-1 px-1 ${
                    isMine ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(msg);
                      inputRef.current?.focus();
                    }}
                    className="text-[11px] text-slate-400 hover:text-[#007AFF] flex items-center gap-0.5 font-semibold"
                  >
                    <Reply size={11} />
                    Reply
                  </button>
                  <div className="flex items-center gap-1">
                    {REACTION_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleToggleReaction(msg, em)}
                        className="text-xs opacity-60 hover:opacity-100 hover:scale-125 transition-all"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                  {canModerate && msg.id && (
                    <button
                      type="button"
                      onClick={() => handleTogglePin(msg)}
                      className={msg.isPinned ? 'text-[#007AFF]' : 'text-slate-400 hover:text-[#007AFF]'}
                    >
                      <Pin size={12} />
                    </button>
                  )}
                  {canDelete && msg.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg.id!)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Fixed Bottom Composer */}
      <div className="fixed bottom-16 left-0 right-0 z-30 ios-glass border-t border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 pt-2.5 pb-3">
          {sendError && <p className="text-xs text-rose-600 font-semibold mb-1.5">{sendError}</p>}

          <AnimatePresence>
            {replyTo && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="mb-2 px-3 py-1.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#007AFF] truncate">
                    Replying to {replyTo.senderName}
                  </p>
                  <p className="text-xs text-slate-600 truncate">{replyTo.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showEmojiBar && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="mb-2 px-3 py-2 rounded-2xl bg-white border border-slate-200 flex items-center justify-around shadow-xs"
              >
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setText((prev) => `${prev}${em}`);
                      inputRef.current?.focus();
                    }}
                    className="text-lg hover:scale-125 active:scale-95 transition-transform"
                  >
                    {em}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEmojiBar((prev) => !prev)}
              className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                showEmojiBar
                  ? 'bg-blue-50 border-[#007AFF] text-[#007AFF]'
                  : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              <Smile size={18} />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder={
                activeChannel === 'general' ? 'iMessage players lobby...' : 'Message Staff support...'
              }
              className="flex-1 bg-white border border-slate-200 focus:border-[#007AFF] rounded-full px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
            />

            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="w-10 h-10 rounded-full bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-40 text-white flex items-center justify-center shadow-sm active:scale-95 transition-all shrink-0"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
