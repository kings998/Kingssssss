import React from 'react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { Zap, Gamepad2, Trophy, MessageCircle, User as UserIcon } from 'lucide-react';
import { Page, User } from '../types';

interface BottomNavProps {
  currentPage?: Page;
  onPageChange: (page: Page, param?: string) => void;
  user?: User | null;
}

export default function BottomNav({ onPageChange }: BottomNavProps) {
  const location = useLocation();

  const tabs = [
    {
      id: 'play',
      label: 'Home',
      icon: Gamepad2,
      path: '/home',
      page: Page.HOME,
    },
    {
      id: 'arena',
      label: 'Matches',
      icon: Trophy,
      path: '/tournaments',
      page: Page.TOURNAMENTS,
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageCircle,
      path: '/chat',
      page: Page.CHAT,
    },
    {
      id: 'earn',
      label: 'Earn',
      icon: Zap,
      path: '/referral',
      page: Page.REFERRAL,
    },
    {
      id: 'account',
      label: 'Account',
      icon: UserIcon,
      path: '/profile',
      page: Page.PROFILE,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/88 backdrop-blur-2xl border-t border-slate-200/80 pb-safe z-40 shadow-[0_-8px_28px_rgba(15,23,42,0.05)]">
      <div className="flex justify-around items-center h-16 max-w-2xl mx-auto px-2">
        {tabs.map((tab) => {
          const isPlay = tab.id === 'play';
          const isArena = tab.id === 'arena';
          const isActive = isPlay
            ? location.pathname === '/' ||
              location.pathname.startsWith('/home') ||
              location.pathname.startsWith('/game-modes')
            : isArena
            ? location.pathname.startsWith('/tournaments') ||
              location.pathname.startsWith('/match')
            : location.pathname.startsWith(tab.path);

          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onPageChange(tab.page, isArena ? 'freefire' : undefined)}
              className="relative flex flex-col items-center justify-center w-full min-h-[48px] transition-colors group"
            >
              {isActive && (
                <motion.div
                  layoutId="iosBottomTabBg"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-x-2 inset-y-1.5 bg-[#007AFF]/10 rounded-2xl -z-10"
                />
              )}
              <Icon
                size={21}
                strokeWidth={isActive ? 2.4 : 1.9}
                className={`mb-0.5 transition-transform duration-150 group-active:scale-90 ${
                  isActive ? 'text-[#007AFF]' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              />
              <span
                className={`text-[10px] tracking-tight ${
                  isActive ? 'text-[#007AFF] font-bold' : 'text-slate-500 font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
