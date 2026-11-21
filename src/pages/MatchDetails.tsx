import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Loader2,
  Trophy,
  Users,
  X,
  AlertCircle,
  Search,
  CheckCircle2,
  Swords,
  Key,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import { Page, Tournament, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';
import { getModeArt } from '../assets/media';
import { useIosFeedback } from '../components/IosFeedback';

interface MatchDetailsProps {
  user: User | null;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
}

function formatMatchSchedule(timeStr?: string) {
  if (!timeStr) return 'Today • 08:40 AM';
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
    return `${day}/${month}/${year} at ${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

export default function MatchDetails({ user, onPageChange, joinedMatchIds }: MatchDetailsProps) {
  const { id } = useParams<{ id: string }>();
  const matchId = id || '';
  const { showToast } = useIosFeedback();

  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllJoiningsModal, setShowAllJoiningsModal] = useState(false);
  const [joiningsSearch, setJoiningsSearch] = useState('');
  const [showRoomDetailsModal, setShowRoomDetailsModal] = useState(false);
  const [sectionRules, setSectionRules] = useState<string[]>([]);

  useEffect(() => {
    if (!matchData) return;
    if (matchData.rules && Array.isArray(matchData.rules) && matchData.rules.length > 0) {
      setSectionRules(matchData.rules);
      return;
    }
    if (matchData.rules && typeof matchData.rules === 'string' && matchData.rules.trim().length > 0) {
      setSectionRules(matchData.rules.split('\n').filter((r) => r.trim().length > 0));
      return;
    }

    const fetchRules = async () => {
      try {
        const sec = (matchData.section || matchData.mode || 'Battle Royale').toLowerCase().trim();
        const normKey = sec.replace(/[^a-z0-9]+/g, '_');
        let snap = await getDoc(doc(db, 'gameRules', normKey));
        if (!snap.exists() && matchData.modeId) {
          snap = await getDoc(doc(db, 'gameRules', matchData.modeId));
        }
        if (!snap.exists()) {
          if (sec.includes('clash') || sec.includes('4v4')) snap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
          else if (sec.includes('lone') || sec.includes('wolf') || sec.includes('1v1'))
            snap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
          else if (sec.includes('sniper')) snap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
          else if (sec.includes('custom')) snap = await getDoc(doc(db, 'gameRules', 'custom_room'));
          else snap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
        }

        if (snap.exists() && snap.data().rules && snap.data().rules.length > 0) {
          setSectionRules(snap.data().rules);
        }
      } catch (err) {
        console.warn('Failed to load dynamic rules:', err);
      }
    };
    fetchRules();
  }, [matchData?.id, matchData?.section, matchData?.mode, matchData?.modeId, matchData?.rules]);

  useEffect(() => {
    if (!matchId) {
      setError('Match ID not found');
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'matches', matchId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Tournament;
          setMatchData(data);
          setError(null);
        } else {
          setError('Match does not exist or has been removed');
        }
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `matches/${matchId}`);
        setError('Failed to load match details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex flex-col items-center justify-center p-6">
        <Loader2 className="w-8 h-8 text-[#007AFF] animate-spin mb-3" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Loading Contest Details...
        </p>
      </div>
    );
  }

  if (error || !matchData) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-slate-200 rounded-[28px] p-8 max-w-sm w-full shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-base font-extrabold text-slate-900 mb-1">Contest Not Found</h2>
          <p className="text-xs text-slate-500 mb-5">{error || 'This tournament is not available.'}</p>
          <button
            type="button"
            onClick={() => onPageChange(Page.TOURNAMENTS)}
            className="w-full min-h-[44px] bg-[#007AFF] text-white rounded-2xl font-bold text-xs"
          >
            Back to Tournaments
          </button>
        </div>
      </div>
    );
  }

  const isJoined =
    joinedMatchIds.includes(matchId) ||
    (matchData.players &&
      user &&
      matchData.players.some((p) => p.userId === user.id || p.userId === auth.currentUser?.uid));
  const isOngoing = matchData.status === 'ongoing';
  const isCompleted = matchData.status === 'completed';

  const totalSlots = matchData.totalSlots || matchData.maxPlayers || 48;
  const players = matchData.players || [];
  const playersCount = matchData.playersCount || players.length;
  const spotsLeft = Math.max(0, totalSlots - playersCount);
  const isFull = spotsLeft <= 0;

  const displayMatchNumber = matchData.displayId
    ? matchData.displayId.replace(/[^0-9]/g, '') || matchData.displayId
    : (matchData as any).matchNumber
    ? String((matchData as any).matchNumber)
    : matchId.slice(-6).toUpperCase();

  const bannerImage =
    matchData.image && !matchData.image.includes('unsplash') && !matchData.image.includes('ibb.co')
      ? matchData.image
      : getModeArt(`${matchData.section} ${matchData.mode}`);

  const matchTitle =
    matchData.title ||
    `${(matchData.section || 'BR').toUpperCase()} ${(matchData.mode || 'SOLO').toUpperCase()} BATTLE`;

  const teamType = matchData.mode
    ? matchData.mode.charAt(0).toUpperCase() + matchData.mode.slice(1).toLowerCase()
    : 'Solo';
  const modeName = (matchData.section || 'Battle Royale').toUpperCase();
  const mapName = (matchData.map || 'BERMUDA').toUpperCase();
  const isPaid = (matchData.entryFee || 0) > 0;
  const matchTypeStr = isPaid ? 'Paid' : 'Free';
  const entryFeeStr = isPaid ? `₹${matchData.entryFee}` : 'FREE';
  const scheduleFormatted = formatMatchSchedule(matchData.time);

  const totalPrizePool = (() => {
    if (matchData.prizePool && Number(matchData.prizePool) > 0) return Number(matchData.prizePool);
    if (matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0) {
      const total = Object.values(matchData.prizeDistribution).reduce<number>(
        (sum, val) => sum + (Number(val) || 0),
        0
      );
      if (total > 0) return total;
    }
    if (matchData.prize) {
      const parsed = parseInt(String(matchData.prize).replace(/[^0-9]/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 300;
  })();

  const prizeItems = (() => {
    const items: { label: string; amount: string }[] = [];
    const isSurvival = matchData.prizeType === 'survival';
    items.push({
      label: 'PER KILL',
      amount: isSurvival ? '₹0' : `₹${matchData.perKillAmount || 0}`,
    });

    const source =
      matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0
        ? matchData.prizeDistribution
        : matchData.positionPrizeDistribution;

    if (source && Object.keys(source).length > 0) {
      Object.keys(source)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((rank) => {
          const label =
            rank === 1
              ? '1ST (BOOYAH)'
              : rank === 2
              ? '2ND (RUNNER UP)'
              : rank === 3
              ? '3RD PLACE'
              : `${rank}TH PLACE`;
          items.push({ label, amount: `₹${source[rank]}` });
        });
    } else if (isSurvival) {
      items.push({ label: '1ST (BOOYAH)', amount: `₹${totalPrizePool}` });
    }
    return items;
  })();

  const aboutDescription =
    matchData.description ||
    `Official ${teamType} ${matchData.section || 'Battle Royale'} match on ${mapName}. Fair play monitored with automated room dispatch.`;

  const rulesList =
    sectionRules && sectionRules.length > 0
      ? sectionRules
      : [
          'Only players with Level 40+ IDs are eligible to participate.',
          'Emulators and third-party scripts are strictly prohibited.',
          'Enter exact case-sensitive In-Game Name before locking slots.',
          'No teaming, stream sniping, or bug abuse allowed.',
          'Refunds are credited automatically if a room is cancelled.',
        ];

  const filteredPlayers = players.filter((p) => {
    if (!joiningsSearch) return true;
    const term = joiningsSearch.toLowerCase();
    return (
      (p.username && p.username.toLowerCase().includes(term)) ||
      (p.ign && p.ign.toLowerCase().includes(term)) ||
      (p.slot && String(p.slot).includes(term))
    );
  });

  const handleCopy = (val: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    showToast('Copied to clipboard', 'success');
  };

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-32 select-none">
      {/* Frosted iOS Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
            aria-label="Back to Tournaments"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
              Contest #{displayMatchNumber}
            </h1>
            <p className="text-[11px] font-medium text-slate-500">{modeName}</p>
          </div>

          {isJoined && (matchData.roomId || matchData.roomPassword) ? (
            <button
              type="button"
              onClick={() => setShowRoomDetailsModal(true)}
              className="px-3 py-2 bg-[#007AFF] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
            >
              <Key size={13} />
              <span>ID</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Banner Card */}
        <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs">
          <div className="relative aspect-[16/9] sm:aspect-[16/8] bg-slate-100">
            <SafeImage
              src={bannerImage}
              fallbackSrc={getModeArt(matchData.section)}
              alt={matchTitle}
              className="w-full h-full"
              imgClassName="w-full h-full object-cover"
            />

            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              {isCompleted ? (
                <span className="bg-slate-900/85 text-white text-[11px] font-bold px-3 py-1 rounded-full">
                  Completed
                </span>
              ) : isOngoing ? (
                <span className="bg-rose-600 text-white text-[11px] font-bold px-3 py-1 rounded-full">
                  Live Now
                </span>
              ) : isFull ? (
                <span className="bg-amber-500 text-white text-[11px] font-bold px-3 py-1 rounded-full">
                  Full ({playersCount}/{totalSlots})
                </span>
              ) : (
                <span className="bg-[#007AFF] text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-xs">
                  {spotsLeft} Spots Left
                </span>
              )}
            </div>

            {isJoined && (
              <div className="absolute top-3 right-3 bg-emerald-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                <CheckCircle2 size={12} />
                <span>Joined</span>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              {matchTitle}
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">{scheduleFormatted}</p>
          </div>
        </div>

        {/* Basic Info Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: 'Team Format', val: teamType },
            { label: 'Map', val: mapName },
            { label: 'Match Type', val: matchTypeStr },
            { label: 'Entry Fee', val: entryFeeStr, blue: true },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200/80 rounded-2xl p-3.5 text-center shadow-2xs"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {item.label}
              </span>
              <span
                className={`text-sm font-extrabold mt-0.5 block tabular-nums ${
                  item.blue ? 'text-[#007AFF]' : 'text-slate-900'
                }`}
              >
                {item.val}
              </span>
            </div>
          ))}
        </div>

        {/* Prize Details */}
        <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Trophy size={16} className="text-[#007AFF]" />
              <span>Prize Breakdown</span>
            </h3>
            <span className="text-xs font-bold text-[#007AFF] bg-blue-50 border border-blue-100 px-3 py-1 rounded-full tabular-nums">
              Total Pool: ₹{totalPrizePool}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {prizeItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-xs sm:text-sm">
                <span className="font-bold text-slate-600">{item.label}</span>
                <span className="font-extrabold text-slate-900 tabular-nums">{item.amount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* About & Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900 mb-2">About Contest</h3>
            <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">
              {aboutDescription}
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900 mb-2.5 flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-[#007AFF]" />
              <span>Rules & Fair Play</span>
            </h3>
            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              {rulesList.map((rule, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] mt-1.5 shrink-0" />
                  <p>{rule}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* View All Joinings */}
        <button
          type="button"
          onClick={() => setShowAllJoiningsModal(true)}
          className="w-full min-h-[48px] bg-white border border-slate-200 hover:border-[#007AFF]/50 text-slate-900 rounded-2xl font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2"
        >
          <Users size={16} className="text-[#007AFF]" />
          <span>View Registered Players ({playersCount}/{totalSlots})</span>
        </button>
      </div>

      {/* Frosted iOS Bottom Action Bar */}
      <div className="fixed bottom-0 inset-x-0 ios-glass border-t border-slate-200/80 z-40">
        <div className="max-w-3xl mx-auto p-3.5 sm:p-4">
          {isCompleted ? (
            <button
              type="button"
              disabled
              className="w-full min-h-[48px] bg-slate-200 text-slate-500 rounded-2xl font-bold text-sm cursor-not-allowed"
            >
              Match Completed
            </button>
          ) : isOngoing ? (
            isJoined && (matchData.roomId || matchData.roomPassword) ? (
              <button
                type="button"
                onClick={() => setShowRoomDetailsModal(true)}
                className="w-full min-h-[48px] bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2"
              >
                <Key size={16} />
                <span>View Room ID & Password</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] bg-rose-600 text-white rounded-2xl font-bold text-sm cursor-not-allowed"
              >
                Match In Progress
              </button>
            )
          ) : isJoined ? (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
                className="flex-1 min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-sm flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} />
                <span>Joined • View Slots</span>
              </button>
              {(matchData.roomId || matchData.roomPassword) && (
                <button
                  type="button"
                  onClick={() => setShowRoomDetailsModal(true)}
                  className="px-5 min-h-[48px] bg-[#007AFF] text-white rounded-2xl font-bold text-xs flex items-center gap-1.5"
                >
                  <Key size={16} />
                  <span>Room</span>
                </button>
              )}
            </div>
          ) : isFull ? (
            <button
              type="button"
              disabled
              className="w-full min-h-[48px] bg-slate-200 text-slate-500 rounded-2xl font-bold text-sm cursor-not-allowed"
            >
              All Slots Full
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
              className="w-full min-h-[50px] bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.98] text-white rounded-2xl font-bold text-sm sm:text-base shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Swords size={18} />
              <span>Join Match {isPaid ? `• ₹${matchData.entryFee}` : '• FREE'}</span>
            </button>
          )}
        </div>
      </div>

      {/* View All Joinings Modal */}
      <AnimatePresence>
        {showAllJoiningsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowAllJoiningsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="w-full max-w-sm bg-white rounded-[28px] p-5 text-slate-900 shadow-2xl border border-slate-200 flex flex-col max-h-[82vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-blue-50 text-[#007AFF] rounded-xl flex items-center justify-center">
                    <Users size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Registered Players</h3>
                    <p className="text-[11px] font-semibold text-slate-500 tabular-nums">
                      {playersCount} of {totalSlots} Filled
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllJoiningsModal(false)}
                  className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="my-3 relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search IGN, name, or slot..."
                  value={joiningsSearch}
                  onChange={(e) => setJoiningsSearch(e.target.value)}
                  className="ios-input pl-9 pr-3 py-2.5 text-xs"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {players.length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <Users size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-bold">No players joined yet</p>
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    <p className="text-xs font-bold">No matching players</p>
                  </div>
                ) : (
                  filteredPlayers.map((player, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#F8FAFC] border border-slate-200/70 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center font-extrabold text-[11px] text-[#007AFF] tabular-nums">
                          #{player.slot || idx + 1}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {player.ign || player.username || 'Gamer'}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            @{player.username || `player${idx + 1}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Confirmed
                      </span>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowAllJoiningsModal(false)}
                className="mt-4 w-full min-h-[44px] bg-[#007AFF] text-white rounded-2xl font-bold text-xs"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room Credentials Modal */}
      <AnimatePresence>
        {showRoomDetailsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowRoomDetailsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 text-slate-900 shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowRoomDetailsModal(false)}
                className="absolute top-4 right-4 w-8 h-8 text-slate-500 bg-slate-100 rounded-full flex items-center justify-center"
              >
                <X size={16} />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center mx-auto mb-3">
                <Key size={24} />
              </div>

              <h3 className="text-base font-extrabold text-slate-900 mb-1">Room Credentials</h3>
              <p className="text-xs text-slate-500 mb-5">
                Enter these details in Free Fire Custom Room before match start
              </p>

              <div className="space-y-3 text-left mb-5">
                <div className="p-3.5 bg-[#F4F6FA] border border-slate-200/80 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Room ID</span>
                    <span className="font-mono font-bold text-slate-900 text-sm select-all">
                      {matchData.roomId || '15 min before match'}
                    </span>
                  </div>
                  {matchData.roomId && (
                    <button
                      type="button"
                      onClick={() => handleCopy(matchData.roomId!)}
                      className="p-2 bg-white border border-slate-200 rounded-xl text-[#007AFF]"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>

                <div className="p-3.5 bg-[#F4F6FA] border border-slate-200/80 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">
                      Password
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-sm select-all">
                      {matchData.roomPassword || '15 min before match'}
                    </span>
                  </div>
                  {matchData.roomPassword && (
                    <button
                      type="button"
                      onClick={() => handleCopy(matchData.roomPassword!)}
                      className="p-2 bg-white border border-slate-200 rounded-xl text-[#007AFF]"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRoomDetailsModal(false)}
                className="w-full min-h-[46px] bg-[#007AFF] text-white rounded-2xl font-bold text-xs"
              >
                Got It
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
