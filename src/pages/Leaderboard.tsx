import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Crown, Trophy, Star, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { User } from '../types';
import SafeImage from '../components/SafeImage';
import { APP_MEDIA } from '../assets/media';

type LeaderboardTab = 'weekly' | 'monthly';

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('weekly');
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<Record<string, User>>({});
  const [periodTransactions, setPeriodTransactions] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const usersMap = snap.docs.reduce((acc, d) => {
          acc[d.id] = { id: d.id, ...d.data() } as User;
          return acc;
        }, {} as Record<string, User>);
        setAllUsers(usersMap);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    setLoading(true);
    const now = new Date();
    let startDate: Date;

    if (activeTab === 'weekly') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const q = query(
      collection(db, 'transactions'),
      where('type', '==', 'win'),
      where('createdAt', '>=', startDate)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPeriodTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Leaderboard trans error:', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [activeTab]);

  const displayPlayers = React.useMemo(() => {
    const userIds = new Set([
      ...Object.keys(allUsers),
      ...periodTransactions.map((t) => t.userId),
    ]);

    const earningsMap: Record<string, number> = {};
    periodTransactions.forEach((t) => {
      if (t.userId) {
        earningsMap[t.userId] = (earningsMap[t.userId] || 0) + (Number(t.amount) || 0);
      }
    });

    const lbData = Array.from(userIds).map((uid) => {
      const user = allUsers[uid];
      const periodWin = earningsMap[uid] || 0;
      const totalWin = user?.stats?.totalWinnings || 0;

      return {
        ...(user || { id: uid, username: 'Unknown Gamer' }),
        periodWinnings: periodWin,
        totalWinnings: totalWin,
      };
    });

    return lbData
      .sort((a, b) => {
        if (b.periodWinnings !== a.periodWinnings) {
          return b.periodWinnings - a.periodWinnings;
        }
        return (b.totalWinnings || 0) - (a.totalWinnings || 0);
      })
      .slice(0, 100);
  }, [allUsers, periodTransactions]);

  const topThree = displayPlayers.slice(0, 3);
  const remainingPlayers = displayPlayers.slice(3);
  const hasTopThree = topThree.length > 0;

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      {/* Header & Segmented Switch */}
      <header className="sticky top-0 z-20 ios-glass border-b border-slate-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-4 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-[11px] font-bold text-[#007AFF] mb-2">
            <Trophy size={12} />
            <span>Top 100 Standings</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Arena <span className="text-[#007AFF]">Leaderboard</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5 mb-4">
            Real-time Free Fire winnings rankings
          </p>

          <div className="flex bg-slate-200/75 p-1 rounded-2xl max-w-xs mx-auto">
            {(['weekly', 'monthly'] as LeaderboardTab[]).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all flex items-center justify-center gap-1.5 ${
                    active ? 'bg-white text-[#007AFF] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Star size={12} className={active ? 'fill-current' : ''} />
                  {tab}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center">
            <Loader2 size={28} className="text-[#007AFF] animate-spin mb-3" />
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Syncing Rankings...
            </p>
          </div>
        ) : !hasTopThree ? (
          <div className="bg-white border border-slate-200/80 rounded-[28px] py-16 text-center px-6 shadow-xs">
            <Trophy size={36} className="mx-auto mb-3 text-slate-300" />
            <h3 className="text-base font-extrabold text-slate-800">No Rankings Yet</h3>
            <p className="text-xs text-slate-500 mt-1">Be the first to claim top winnings.</p>
          </div>
        ) : (
          <>
            {/* Podium Grid */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4 items-end pt-6 mb-8">
              {/* Rank 2 */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="bg-white border border-slate-200/90 rounded-[24px] p-3.5 sm:p-5 text-center shadow-xs flex flex-col items-center"
              >
                <div className="relative mb-2.5">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 border-slate-300 bg-slate-100">
                    <SafeImage src={APP_MEDIA.emblem} className="w-full h-full" showLoader={false} />
                  </div>
                  <span className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-slate-700 text-white text-[11px] font-extrabold flex items-center justify-center border-2 border-white">
                    2
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate w-full">
                  {topThree[1]?.username || '---'}
                </h4>
                <p className="text-xs sm:text-sm font-extrabold text-[#007AFF] mt-1 tabular-nums">
                  ₹{topThree[1]?.periodWinnings || 0}
                </p>
              </motion.div>

              {/* Rank 1 */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-b from-[#007AFF] to-[#2563EB] text-white rounded-[26px] p-4 sm:p-6 text-center shadow-lg shadow-blue-500/25 flex flex-col items-center -mt-4"
              >
                <Crown size={24} className="text-amber-300 fill-amber-300 mb-2" />
                <div className="relative mb-2.5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-white/80 bg-white/10">
                    <SafeImage src={APP_MEDIA.emblem} className="w-full h-full" showLoader={false} />
                  </div>
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold border-2 border-white">
                    #1
                  </span>
                </div>
                <h4 className="text-xs sm:text-base font-extrabold text-white truncate w-full mt-1">
                  {topThree[0]?.username || '---'}
                </h4>
                <p className="text-sm sm:text-lg font-extrabold text-amber-200 mt-1 tabular-nums">
                  ₹{topThree[0]?.periodWinnings || 0}
                </p>
              </motion.div>

              {/* Rank 3 */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="bg-white border border-slate-200/90 rounded-[24px] p-3.5 sm:p-5 text-center shadow-xs flex flex-col items-center"
              >
                <div className="relative mb-2.5">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 border-amber-400/60 bg-slate-100">
                    <SafeImage src={APP_MEDIA.emblem} className="w-full h-full" showLoader={false} />
                  </div>
                  <span className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-amber-600 text-white text-[11px] font-extrabold flex items-center justify-center border-2 border-white">
                    3
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate w-full">
                  {topThree[2]?.username || '---'}
                </h4>
                <p className="text-xs sm:text-sm font-extrabold text-[#007AFF] mt-1 tabular-nums">
                  ₹{topThree[2]?.periodWinnings || 0}
                </p>
              </motion.div>
            </div>

            {/* Ranked List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Hall of Fame
                </span>
                <span className="text-xs font-bold text-[#007AFF]">Top 100</span>
              </div>

              {remainingPlayers.length > 0 ? (
                remainingPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-2xs"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="w-8 text-sm font-extrabold text-slate-400 tabular-nums text-center">
                        #{index + 4}
                      </span>
                      <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                        <SafeImage src={APP_MEDIA.emblem} className="w-full h-full" showLoader={false} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {player.username}
                        </h4>
                        <p className="text-[11px] text-slate-500 font-medium">Ranked Competitor</p>
                      </div>
                    </div>

                    <div className="px-3.5 py-1.5 bg-blue-50 border border-blue-100 rounded-xl shrink-0">
                      <span className="text-sm font-extrabold text-[#007AFF] tabular-nums">
                        ₹{player.periodWinnings || 0}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 bg-white border border-slate-200 rounded-2xl text-center">
                  <p className="text-xs font-semibold text-slate-400">More challengers joining soon</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
