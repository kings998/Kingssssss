import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Copy, X, Loader2, Shield, ChevronRight } from 'lucide-react';
import { Page, User, Tournament, Banner } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import { getEffectiveRole, hasPanelAccess } from '../constants';
import { useIosFeedback } from '../components/IosFeedback';

import HomeHeader from '../components/HomeHeader';
import AnnouncementBar from '../components/AnnouncementBar';
import HeroBannerCarousel from '../components/HeroBannerCarousel';
import MyMatches from '../components/MyMatches';
import EsportsGamesGrid from '../components/EsportsGamesGrid';
import RulesModal from '../components/RulesModal';
import NotificationsModal from '../components/NotificationsModal';

interface HomeProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
}

export default function Home({ user, onPageChange, joinedMatchIds }: HomeProps) {
  const { showToast } = useIosFeedback();
  const [selectedPrizeMatch, setSelectedPrizeMatch] = useState<Tournament | null>(null);
  const [selectedResultsMatch, setSelectedResultsMatch] = useState<Tournament | null>(null);
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);

  const [isGeneralRulesOpen, setIsGeneralRulesOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useModalBackHandler(!!selectedPrizeMatch, () => setSelectedPrizeMatch(null));
  useModalBackHandler(!!selectedResultsMatch, () => setSelectedResultsMatch(null));
  useModalBackHandler(!!selectedRulesMatch || isGeneralRulesOpen, () => {
    setSelectedRulesMatch(null);
    setIsGeneralRulesOpen(false);
  });
  useModalBackHandler(isNotificationsOpen, () => setIsNotificationsOpen(false));

  const [matchResults, setMatchResults] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [showIdPass, setShowIdPass] = useState<{ isOpen: boolean; roomId?: string; roomPass?: string }>({ isOpen: false });

  useModalBackHandler(showIdPass.isOpen, () => setShowIdPass({ isOpen: false }));

  const effectiveRole = getEffectiveRole(user);
  const canOpenPanel = hasPanelAccess(user);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('matchNumber', 'desc'));
    const unsubMatches = onSnapshot(
      q,
      (snapshot) => {
        setMatches(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Tournament)));
      },
      (err) => {
        console.error('Error fetching matches for home:', err);
        handleFirestoreError(err, OperationType.LIST, 'matches');
      }
    );

    const unsubBanners = onSnapshot(
      query(collection(db, 'banners'), where('isActive', '!=', false), orderBy('order', 'asc')),
      (snapshot) => {
        const fetchedBanners = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Banner));
        setHeroBanners(fetchedBanners.filter((b) => b.type === 'main' || b.type === 'offer'));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    return () => {
      unsubMatches();
      unsubBanners();
    };
  }, []);

  useEffect(() => {
    if (selectedResultsMatch) {
      setLoadingResults(true);
      const fetchResults = async () => {
        try {
          const { getDocs, query, collection, where } = await import('firebase/firestore');
          const resSnap = await getDocs(
            query(collection(db, 'matchResults'), where('matchId', '==', selectedResultsMatch.id))
          );
          if (!resSnap.empty) {
            setMatchResults(resSnap.docs[0].data());
          } else {
            showToast('Results not declared for this match yet.', 'info');
            setSelectedResultsMatch(null);
          }
        } catch (error) {
          console.error('Error fetching results:', error);
        } finally {
          setLoadingResults(false);
        }
      };
      fetchResults();
    } else {
      setMatchResults(null);
    }
  }, [selectedResultsMatch]);

  return (
    <div className="pb-24 min-h-screen bg-[#F2F4F8] text-slate-900 select-none">
      {/* 1. Frosted iOS Top Header */}
      <HomeHeader
        user={user}
        onPageChange={onPageChange}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      {/* Quick Control Panels Strip for Admin / Co-Owner / Staff */}
      {canOpenPanel && (
        <section className="px-4 sm:px-6 mt-3.5 max-w-6xl mx-auto">
          <div className="bg-white border border-blue-200/80 rounded-2xl p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 px-1">
              <div className="w-7 h-7 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                <Shield size={14} />
              </div>
              <span className="text-xs font-bold text-slate-800">Control Panels</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {effectiveRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN)}
                  className="px-3 py-1.5 rounded-xl bg-[#007AFF] text-white text-xs font-bold shadow-xs hover:bg-[#0066D6] active:scale-95 transition-all flex items-center gap-1"
                >
                  <span>Admin Panel</span>
                  <ChevronRight size={12} />
                </button>
              )}
              {(effectiveRole === 'admin' || effectiveRole === 'co_owner') && (
                <button
                  type="button"
                  onClick={() => onPageChange(Page.CO_OWNER)}
                  className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold hover:bg-sky-100 active:scale-95 transition-all flex items-center gap-1"
                >
                  <span>Co-Owner</span>
                  <ChevronRight size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onPageChange(Page.STAFF)}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 active:scale-95 transition-all flex items-center gap-1"
              >
                <span>Staff Panel</span>
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 2. Announcement / Rules Bar */}
      <AnnouncementBar
        text="KINGS RELOAD — MATCH RULES & OFFICIAL TELEGRAM"
        onClick={() => {
          if (matches.length > 0) {
            setSelectedRulesMatch(matches[0]);
          } else {
            setIsGeneralRulesOpen(true);
          }
        }}
      />

      {/* 3. Hero Banner Carousel */}
      <HeroBannerCarousel banners={heroBanners} onPageChange={onPageChange} />

      {/* 4. My Matches */}
      <MyMatches
        matches={matches}
        joinedMatchIds={joinedMatchIds}
        onPageChange={onPageChange}
      />

      {/* 5. Esports Arenas & Modes */}
      <EsportsGamesGrid matches={matches} onPageChange={onPageChange} />

      {/* Prize Pool Breakdown Modal */}
      <AnimatePresence>
        {selectedPrizeMatch && (() => {
          const isSurvival = selectedPrizeMatch.prizeType === 'survival';
          const distribution = isSurvival
            ? selectedPrizeMatch.prizeDistribution || {}
            : selectedPrizeMatch.positionPrizeDistribution || {};

          const validEntries = Object.entries(distribution)
            .sort(([a], [b]) => Number(a) - Number(b))
            .filter(([_, amount]) => (Number(amount) || 0) > 0);

          const calculatedTotal =
            validEntries.length > 0
              ? validEntries.reduce((sum, [_, amt]) => sum + (Number(amt) || 0), 0)
              : selectedPrizeMatch.prizePool || 0;

          const displayTotalPool = calculatedTotal > 0 ? calculatedTotal : selectedPrizeMatch.prizePool || 0;
          const winnersCount =
            validEntries.length > 0
              ? validEntries.length
              : selectedPrizeMatch.winnersCount || (isSurvival ? 1 : 0);

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedPrizeMatch(null)}
            >
              <motion.div
                initial={{ scale: 0.94, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.94, y: 16 }}
                className="w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] border border-blue-100 flex items-center justify-center shrink-0">
                      <Trophy size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-extrabold text-slate-900">Prize Breakdown</h3>
                      <p className="text-xs font-medium text-slate-500 truncate max-w-[180px]">
                        {selectedPrizeMatch.title}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPrizeMatch(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="bg-[#F4F6FA] border border-slate-200/80 rounded-2xl p-3.5 mb-4 grid grid-cols-2 gap-2 text-center">
                  <div className="border-r border-slate-200 pr-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Total Prize Pool
                    </span>
                    <span className="text-lg font-extrabold text-[#007AFF] mt-0.5 block tabular-nums">
                      ₹{displayTotalPool}
                    </span>
                  </div>
                  <div className="pl-2 flex flex-col justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Per Kill
                    </span>
                    <span className="text-lg font-extrabold text-emerald-600 mt-0.5 block tabular-nums">
                      {isSurvival ? '₹0' : `₹${selectedPrizeMatch.perKillAmount || 0}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-bold text-[#007AFF]">
                    {winnersCount > 1 ? `Top ${winnersCount} Rewarded` : 'Winner Payout'}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">Standings</span>
                </div>

                <div className="max-h-[38vh] overflow-y-auto no-scrollbar space-y-2">
                  {validEntries.length > 0 ? (
                    validEntries.map(([pos, amount]) => {
                      const posNum = Number(pos);
                      const isFirst = posNum === 1;
                      const rankTitle =
                        posNum === 1
                          ? '1st Place'
                          : posNum === 2
                          ? '2nd Place'
                          : posNum === 3
                          ? '3rd Place'
                          : `Rank #${posNum}`;

                      return (
                        <div
                          key={pos}
                          className={`flex items-center justify-between p-3 rounded-2xl border ${
                            isFirst
                              ? 'bg-blue-50/70 border-blue-200'
                              : 'bg-[#F8FAFC] border-slate-200/70'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`text-xs font-extrabold w-7 tabular-nums ${isFirst ? 'text-[#007AFF]' : 'text-slate-500'}`}>
                              #{pos}
                            </span>
                            <span className="text-xs font-bold text-slate-800">{rankTitle}</span>
                          </div>
                          <span className="text-sm font-extrabold text-emerald-600 tabular-nums">₹{amount}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">#1 Winner</span>
                      <span className="text-sm font-extrabold text-emerald-600 tabular-nums">₹{displayTotalPool}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPrizeMatch(null)}
                  className="w-full min-h-[46px] bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-bold transition-all mt-5 shadow-md shadow-blue-500/20"
                >
                  Close Details
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Match Results Modal */}
      <AnimatePresence>
        {selectedResultsMatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setSelectedResultsMatch(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 16 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl flex flex-col max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] border border-blue-100 flex items-center justify-center">
                    <Trophy size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-slate-900 truncate max-w-[180px]">
                      {selectedResultsMatch.title}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">Match Results</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedResultsMatch(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              {loadingResults ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <Loader2 size={28} className="text-[#007AFF] animate-spin mb-3" />
                  <p className="text-xs font-semibold text-slate-500">Fetching standings...</p>
                </div>
              ) : matchResults ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 bg-[#F4F6FA] rounded-2xl border border-slate-200/80">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Participants</p>
                      <p className="text-base font-extrabold text-slate-900 tabular-nums">
                        {matchResults.results?.length || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-[#F4F6FA] rounded-2xl border border-slate-200/80">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Distributed</p>
                      <p className="text-base font-extrabold text-emerald-600 tabular-nums">
                        ₹
                        {((matchResults.results || []).reduce(
                          (sum: number, r: any) => sum + (r.winningAmount || 0),
                          0
                        ) || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                    {matchResults.results
                      ?.sort((a: any, b: any) => {
                        const isSurvival =
                          matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale';
                        if (isSurvival) return a.rankOrKills - b.rankOrKills;
                        return b.rankOrKills - a.rankOrKills;
                      })
                      .map((res: any, idx: number) => {
                        const isWinner =
                          res.rankOrKills === 1 &&
                          (matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale');

                        return (
                          <div
                            key={`${res.userId}_${res.slot || idx}`}
                            className={`flex items-center justify-between p-3 rounded-2xl border ${
                              isWinner
                                ? 'bg-blue-50/70 border-blue-200'
                                : 'bg-[#F8FAFC] border-slate-200/70'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums ${
                                  isWinner
                                    ? 'bg-[#007AFF] text-white'
                                    : 'bg-white border border-slate-200 text-slate-600'
                                }`}
                              >
                                {matchResults.prizeType === 'perKill' ? 'K' : `#${res.rankOrKills}`}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-900">
                                  {res.ign || res.username}
                                </h4>
                                {matchResults.prizeType === 'perKill' && (
                                  <p className="text-[10px] font-semibold text-slate-500 tabular-nums">
                                    {res.rankOrKills} Kills
                                  </p>
                                )}
                              </div>
                            </div>
                            <p
                              className={`text-sm font-extrabold tabular-nums ${
                                res.winningAmount > 0 ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            >
                              {res.winningAmount > 0 ? `+₹${res.winningAmount}` : '₹0'}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <p className="text-xs text-slate-500 font-medium">Results pending declaration</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedResultsMatch(null)}
                className="mt-5 w-full min-h-[46px] bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-2xl transition-all"
              >
                Close Results
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ID Pass Modal */}
      <AnimatePresence>
        {showIdPass.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowIdPass({ isOpen: false })}
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 16 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] border border-blue-100 flex items-center justify-center">
                    <Star size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Room Credentials</h3>
                    <p className="text-xs text-slate-500">Joined players only</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIdPass({ isOpen: false })}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 mb-5">
                <div className="p-3.5 bg-[#F4F6FA] rounded-2xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Room ID</p>
                    <p className="text-base font-mono font-bold text-slate-900 tracking-wider">
                      {showIdPass.roomId || 'PENDING'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(showIdPass.roomId || '')}
                    className="p-2 bg-white border border-slate-200 text-[#007AFF] rounded-xl"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div className="p-3.5 bg-[#F4F6FA] rounded-2xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Password</p>
                    <p className="text-base font-mono font-bold text-slate-900 tracking-wider">
                      {showIdPass.roomPass || 'PENDING'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(showIdPass.roomPass || '')}
                    className="p-2 bg-white border border-slate-200 text-[#007AFF] rounded-xl"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIdPass({ isOpen: false })}
                className="w-full min-h-[46px] bg-[#007AFF] text-white text-xs font-bold rounded-2xl"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RulesModal
        isOpen={!!selectedRulesMatch || isGeneralRulesOpen}
        onClose={() => {
          setSelectedRulesMatch(null);
          setIsGeneralRulesOpen(false);
        }}
        section={selectedRulesMatch?.section || 'Battle Royale'}
        isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
        onJoin={() => onPageChange(Page.JOIN_MATCH, selectedRulesMatch?.id || '')}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onPageChange={onPageChange}
        user={user}
        joinedMatchIds={joinedMatchIds}
      />
    </div>
  );
}
