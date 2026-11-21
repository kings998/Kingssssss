import React from 'react';
import { Megaphone, ChevronRight } from 'lucide-react';

interface AnnouncementBarProps {
  text?: string;
  onClick: () => void;
}

export default function AnnouncementBar({
  text = 'KINGS RELOAD — MATCH RULES & OFFICIAL TELEGRAM',
  onClick,
}: AnnouncementBarProps) {
  return (
    <section className="px-4 sm:px-6 mt-3.5 max-w-6xl mx-auto">
      <button
        type="button"
        onClick={onClick}
        className="w-full bg-white hover:bg-blue-50/40 border border-slate-200/90 rounded-2xl p-2 pr-3.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-[#007AFF] flex items-center justify-center text-white shrink-0 shadow-xs">
          <Megaphone size={17} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#007AFF] leading-none mb-0.5">
            Official Notice
          </p>
          <p className="text-xs font-bold text-slate-900 truncate">{text}</p>
        </div>
        <ChevronRight size={16} className="text-slate-400 shrink-0" />
      </button>
    </section>
  );
}
