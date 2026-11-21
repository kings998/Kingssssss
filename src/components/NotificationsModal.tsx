import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  ShieldCheck,
  Gift,
  Trophy,
  ArrowRight,
  Key,
  Zap,
  Wallet,
  ExternalLink,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { Page, AppNotification, User } from '../types';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import SafeImage from './SafeImage';
import {
  requestMobileNotificationPermission,
  triggerMobileStatusBarNotification,
} from '../utils/mobileNotificationHelper';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPageChange: (page: Page, id?: string) => void;
  user?: User | null;
  joinedMatchIds?: string[];
}

export default function NotificationsModal({
  isOpen,
  onClose,
  onPageChange,
  user,
  joinedMatchIds = [],
}: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useModalBackHandler(isOpen, onClose);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(30));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
        const filtered = list.filter((item) => {
          if (!item.audience || item.audience === 'all') return true;
          if (item.audience === 'match' && item.targetMatchId) {
            return joinedMatchIds.includes(item.targetMatchId);
          }
          if (item.audience === 'user' && item.targetUserId && user?.id) {
            return item.targetUserId === user.id;
          }
          return true;
        });
        setNotifications(filtered);
      },
      (err) => {
        console.error('Error listening to notifications:', err);
      }
    );

    return () => unsub();
  }, [isOpen, user?.id, JSON.stringify(joinedMatchIds)]);

  const handleEnableMobileNotifications = async () => {
    setIsRequestingPermission(true);
    try {
      const perm = await requestMobileNotificationPermission(user?.id);
      setPermissionStatus(perm);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleSendTestNotification = async () => {
    await triggerMobileStatusBarNotification(
      'Free Fire Match Alert',
      'Room ID: 893412 | Pass: 1234 — Match starts in 10 minutes!',
      { tag: 'test-mobile-bar-alert' }
    );
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleMarkAsRead = async (notifId?: string) => {
    if (!notifId || !user?.id) return;
    try {
      await updateDoc(doc(db, 'notifications', notifId), {
        readBy: arrayUnion(user.id),
      });
    } catch (e) {
      console.error('Could not mark as read:', e);
    }
  };

  const getIconAndStyle = (type?: string) => {
    switch (type) {
      case 'room_creds':
        return {
          icon: Key,
          color: 'bg-blue-50 text-[#007AFF] border-blue-200',
          badge: 'Room Credentials',
        };
      case 'tournament':
        return {
          icon: Trophy,
          color: 'bg-amber-50 text-amber-600 border-amber-200',
          badge: 'Tournament Alert',
        };
      case 'offer':
        return {
          icon: Gift,
          color: 'bg-sky-50 text-sky-600 border-sky-200',
          badge: 'Exclusive Offer',
        };
      case 'wallet':
        return {
          icon: Wallet,
          color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
          badge: 'Wallet / Cash',
        };
      case 'fairplay':
        return {
          icon: ShieldCheck,
          color: 'bg-teal-50 text-teal-600 border-teal-200',
          badge: 'FairPlay Notice',
        };
      case 'alert':
      default:
        return {
          icon: Zap,
          color: 'bg-blue-50 text-[#007AFF] border-blue-200',
          badge: 'Announcement',
        };
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const displayItems =
    notifications.length > 0
      ? notifications
      : [
          {
            id: 'default_1',
            title: 'Grand Free Fire Championship',
            message:
              'Join our daily Mega Clash Squad & Battle Royale tournaments. Instant room credentials and guaranteed prize payouts.',
            type: 'tournament' as const,
            audience: 'all' as const,
            actionPage: Page.TOURNAMENTS,
            actionText: 'View Arena',
            createdAt: null,
          },
          {
            id: 'default_2',
            title: 'FairPlay & Anti-Cheat Active',
            message:
              'All custom rooms are monitored. Emulators, hacks and config files result in immediate permanent ban.',
            type: 'fairplay' as const,
            audience: 'all' as const,
            actionPage: undefined,
            actionText: undefined,
            createdAt: null,
          },
          {
            id: 'default_3',
            title: 'Refer & Earn ₹50 Bonus Cash',
            message: 'Invite your Free Fire squad to KINGS RELOAD and earn instant referral rewards.',
            type: 'offer' as const,
            audience: 'all' as const,
            actionPage: Page.REFERRAL,
            actionText: 'Invite Friends',
            createdAt: null,
          },
        ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />

          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="relative w-full max-w-md bg-white border border-slate-200 rounded-[28px] p-5 sm:p-6 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-[#007AFF]">
                  <Bell size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    Notifications
                    {notifications.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#007AFF] text-white text-[10px] font-bold tabular-nums">
                        {notifications.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs font-medium text-slate-500">Official Updates & Alerts</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3.5 p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white border border-blue-200 flex items-center justify-center text-[#007AFF] shrink-0">
                  <Smartphone size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">Push Notifications</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {permissionStatus === 'granted'
                      ? 'Active on this device'
                      : 'Tap to receive room credentials instantly'}
                  </p>
                </div>
              </div>

              {permissionStatus === 'granted' ? (
                <button
                  type="button"
                  onClick={handleSendTestNotification}
                  className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1"
                >
                  <CheckCircle2 size={12} />
                  <span>{testSent ? 'Sent' : 'Test'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEnableMobileNotifications}
                  disabled={isRequestingPermission}
                  className="px-3.5 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-xl text-xs font-bold shadow-xs shrink-0"
                >
                  {isRequestingPermission ? '...' : 'Enable'}
                </button>
              )}
            </div>

            <div className="mt-3.5 space-y-2.5 overflow-y-auto no-scrollbar pr-0.5 flex-1">
              {displayItems.map((item) => {
                const style = getIconAndStyle(item.type);
                const Icon = style.icon;
                const isRead = user?.id && item.readBy?.includes(user.id);

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition-all relative ${
                      isRead
                        ? 'bg-[#F8FAFC] border-slate-200/70 opacity-85'
                        : 'bg-white border-blue-200/90 shadow-xs'
                    }`}
                  >
                    {!isRead && user?.id && item.id && !item.id.startsWith('default') && (
                      <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-[#007AFF]" />
                    )}

                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${style.color}`}
                      >
                        <Icon size={16} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap pr-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.color}`}
                          >
                            {style.badge}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400">
                            {formatTimeAgo(item.createdAt)}
                          </span>
                        </div>

                        <h4 className="text-xs font-extrabold text-slate-900 leading-snug">
                          {item.title}
                        </h4>

                        <p className="text-xs text-slate-600 leading-relaxed mt-1 whitespace-pre-line">
                          {item.message}
                        </p>

                        {item.imageUrl && (
                          <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 max-h-36">
                            <SafeImage
                              src={item.imageUrl}
                              alt="Notification Attachment"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {item.targetMatchTitle && (
                          <div className="mt-2 text-[11px] font-bold text-[#007AFF] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 inline-block">
                            Match: {item.targetMatchTitle}
                          </div>
                        )}

                        {(item.actionPage || item.actionUrl || item.actionText) && (
                          <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                handleMarkAsRead(item.id);
                                onClose();
                                if (item.actionUrl) {
                                  const a = document.createElement('a');
                                  a.href = item.actionUrl;
                                  a.target = '_blank';
                                  a.rel = 'noopener noreferrer';
                                  a.click();
                                } else if (item.actionPage) {
                                  onPageChange(item.actionPage as Page, item.targetMatchId);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[#007AFF] hover:underline"
                            >
                              <span>{item.actionText || 'Open Details'}</span>
                              {item.actionUrl ? <ExternalLink size={12} /> : <ArrowRight size={13} />}
                            </button>

                            {!isRead && user?.id && item.id && !item.id.startsWith('default') && (
                              <button
                                type="button"
                                onClick={() => handleMarkAsRead(item.id)}
                                className="text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                              >
                                Mark as Read
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/80">
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[44px] bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
