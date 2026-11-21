import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  User as UserIcon,
  Wallet,
  Gamepad2,
  ShoppingCart,
  BarChart2,
  Gift,
  Headphones,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  ChevronRight,
  MessageCircle,
  Crown,
  Users,
  Shield,
} from 'lucide-react';
import { Page, User } from '../types';
import { getEffectiveRole, getRoleBadgeMeta, hasPanelAccess } from '../constants';
import { APP_MEDIA } from '../assets/media';
import SupportModal from '../components/SupportModal';
import RulesModal from '../components/RulesModal';
import MyOrdersModal from '../components/MyOrdersModal';

interface ProfilePageProps {
  user: User;
  onPageChange: (page: Page, param?: string) => void;
  onLogout: () => void;
}

export default function ProfilePage({ user, onPageChange, onLogout }: ProfilePageProps) {
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => {
    return localStorage.getItem('khelgalli_push_notifications') !== 'false';
  });

  const handleTogglePush = () => {
    setPushEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('khelgalli_push_notifications', String(next));
      return next;
    });
  };

  const effectiveRole = getEffectiveRole(user);
  const roleBadge = getRoleBadgeMeta(effectiveRole);
  const isPanelUser = hasPanelAccess(user);

  const totalBalance =
    (user?.wallet?.deposit || 0) + (user?.wallet?.winnings || 0) + (user?.wallet?.bonus || 0);

  const displayName = user?.username || 'Player';
  const matchesPlayed = user?.stats?.matchesPlayed || 0;
  const totalKills = user?.stats?.totalKills || 0;
  const amountWon = user?.stats?.totalWinnings || 0;

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      {/* Frosted iOS Top Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={APP_MEDIA.emblem}
              alt="KINGS RELOAD"
              className="w-10 h-10 rounded-full object-cover border border-slate-200"
            />
            <div>
              <p className="text-[11px] font-semibold text-slate-400 leading-none">Account</p>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight mt-0.5 truncate max-w-[160px]">
                {displayName}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onPageChange(Page.WALLET)}
            className="bg-[#007AFF] hover:bg-[#0066D6] text-white px-3.5 py-2 rounded-full flex items-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Wallet size={14} />
            <span className="text-xs font-extrabold tabular-nums">₹{totalBalance.toFixed(0)}</span>
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
        {/* Player Identity & Telemetry Hero */}
        <div className="bg-white border border-slate-200/80 rounded-[28px] p-6 shadow-xs text-center">
          <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-[#007AFF] to-sky-400 mx-auto shadow-md">
            <img
              src={APP_MEDIA.emblem}
              alt={displayName}
              className="w-full h-full rounded-full object-cover bg-white"
            />
          </div>

          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-3">
            {displayName}
          </h2>
          <p className="text-xs font-medium text-slate-400">{user.email}</p>

          {effectiveRole !== 'user' && (
            <div className="mt-2 inline-flex">
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${roleBadge.lightPillClass}`}
              >
                {effectiveRole === 'admin' ? <Crown size={12} /> : <ShieldCheck size={12} />}
                {roleBadge.label}
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 divide-x divide-slate-100 mt-6 pt-5 border-t border-slate-100">
            <div>
              <p className="text-xl font-extrabold text-slate-900 tabular-nums">{matchesPlayed}</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Matches</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-[#007AFF] tabular-nums">{totalKills}</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Kills</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-emerald-600 tabular-nums">₹{amountWon}</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Won</p>
            </div>
          </div>
        </div>

        {/* Role Management & Control Panels Group */}
        {isPanelUser && (
          <section className="space-y-2">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-2">
              Operations & Panels
            </h3>
            <div className="bg-white border border-blue-200/80 rounded-[24px] divide-y divide-slate-100 shadow-xs overflow-hidden">
              {effectiveRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN)}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-blue-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#007AFF] text-white flex items-center justify-center">
                      <Crown size={18} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-900">Admin Panel</p>
                      <p className="text-[11px] text-slate-500">Full system, roles, gateways & earnings</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-[#007AFF]" />
                </button>
              )}

              {(effectiveRole === 'admin' || effectiveRole === 'co_owner') && (
                <button
                  type="button"
                  onClick={() => onPageChange(Page.CO_OWNER)}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-sky-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center">
                      <Shield size={18} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-900">Co-Owner Panel</p>
                      <p className="text-[11px] text-slate-500">Staff management, matches & banners</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-sky-600" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onPageChange(Page.STAFF)}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-emerald-50/60 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                    <Users size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-900">Staff Panel</p>
                    <p className="text-[11px] text-slate-500">Room IDs, match results & player desk</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-emerald-600" />
              </button>
            </div>
          </section>
        )}

        {/* iPhone Settings Group 1: Preferences & Profile */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-2">
            Account & Gaming
          </h3>
          <div className="bg-white border border-slate-200/80 rounded-[24px] divide-y divide-slate-100 shadow-xs overflow-hidden">
            {/* Push Switch */}
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                  <Bell size={17} />
                </div>
                <span className="text-sm font-bold text-slate-900">Push Notifications</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                onClick={handleTogglePush}
                className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors duration-200 ${
                  pushEnabled ? 'bg-[#007AFF]' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200 ${
                    pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {[
              { icon: UserIcon, label: 'Personal Details & IGNs', action: () => onPageChange(Page.PROFILE_DETAILS) },
              { icon: Wallet, label: 'My Wallet', action: () => onPageChange(Page.WALLET) },
              { icon: Gamepad2, label: 'Contests & Matches', action: () => onPageChange(Page.TOURNAMENTS) },
              { icon: ShoppingCart, label: 'My Orders & Slots', action: () => setIsOrdersOpen(true) },
              { icon: BarChart2, label: 'Match Statistics', action: () => onPageChange(Page.GAME_STATS) },
              { icon: Gift, label: 'Refer & Earn', action: () => onPageChange(Page.REFERRAL) },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={item.action}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                      <Icon size={17} />
                    </div>
                    <span className="text-sm font-bold text-slate-900">{item.label}</span>
                  </div>
                  <ChevronRight size={17} className="text-slate-400" />
                </button>
              );
            })}
          </div>
        </section>

        {/* iPhone Settings Group 2: Support & Fair Play */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-2">
            Support & Community
          </h3>
          <div className="bg-white border border-slate-200/80 rounded-[24px] divide-y divide-slate-100 shadow-xs overflow-hidden">
            {[
              { icon: MessageCircle, label: 'Community & Staff Chat', action: () => onPageChange(Page.CHAT) },
              { icon: Headphones, label: 'Customer Support', action: () => setIsSupportOpen(true) },
              { icon: ShieldCheck, label: 'Rules & Fair Play', action: () => setIsRulesOpen(true) },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={item.action}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                      <Icon size={17} />
                    </div>
                    <span className="text-sm font-bold text-slate-900">{item.label}</span>
                  </div>
                  <ChevronRight size={17} className="text-slate-400" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Log Out Card */}
        <button
          type="button"
          onClick={() => setIsLogoutDialogOpen(true)}
          className="w-full bg-white hover:bg-rose-50/50 border border-slate-200/80 rounded-[22px] px-4 py-4 flex items-center justify-center gap-2 text-rose-600 font-bold text-sm shadow-xs transition-colors"
        >
          <LogOut size={17} />
          <span>Sign Out</span>
        </button>

        <p className="text-center text-[11px] font-semibold text-slate-400 pb-4">
          KINGS RELOAD Esports • v3.2.0
        </p>
      </div>

      {/* Modals */}
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <RulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
        section="Battle Royale & Esports Fair Play"
        onJoin={() => setIsRulesOpen(false)}
        isJoined={true}
      />
      <MyOrdersModal
        isOpen={isOrdersOpen}
        onClose={() => setIsOrdersOpen(false)}
        user={user}
        onPageChange={onPageChange}
      />

      {/* iOS Logout Sheet */}
      <AnimatePresence>
        {isLogoutDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogoutDialogOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="relative w-full max-w-[310px] bg-white rounded-[26px] border border-slate-200 shadow-2xl z-10 text-center overflow-hidden"
            >
              <div className="px-6 pt-6 pb-5">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
                  <LogOut size={22} />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Sign Out?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You can sign back into your KINGS RELOAD account anytime.
                </p>
              </div>
              <div className="grid grid-cols-2 border-t border-slate-200 divide-x divide-slate-200">
                <button
                  type="button"
                  onClick={() => setIsLogoutDialogOpen(false)}
                  className="py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsLogoutDialogOpen(false);
                    onLogout();
                  }}
                  className="py-3.5 text-sm font-bold text-rose-600 hover:bg-rose-50/50"
                >
                  Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
