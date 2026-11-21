import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  Loader2,
  Gamepad,
  X,
  Trophy,
  Key,
  Copy,
  Users,
  Calendar,
  MapPin,
} from 'lucide-react';
import { Page, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import RulesModal from '../components/RulesModal';
import SafeImage from '../components/SafeImage';
import { getModeArt } from '../assets/media';
import { useIosFeedback } from '../components/IosFeedback';

interface TournamentListProps {
  onPageChange: (page: Page, id?: string) => void;
  selectedGameId?: string | null;
  joinedMatchIds: string[];
}

function formatTournamentSchedule(timeStr?: string) {
  if (!timeStr) return 'Today • 08:00 AM';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day}/${month}/${year} • ${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

export default function Tournaments({ onPageChange, joinedMatchIds }: TournamentListProps) {
  const { gameId } = useParams();
  const [searchParams] = useSearchParams();
  const { showToast } = useIosFeedback();
  const selectedGameId = gameId;
  const selectedModeId = searchParams.get('mode');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [gameModes, setGameModes] = useState<
    { id: string; title: string; category?: string; subtitle?: string; gameId?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrizeMatch, setSelectedPrizeMatch] = useState<Tournament | null>(null);
  const [selectedResultsMatch, setSelectedResultsMatch] = useState<Tournament | null>(null);
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);
  const [matchResults, setMatchResults] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const statusParam = searchParams.get('status') as 'upcoming' | 'ongoing' | 'completed' | null;
  const [activeTab, setActiveTab] = useState<'upcoming' | 'ongoing' | 'completed'>(
    statusParam || 'upcoming'
  );
  const [showIdPass, setShowIdPass] = useState<{
    isOpen: boolean;
    roomId?: string;
    roomPass?: string;
  }>({ isOpen: false });

  useEffect(() => {
    if (statusParam && (statusParam === 'upcoming' || statusParam === 'ongoing' || statusParam === 'completed')) {
      setActiveTab(statusParam);
    }
  }, [statusParam]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  const filteredMatches = tournaments.filter((m) => {
    const status = m.status || 'upcoming';
    if (status === 'active' && activeTab === 'upcoming') return true;
    if (status !== activeTab) return false;

    if (selectedModeId) {
      const modeId = selectedModeId.toLowerCase().trim();
      const modeClean = modeId.replace(/[_-]/g, ' ').trim();

      if (m.modeId && m.modeId.toLowerCase() === modeId) return true;

      const matchedGameMode = gameModes.find(
        (gm) => gm.id.toLowerCase() === modeId || gm.id === selectedModeId
      );
      if (matchedGameMode) {
        const gmTitleL = (matchedGameMode.title || '').toLowerCase();
        const gmSubL = (matchedGameMode.subtitle || '').toLowerCase();
        const gmCatL = (matchedGameMode.category || '').toLowerCase();

        if (
          (m.modeId && m.modeId === matchedGameMode.id) ||
          (m.mode && m.mode.toLowerCase() === gmTitleL) ||
          (m.section &&
            (m.section.toLowerCase() === gmTitleL ||
              m.section.toLowerCase() === gmCatL ||
              m.section.toLowerCase() === gmSubL)) ||
          (m.title && m.title.toLowerCase().includes(gmTitleL))
        ) {
          return true;
        }
      }

      if (modeId.startsWith('br_')) {
        if (m.section === 'Battle Royale' || !m.section) {
          const targetMode = modeId.replace('br_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      } else if (modeId.startsWith('cs_')) {
        if (m.section === 'Clash Squad' || m.section === 'CS 1v1' || m.section === 'CS 2v2') {
          const targetMode = modeId.replace('cs_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      } else if (modeId.startsWith('lone_wolf_')) {
        if (m.section === 'Lone Wolf') {
          const targetMode = modeId.replace('lone_wolf_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      }

      const modeLower = (m.mode || '').toLowerCase();
      const sectionLower = (m.section || '').toLowerCase();
      const titleLower = (m.title || '').toLowerCase();
      const mModeId = (m.modeId || '').toLowerCase();

      if (
        mModeId === modeId ||
        modeLower === modeId ||
        modeLower === modeClean ||
        sectionLower === modeId ||
        sectionLower === modeClean ||
        modeLower.includes(modeClean) ||
        sectionLower.includes(modeClean) ||
        titleLower.includes(modeClean) ||
        titleLower.includes(modeId)
      ) {
        return true;
      }

      return false;
    }

    return true;
  });

  const getPageTitle = () => {
    if (selectedModeId) {
      const modeIdLower = selectedModeId.toLowerCase().trim();
      const modeIdClean = modeIdLower.replace(/[_-]/g, ' ').trim();

      const directMode = gameModes.find(
        (m) => m.id === selectedModeId || m.id.toLowerCase() === modeIdLower
      );
      if (directMode && directMode.title) {
        return directMode.title.trim();
      }

      const matchedTournament = tournaments.find((m) => {
        const mModeId = (m.modeId || '').toLowerCase();
        const mSection = (m.section || '').toLowerCase();
        const mMode = (m.mode || '').toLowerCase();
        return mModeId === modeIdLower || mSection === modeIdClean || mMode === modeIdClean;
      });
      if (matchedTournament) {
        return matchedTournament.section || matchedTournament.mode || 'Tournaments';
      }
      return modeIdClean.toUpperCase();
    }

    if (selectedGameId) {
      const g = selectedGameId.toLowerCase();
      if (g.includes('cs') || g.includes('clash')) return 'Clash Squad Contests';
      if (g.includes('wolf')) return 'Lone Wolf Contests';
      if (g.includes('freefire')) return 'Free Fire Contests';
    }
    return 'All Contests';
  };

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

  useEffect(() => {
    const qModes = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
    const unsubModes = onSnapshot(
      qModes,
      (snapshot) => {
        const modesData = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as { id: string; title: string; category?: string; subtitle?: string; gameId?: string }[];
        setGameModes(modesData);
      },
      () => {}
    );

    return () => unsubModes();
  }, []);

  useEffect(() => {
    const q = selectedGameId
      ? query(collection(db, 'matches'), where('gameId', '==', selectedGameId), orderBy('createdAt', 'desc'))
      : query(collection(db, 'matches'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Tournament[];
        setTournaments(data);
        setLoading(false);
      },
      (error) => {
        if (error.message.includes('index')) {
          onSnapshot(
            collection(db, 'matches'),
            (snap) => {
              setTournaments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tournament));
              setLoading(false);
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'matches')
          );
        } else {
          handleFirestoreError(error, OperationType.LIST, 'matches');
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [selectedGameId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F2F4F8]">
        <Loader2 size={28} className="text-[#007AFF] animate-spin mb-3" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Loading Contests...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      {/* Frosted iOS Top Header with Segmented Tab Bar */}
      <header className="sticky top-0 z-40 ios-glass border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onPageChange(Page.HOME)}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
              aria-label="Back to home"
            >
              <ChevronLeft size={20} />
            </button>

            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 text-center capitalize">
              {getPageTitle()}
            </h1>

            <div className="w-10" />
          </div>

          {/* iOS Segmented Control */}
          <div className="bg-slate-200/75 p-1 rounded-2xl flex items-center max-w-md mx-auto">
            {[
              { id: 'ongoing', label: 'Ongoing' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'completed', label: 'Resulted' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white text-[#007AFF] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Responsive Tournament Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
        {filteredMatches.length === 0 ? (
          <div className="py-20 bg-white rounded-[28px] border border-slate-200/80 text-center px-6 shadow-xs max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center mx-auto mb-3">
              <Gamepad size={26} />
            </div>
            <p className="text-sm font-extrabold text-slate-900">
              No {activeTab === 'completed' ? 'Resulted' : activeTab} Contests
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Check back soon for new Free Fire battleground rooms.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredMatches.map((t, idx) => {
              const isJoined = joinedMatchIds.includes(t.id);
              const isOngoing = t.status === 'ongoing';
              const isCompleted = t.status === 'completed';

              const prizePoolNum = (() => {
                if (t.prizePool && Number(t.prizePool) > 0) return Number(t.prizePool);
                if (t.prizeDistribution && Object.keys(t.prizeDistribution).length > 0) {
                  const total = (Object.values(t.prizeDistribution) as any[]).reduce(
                    (sum: number, val: any) => sum + (Number(val) || 0),
                    0
                  );
                  if (total > 0) return total;
                }
                if (t.prize) {
                  const parsed = parseInt(String(t.prize).replace(/[^0-9]/g, ''));
                  if (!isNaN(parsed) && parsed > 0) return parsed;
                }
                return 300;
              })();

              const perKillValue =
                t.prizeType === 'survival' ? 0 : Number(t.perKillAmount) || 0;

              const totalSlots = t.totalSlots || t.maxPlayers || 48;
              const playersCount = t.playersCount || (t.players ? t.players.length : 0);
              const spotsLeft = Math.max(0, totalSlots - playersCount);
              const progressPercentage = Math.min(100, Math.max(0, (playersCount / totalSlots) * 100));

              const idTag = t.displayId
                ? `${t.displayId}`
                : (t as any).matchNumber
                ? `#${(t as any).matchNumber}`
                : '';
              const baseTitle = t.title || 'Free Fire Battle';
              const displayTitle = idTag && !baseTitle.includes(idTag) ? `${baseTitle} ${idTag}` : baseTitle;

              const mapName = (t.map || 'BERMUDA').toUpperCase();
              const typeName = (t.section || 'BATTLE ROYALE').toUpperCase();
              const entryFeeValue = t.entryFee !== undefined && t.entryFee !== null ? t.entryFee : 5;
              const cardImage =
                t.image && !t.image.includes('unsplash') && !t.image.includes('ibb.co')
                  ? t.image
                  : getModeArt(`${t.section} ${t.mode}`);

              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.25) }}
                  onClick={() => onPageChange(Page.MATCH_DETAILS, t.id)}
                  className="bg-white border border-slate-200/90 hover:border-[#007AFF]/50 rounded-[26px] overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Card Artwork */}
                    <div className="relative w-full aspect-[16/9] bg-slate-100 overflow-hidden">
                      <SafeImage
                        src={cardImage}
                        fallbackSrc={getModeArt(t.section)}
                        alt={displayTitle}
                        className="w-full h-full"
                        imgClassName="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-xs text-[10px] font-bold text-[#007AFF] shadow-xs">
                          {typeName}
                        </span>
                        {t.mode && (
                          <span className="px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-xs text-[10px] font-bold text-white uppercase">
                            {t.mode}
                          </span>
                        )}
                      </div>

                      {isJoined && (
                        <div className="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                          Joined
                        </div>
                      )}
                    </div>

                    {/* Details Body */}
                    <div className="p-4 sm:p-5">
                      <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug line-clamp-1">
                        {displayTitle}
                      </h3>

                      <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500 mt-1.5 mb-4">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} className="text-[#007AFF]" />
                          {formatTournamentSchedule(t.time)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="text-slate-400" />
                          {mapName}
                        </span>
                      </div>

                      {/* 3-Column Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2 bg-[#F4F6FA] border border-slate-200/70 rounded-2xl p-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPrizeMatch(t);
                          }}
                          className="flex flex-col items-center justify-center hover:opacity-80"
                        >
                          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                            Prize <Trophy size={10} className="text-[#007AFF]" />
                          </span>
                          <span className="text-sm font-extrabold text-slate-900 mt-0.5 tabular-nums">
                            ₹{prizePoolNum}
                          </span>
                        </button>

                        <div className="flex flex-col items-center justify-center border-x border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Per Kill</span>
                          <span className="text-sm font-extrabold text-emerald-600 mt-0.5 tabular-nums">
                            ₹{perKillValue}
                          </span>
                        </div>

                        <div className="flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Entry</span>
                          <span className="text-sm font-extrabold text-[#007AFF] mt-0.5 tabular-nums">
                            {entryFeeValue === 0 ? 'FREE' : `₹${entryFeeValue}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Slots Progress & Action Footer */}
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                        <div
                          style={{ width: `${progressPercentage}%` }}
                          className="h-full bg-[#007AFF] rounded-full transition-all duration-300"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold tabular-nums">
                        <span className={spotsLeft === 0 ? 'text-rose-600' : 'text-[#007AFF]'}>
                          {spotsLeft === 0 ? 'Match Full' : `${spotsLeft} Spots Left`}
                        </span>
                        <span className="text-slate-500">
                          {playersCount}/{totalSlots}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCompleted) {
                          if (isJoined) {
                            setSelectedResultsMatch(t);
                            return;
                          }
                        } else if (isOngoing) {
                          if (isJoined) {
                            setShowIdPass({
                              isOpen: true,
                              roomId: t.roomId,
                              roomPass: t.roomPassword,
                            });
                            return;
                          }
                        }
                        onPageChange(Page.MATCH_DETAILS, t.id);
                      }}
                      className={`min-h-[40px] px-5 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 ${
                        isCompleted
                          ? isJoined
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-500'
                          : isOngoing
                          ? isJoined
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-200 text-slate-500'
                          : isJoined
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#007AFF] hover:bg-[#0066D6] text-white shadow-sm shadow-blue-500/20'
                      }`}
                    >
                      {isCompleted
                        ? isJoined
                          ? 'Results'
                          : 'Finished'
                        : isOngoing
                        ? isJoined
                          ? 'Room ID'
                          : 'Live'
                        : isJoined
                        ? 'Joined'
                        : 'Join'}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Prize Breakdown Modal */}
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
                className="w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                      <Trophy size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">Prize Breakdown</h3>
                      <p className="text-xs text-slate-500 truncate max-w-[180px]">
                        {selectedPrizeMatch.title}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPrizeMatch(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="bg-[#F4F6FA] border border-slate-200/80 rounded-2xl p-3.5 mb-4 grid grid-cols-2 gap-2 text-center">
                  <div className="border-r border-slate-200 pr-2">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">
                      Total Pool
                    </span>
                    <span className="text-lg font-extrabold text-[#007AFF] tabular-nums">
                      ₹{displayTotalPool}
                    </span>
                  </div>
                  <div className="pl-2">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">
                      Per Kill
                    </span>
                    <span className="text-lg font-extrabold text-emerald-600 tabular-nums">
                      {isSurvival ? '₹0' : `₹${selectedPrizeMatch.perKillAmount || 0}`}
                    </span>
                  </div>
                </div>

                <div className="max-h-[38vh] overflow-y-auto no-scrollbar space-y-2">
                  {validEntries.length > 0 ? (
                    validEntries.map(([pos, amount]) => {
                      const posNum = Number(pos);
                      return (
                        <div
                          key={pos}
                          className={`flex items-center justify-between p-3 rounded-2xl border ${
                            posNum === 1
                              ? 'bg-blue-50/70 border-blue-200'
                              : 'bg-[#F8FAFC] border-slate-200/70'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-extrabold text-[#007AFF] w-7 tabular-nums">
                              #{pos}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {posNum === 1 ? '1st Place' : posNum === 2 ? '2nd Place' : posNum === 3 ? '3rd Place' : `Rank #${posNum}`}
                            </span>
                          </div>
                          <span className="text-sm font-extrabold text-emerald-600 tabular-nums">
                            ₹{amount}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">#1 Winner</span>
                      <span className="text-sm font-extrabold text-emerald-600 tabular-nums">
                        ₹{displayTotalPool}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPrizeMatch(null)}
                  className="w-full min-h-[46px] bg-[#007AFF] text-white rounded-2xl text-xs font-bold mt-5"
                >
                  Close
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
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 truncate max-w-[180px]">
                      {selectedResultsMatch.title}
                    </h3>
                    <p className="text-xs text-slate-500">Match Standings</p>
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
                      <p className="text-[10px] font-bold uppercase text-slate-500">Players</p>
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
                  <p className="text-xs text-slate-500">Results pending declaration</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedResultsMatch(null)}
                className="mt-5 w-full min-h-[46px] bg-[#007AFF] text-white text-xs font-bold rounded-2xl"
              >
                Close Results
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room Credentials Modal */}
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
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Room Credentials</h3>
                    <p className="text-xs text-slate-500">Do not share outside room</p>
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
                    <p className="text-base font-mono font-bold text-slate-900 select-all">
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
                    <p className="text-base font-mono font-bold text-slate-900 select-all">
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
                Got It
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RulesModal
        isOpen={!!selectedRulesMatch}
        onClose={() => setSelectedRulesMatch(null)}
        section={selectedRulesMatch?.section || 'Battle Royale'}
        isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
        onJoin={() => onPageChange(Page.JOIN_MATCH, selectedRulesMatch?.id || '')}
      />
    </div>
  );
}
