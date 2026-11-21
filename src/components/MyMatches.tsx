import React from 'react';
import { RefreshCw, Calendar, Check, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Page, Tournament } from '../types';

interface MyMatchesProps {
  matches?: Tournament[];
  joinedMatchIds?: string[];
  onPageChange: (page: Page, param?: string) => void;
}

export default function MyMatches({ matches = [], joinedMatchIds = [], onPageChange }: MyMatchesProps) {
  const ongoingCount = matches.filter((m) => m.status === 'ongoing').length;
  const upcomingCount = matches.filter((m) => m.status === 'upcoming' || !m.status).length;
  const completedCount = matches.filter((m) => m.status === 'completed').length;

  const cards = [
    {
      id: 'ongoing',
      title: 'Ongoing',
      count: ongoingCount,
      icon: RefreshCw,
      iconBg: 'bg-sky-50 text-[#007AFF] border-sky-100',
      actionParam: 'freefire?status=ongoing',
    },
    {
      id: 'upcoming',
      title: 'Upcoming',
      count: upcomingCount,
      icon: Calendar,
      iconBg: 'bg-blue-50 text-[#2563EB] border-blue-100',
      actionParam: 'freefire?status=upcoming',
    },
    {
      id: 'completed',
      title: 'Completed',
      count: completedCount,
      icon: Check,
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      actionParam: 'freefire?status=completed',
    },
  ];

  return (
    <section className="px-4 sm:px-6 mt-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
            My Matches
          </h3>
          <p className="text-[11px] font-medium text-slate-500">
            {joinedMatchIds.length > 0
              ? `${joinedMatchIds.length} match${joinedMatchIds.length > 1 ? 'es' : ''} joined`
              : 'Quick jump to live & upcoming rooms'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Page.TOURNAMENTS, 'freefire')}
          className="text-xs font-bold text-[#007AFF] hover:text-[#0066D6] inline-flex items-center gap-0.5 min-h-[44px]"
        >
          <span>All Rooms</span>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.button
              type="button"
              key={card.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onPageChange(Page.TOURNAMENTS, card.actionParam)}
              className="ios-card-interactive p-3.5 sm:p-5 text-center flex flex-col items-center justify-center gap-2 min-h-[108px] cursor-pointer"
            >
              <div
                className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${card.iconBg}`}
              >
                <Icon size={20} strokeWidth={2.3} />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold text-slate-900 block leading-tight">
                  {card.title}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 tabular-nums mt-0.5 block">
                  {card.count} {card.count === 1 ? 'room' : 'rooms'}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
