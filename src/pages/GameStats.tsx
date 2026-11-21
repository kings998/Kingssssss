import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Trophy,
  Sword,
  TrendingUp,
  History,
  Gamepad2,
  Loader2,
  IndianRupee,
} from 'lucide-react';
import { Page, User, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';

interface GameStatsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function GameStats({ user, onPageChange }: GameStatsProps) {
  const [history, setHistory] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user.id) {
        setLoading(false);
        return;
      }
      try {
        const q = query(
          collection(db, 'registrations'),
          where('userId', '==', user.id),
          orderBy('joinedAt', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);

        const tournamentPromises = snap.docs.map(async (pDoc) => {
          const tData = pDoc.data();
          const tDoc = await getDoc(doc(db, 'matches', tData.tournamentId));
          if (tDoc.exists()) {
            return { id: tDoc.id, ...tDoc.data() } as Tournament;
          }
          const legacyTDoc = await getDoc(doc(db, 'tournaments', tData.tournamentId));
          return { id: legacyTDoc.id, ...legacyTDoc.data() } as Tournament;
        });

        const tournaments = await Promise.all(tournamentPromises);
        setHistory(tournaments.filter((t) => t.title));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'registrations');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user.id]);

  const stats = user.stats || { matchesPlayed: 0, totalWins: 0, totalKills: 0, totalWinnings: 0 };
  const matchesPlayed = stats.matchesPlayed || 0;
  const totalWins = stats.totalWins || 0;
  const totalKills = stats.totalKills || 0;
  const totalWinnings = stats.totalWinnings || 0;

  const winRate = matchesPlayed > 0 ? ((totalWins / matchesPlayed) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      {/* Frosted iOS Top Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-extrabold text-slate-900">Match Statistics</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Gamepad2} label="Matches" value={matchesPlayed.toString()} accent="text-[#007AFF] bg-blue-50" />
          <StatCard icon={Trophy} label="Wins" value={totalWins.toString()} accent="text-amber-600 bg-amber-50" />
          <StatCard icon={Sword} label="Total Kills" value={totalKills.toString()} accent="text-rose-600 bg-rose-50" />
          <StatCard icon={TrendingUp} label="Win Rate" value={`${winRate}%`} accent="text-emerald-600 bg-emerald-50" />
        </div>

        {/* Lifetime Earnings Card */}
        <div className="bg-white border border-slate-200/80 rounded-[26px] p-6 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Lifetime Earnings
            </span>
            <p className="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">
              ₹{(totalWinnings || 0).toLocaleString()}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
            <IndianRupee size={24} />
          </div>
        </div>

        {/* Match History */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <History size={16} className="text-[#007AFF]" />
            <h3 className="text-sm font-extrabold text-slate-900">Recent Match History</h3>
          </div>

          {loading ? (
            <div className="py-16 bg-white border border-slate-200/80 rounded-[24px] flex flex-col items-center justify-center">
              <Loader2 className="text-[#007AFF] animate-spin mb-2" size={26} />
              <p className="text-xs font-semibold text-slate-500">Retrieving battle logs...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 bg-white border border-slate-200/80 rounded-[24px] flex flex-col items-center justify-center text-center px-6">
              <History size={28} className="text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No Match History</p>
              <p className="text-xs text-slate-400 mt-0.5">Matches you join will appear here.</p>
            </div>
          ) : (
            history.map((t, idx) => (
              <div
                key={t.id + idx}
                className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center gap-3.5 shadow-2xs"
              >
                <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-[#007AFF] shrink-0">
                  <Gamepad2 size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 truncate">{t.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.section} • {t.displayId || `#${t.id.slice(-4)}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Entry</span>
                  <p className="text-sm font-extrabold text-[#007AFF] tabular-nums">
                    {t.entryFee === 0 ? 'FREE' : `₹${t.entryFee}`}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="p-4 bg-white border border-slate-200/80 rounded-[22px] shadow-2xs">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accent}`}>
        <Icon size={17} />
      </div>
      <div className="text-[11px] font-bold text-slate-400">{label}</div>
      <div className="text-xl font-extrabold text-slate-900 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
