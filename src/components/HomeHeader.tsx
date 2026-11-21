import React, { useState, useEffect } from 'react';
import { Bell, Shield, Wallet } from 'lucide-react';
import { Page, User } from '../types';
import { getEffectiveRole, getRoleBadgeMeta } from '../constants';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { APP_MEDIA } from '../assets/media';

interface HomeHeaderProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
  onOpenNotifications?: () => void;
}

export default function HomeHeader({ user, onPageChange, onOpenNotifications }: HomeHeaderProps) {
  const displayName = user?.username || 'Player';
  const totalBalance =
    (user?.wallet?.deposit || 0) + (user?.wallet?.winnings || 0) + (user?.wallet?.bonus || 0);
  const [unreadCount, setUnreadCount] = useState(0);
  const role = getEffectiveRole(user);
  const roleBadge = getRoleBadgeMeta(role);

  useEffect(() => {
    if (!user?.id) return;

    const q = query(collection(db, 'notifications'), limit(15));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!user?.id) {
          setUnreadCount(snapshot.size);
          return;
        }
        let unread = 0;
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (!data.readBy || !data.readBy.includes(user.id)) {
            unread++;
          }
        });
        setUnreadCount(unread);
      },
      () => {}
    );

    return () => unsub();
  }, [user?.id]);

  const panelPage =
    role === 'admin' ? Page.ADMIN : role === 'co_owner' ? Page.CO_OWNER : Page.STAFF;

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-2xl border-b border-slate-200/75 px-4 sm:px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Left: Brand Avatar & Greeting */}
        <div
          onClick={() => onPageChange(Page.PROFILE)}
          className="flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform min-w-0"
        >
          <div className="w-11 h-11 rounded-2xl bg-blue-50 p-0.5 border border-blue-200/80 shadow-xs flex items-center justify-center overflow-hidden shrink-0">
            <img
              src={APP_MEDIA.emblem}
              alt="KINGS RELOAD"
              className="w-full h-full rounded-[14px] object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 leading-tight">
              Welcome back,
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-tight truncate max-w-[140px] sm:max-w-[220px]">
                {displayName}
              </h1>
              {role !== 'user' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPageChange(panelPage);
                  }}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 ${roleBadge.pillClass}`}
                  title="Open Control Panel"
                >
                  <Shield size={9} />
                  {roleBadge.label}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Notifications & iOS Balance Pill */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative w-11 h-11 rounded-2xl bg-[#F4F6FA] hover:bg-blue-50 border border-slate-200/90 text-slate-700 hover:text-[#007AFF] flex items-center justify-center active:scale-95 transition-all"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#007AFF] text-white text-[10px] font-bold flex items-center justify-center shadow-sm tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onPageChange(Page.WALLET)}
            className="min-h-[44px] bg-[#007AFF] hover:bg-[#0066D6] text-white px-3.5 py-2 rounded-2xl flex items-center gap-2 shadow-sm shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Wallet size={15} className="shrink-0" />
            <span className="text-xs sm:text-sm font-bold tracking-tight tabular-nums">
              ₹{totalBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
