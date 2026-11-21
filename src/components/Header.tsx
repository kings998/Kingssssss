import React from 'react';
import { Wallet, Shield } from 'lucide-react';
import { Page, User } from '../types';
import { getEffectiveRole, getRoleBadgeMeta, hasPanelAccess } from '../constants';
import { APP_MEDIA } from '../assets/media';
import SafeImage from './SafeImage';

interface HeaderProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function Header({ user, onPageChange }: HeaderProps) {
  const effectiveRole = getEffectiveRole(user);
  const roleBadge = getRoleBadgeMeta(effectiveRole);
  const showPanelBtn = hasPanelAccess(user);

  const targetPanelPage =
    effectiveRole === 'admin'
      ? Page.ADMIN
      : effectiveRole === 'co_owner'
      ? Page.CO_OWNER
      : Page.STAFF;

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-2xl border-b border-slate-200/80 py-3">
      <div className="flex items-center justify-between px-4 sm:px-6 max-w-6xl mx-auto gap-3">
        <div
          onClick={() => onPageChange(Page.HOME)}
          className="flex items-center gap-3 cursor-pointer active:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-sm border border-blue-200/80 bg-white shrink-0">
            <SafeImage
              src={APP_MEDIA.emblem}
              alt="KINGS RELOAD"
              className="w-full h-full"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#007AFF] leading-none mb-0.5">
              Esports Arena
            </p>
            <h1 className="text-lg font-extrabold tracking-tight leading-none text-slate-900">
              KINGS <span className="text-[#007AFF]">RELOAD</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {showPanelBtn && (
            <button
              type="button"
              onClick={() => onPageChange(targetPanelPage)}
              className={`min-h-[38px] px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-transform ${roleBadge.pillClass}`}
            >
              <Shield size={12} />
              <span>{roleBadge.label}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onPageChange(Page.WALLET)}
            className="min-h-[40px] flex items-center gap-2 bg-[#F4F6FA] hover:bg-blue-50/70 border border-slate-200/90 px-3.5 py-1.5 rounded-full active:scale-95 transition-all shadow-xs"
          >
            <span className="text-slate-900 font-bold text-sm tabular-nums">
              ₹{((user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0)).toLocaleString()}
            </span>
            <div className="w-6 h-6 rounded-full bg-[#007AFF] text-white flex items-center justify-center">
              <Wallet size={13} />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
