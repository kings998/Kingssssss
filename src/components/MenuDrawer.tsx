import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  Wallet,
  Trophy,
  Gift,
  HelpCircle,
  ShieldCheck,
  BarChart3,
  PlusCircle,
  ArrowDownToLine,
  Shield,
  ChevronRight,
  Bell,
  MessageCircle,
} from 'lucide-react';
import { Page, User as UserType } from '../types';
import { getEffectiveRole, hasPanelAccess } from '../constants';
import { APP_MEDIA } from '../assets/media';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserType | null;
  onPageChange: (page: Page, param?: string) => void;
  onOpenRules?: () => void;
  onOpenSupport?: () => void;
  onOpenNotifications?: () => void;
}

export default function MenuDrawer({
  isOpen,
  onClose,
  user,
  onPageChange,
  onOpenRules,
  onOpenSupport,
  onOpenNotifications,
}: MenuDrawerProps) {
  const userRole = getEffectiveRole(user);
  const canOpenPanel = hasPanelAccess(user);

  const panelItems = canOpenPanel
    ? [
        ...(userRole === 'admin'
          ? [
              {
                id: 'admin_panel',
                label: 'Admin Panel',
                desc: 'Full platform control, payments & roles',
                icon: Shield,
                color: 'bg-[#007AFF]/10 text-[#007AFF] border-blue-200',
                action: () => {
                  onClose();
                  onPageChange(Page.ADMIN);
                },
              },
            ]
          : []),
        ...(userRole === 'admin' || userRole === 'co_owner'
          ? [
              {
                id: 'co_owner_panel',
                label: 'Co-Owner Panel',
                desc: 'Executive ops, staff management & banners',
                icon: Shield,
                color: 'bg-sky-50 text-sky-600 border-sky-200',
                action: () => {
                  onClose();
                  onPageChange(Page.CO_OWNER);
                },
              },
            ]
          : []),
        {
          id: 'staff_panel',
          label: 'Staff Panel',
          desc: 'Room ID/Pass dispatch & match moderation',
          icon: Shield,
          color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
          action: () => {
            onClose();
            onPageChange(Page.STAFF);
          },
        },
      ]
    : [];

  const menuItems = [
    ...panelItems,
    {
      id: 'chat',
      label: 'Community & Staff Chat',
      desc: 'Chat live with players, staff & admins',
      icon: MessageCircle,
      color: 'bg-blue-50 text-[#007AFF] border-blue-200',
      action: () => {
        onClose();
        onPageChange(Page.CHAT);
      },
    },
    {
      id: 'profile',
      label: 'My Profile & IGN',
      desc: 'Update Free Fire IGN and profile info',
      icon: User,
      color: 'bg-blue-50 text-[#007AFF] border-blue-200',
      action: () => {
        onClose();
        onPageChange(Page.PROFILE);
      },
    },
    {
      id: 'notifications',
      label: 'Notifications & Alerts',
      desc: 'Official updates, room alerts & offers',
      icon: Bell,
      color: 'bg-sky-50 text-sky-600 border-sky-200',
      action: () => {
        onClose();
        if (onOpenNotifications) onOpenNotifications();
      },
    },
    {
      id: 'wallet',
      label: 'Wallet & Passbook',
      desc: 'Check deposits, winnings and transactions',
      icon: Wallet,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      action: () => {
        onClose();
        onPageChange(Page.WALLET);
      },
    },
    {
      id: 'add_money',
      label: 'Add Cash',
      desc: 'Instant QR / UPI Deposit',
      icon: PlusCircle,
      color: 'bg-blue-50 text-[#007AFF] border-blue-200',
      action: () => {
        onClose();
        onPageChange(Page.ADD_MONEY);
      },
    },
    {
      id: 'withdraw',
      label: 'Withdraw Cash',
      desc: 'Withdraw match winnings directly to UPI',
      icon: ArrowDownToLine,
      color: 'bg-amber-50 text-amber-600 border-amber-200',
      action: () => {
        onClose();
        onPageChange(Page.WITHDRAW);
      },
    },
    {
      id: 'tournaments',
      label: 'Esports Tournaments',
      desc: 'Browse CS, BR & Lone Wolf rooms',
      icon: Trophy,
      color: 'bg-blue-50 text-[#007AFF] border-blue-200',
      action: () => {
        onClose();
        onPageChange(Page.TOURNAMENTS);
      },
    },
    {
      id: 'stats',
      label: 'My Career & Stats',
      desc: 'Track kills, wins and match history',
      icon: BarChart3,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      action: () => {
        onClose();
        onPageChange(Page.GAME_STATS);
      },
    },
    {
      id: 'referral',
      label: 'Refer & Earn',
      desc: 'Invite friends & earn bonus cash',
      icon: Gift,
      color: 'bg-amber-50 text-amber-600 border-amber-200',
      action: () => {
        onClose();
        onPageChange(Page.REFERRAL);
      },
    },
    {
      id: 'rules',
      label: 'Match Rules & FairPlay',
      desc: 'Tournament rules, bans and guidelines',
      icon: ShieldCheck,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      action: () => {
        onClose();
        if (onOpenRules) onOpenRules();
      },
    },
    {
      id: 'support',
      label: 'Customer Support',
      desc: '24/7 WhatsApp & Telegram assistance',
      icon: HelpCircle,
      color: 'bg-sky-50 text-sky-600 border-sky-200',
      action: () => {
        onClose();
        if (onOpenSupport) onOpenSupport();
      },
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative w-full max-w-lg bg-white border-t border-slate-200 rounded-t-[30px] p-5 sm:p-6 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 p-0.5 flex items-center justify-center overflow-hidden">
                  <img
                    src={APP_MEDIA.emblem}
                    alt="KINGS RELOAD"
                    className="w-full h-full rounded-[14px] object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">KINGS RELOAD</h3>
                  <p className="text-xs font-semibold text-[#007AFF]">Navigation Menu</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-2 overflow-y-auto no-scrollbar pr-0.5 flex-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={item.action}
                    className="w-full p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-blue-50/60 border border-slate-200/80 hover:border-[#007AFF]/40 flex items-center justify-between transition-all group active:scale-[0.985]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${item.color}`}>
                        <Icon size={18} />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-xs font-bold text-slate-900 group-hover:text-[#007AFF] transition-colors truncate">
                          {item.label}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium truncate">{item.desc}</p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 group-hover:text-[#007AFF] shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/80">
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[46px] bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold transition-all"
              >
                Close Menu
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
