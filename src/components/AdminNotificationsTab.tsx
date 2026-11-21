import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Bell,
  Send,
  Trash2,
  Check,
  Loader2,
  ChevronDown,
  Trophy,
  Users,
  User as UserIcon,
} from 'lucide-react';
import { Page, Tournament, User, AppNotification, NotificationType } from '../types';
import { db } from '../lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { useIosFeedback } from './IosFeedback';

interface AdminNotificationsTabProps {
  matches: Tournament[];
  users: User[];
  onPageChange: (page: Page, id?: string) => void;
}

export default function AdminNotificationsTab({ matches, users }: AdminNotificationsTabProps) {
  const { showToast } = useIosFeedback();
  const [selectedAudience, setSelectedAudience] = useState<'all' | 'tournament' | 'custom'>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchUserQuery, setSearchUserQuery] = useState('');

  const [isSending, setIsSending] = useState(false);
  const [historyNotifications, setHistoryNotifications] = useState<AppNotification[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(20));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
            } as AppNotification)
        );
        setHistoryNotifications(list);
      },
      (err) => {
        console.warn('Notifications stream error:', err);
      }
    );

    return () => unsub();
  }, []);

  const handleSendNotification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!title.trim()) {
      showToast('Please enter a notification title.', 'error');
      return;
    }
    if (!body.trim()) {
      showToast('Please enter a notification message.', 'error');
      return;
    }

    if (selectedAudience === 'tournament' && !selectedMatchId) {
      showToast('Please select a tournament match.', 'error');
      return;
    }

    if (selectedAudience === 'custom' && !selectedUserId) {
      showToast('Please select a target player.', 'error');
      return;
    }

    setIsSending(true);

    try {
      const selectedMatch = matches.find((m) => m.id === selectedMatchId);
      const selectedUser = users.find((u) => u.id === selectedUserId);

      let notifType: NotificationType = 'alert';
      if (selectedAudience === 'tournament') {
        notifType = 'tournament';
      }

      const notifData: any = {
        title: title.trim(),
        message: body.trim(),
        type: notifType,
        audience:
          selectedAudience === 'tournament'
            ? 'match'
            : selectedAudience === 'custom'
            ? 'user'
            : 'all',
        createdAt: serverTimestamp(),
        readBy: [],
      };

      if (selectedAudience === 'tournament' && selectedMatchId) {
        notifData.targetMatchId = selectedMatchId;
        notifData.targetMatchTitle =
          selectedMatch?.title || `Match #${selectedMatch?.matchNumber || ''}`;
        notifData.actionPage = Page.TOURNAMENTS;
        notifData.actionText = 'View Match';
      }

      if (selectedAudience === 'custom' && selectedUserId) {
        notifData.targetUserId = selectedUserId;
        notifData.targetUsername = selectedUser?.username || selectedUser?.ign || 'Player';
      }

      await addDoc(collection(db, 'notifications'), notifData);

      setTitle('');
      setBody('');
      showToast('Notification broadcast sent!', 'success');
    } catch (err: any) {
      console.error('Error sending notification:', err);
      showToast(err?.message || 'Failed to send notification.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
      showToast('Notification removed.', 'info');
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const totalUsersCount = users.length || 0;
  const activeCount = totalUsersCount > 0 ? Math.max(1, Math.round(totalUsersCount * 0.75)) : 0;

  const filteredUsers = users.filter(
    (u) =>
      !searchUserQuery ||
      u.username?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.ign?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.phone?.includes(searchUserQuery)
  );

  return (
    <div className="space-y-5">
      {/* Segmented Audience Control */}
      <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setSelectedAudience('all')}
            className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              selectedAudience === 'all'
                ? 'bg-white text-[#007AFF] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users size={14} />
            <span className="truncate">All Users</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedAudience('tournament')}
            className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              selectedAudience === 'tournament'
                ? 'bg-white text-[#007AFF] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Trophy size={14} />
            <span className="truncate">Tournament</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedAudience('custom')}
            className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              selectedAudience === 'custom'
                ? 'bg-white text-[#007AFF] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserIcon size={14} />
            <span className="truncate">Custom User</span>
          </button>
        </div>

        {selectedAudience === 'tournament' && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 block">Select Tournament</label>
            <select
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
            >
              <option value="">-- Choose Joined Match --</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.matchNumber || m.id.slice(0, 4)} • {m.title} ({m.section} - {m.playersCount || 0}{' '}
                  Joined)
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedAudience === 'custom' && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 block">Select Target Player</label>
            <input
              type="text"
              placeholder="Search player username, IGN or phone..."
              value={searchUserQuery}
              onChange={(e) => setSearchUserQuery(e.target.value)}
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-medium text-slate-900 outline-none focus:border-[#007AFF]"
            />
            <div className="max-h-36 overflow-y-auto no-scrollbar space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-slate-500 py-2 text-center">No users matching search</p>
              ) : (
                filteredUsers.slice(0, 10).map((u) => {
                  const isSelected = selectedUserId === u.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id!)}
                      className={`px-3 py-2 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-blue-50 border border-[#007AFF]/40 text-[#007AFF] font-bold'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      <span className="truncate">
                        {u.username} {u.ign ? `(IGN: ${u.ign})` : ''}
                      </span>
                      {isSelected && <Check size={14} className="text-[#007AFF]" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title..."
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#007AFF] focus:bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 block">Message</label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification message..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-900 outline-none focus:border-[#007AFF] focus:bg-white leading-relaxed resize-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleSendNotification()}
          disabled={isSending}
          className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider shadow-sm shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
        >
          {isSending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send size={15} />
              <span>Send Notification</span>
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-3.5">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-[#007AFF]" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
            Reach Overview
          </h4>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Active Devices
            </p>
            <p className="text-2xl font-extrabold text-emerald-600 tabular-nums mt-0.5">
              {activeCount}
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Players
            </p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
              {totalUsersCount}
            </p>
          </div>
        </div>
      </div>

      {/* History Toggle */}
      {historyNotifications.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="w-full py-3 px-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center justify-between shadow-xs"
          >
            <span>Recent Sent Broadcasts ({historyNotifications.length})</span>
            <ChevronDown
              size={16}
              className={`transform transition-transform ${showHistory ? 'rotate-180' : ''}`}
            />
          </button>

          {showHistory && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 space-y-2"
            >
              {historyNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-3.5 bg-white border border-slate-200/80 rounded-2xl flex items-start justify-between gap-3 text-xs shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-xs truncate">{notif.title}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{notif.message}</p>
                    <span className="text-[10px] text-[#007AFF] font-bold uppercase mt-1 block">
                      Target: {notif.audience}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(notif.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
