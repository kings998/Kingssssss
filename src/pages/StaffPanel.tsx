import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Shield,
  Trophy,
  Clock,
  Map as MapIcon,
  Users as UsersIcon,
  Loader2,
  Save,
  Edit2,
  Copy,
  Key,
  Check,
  ListChecks,
  ChevronUp,
  ChevronDown,
  Bell,
  Search,
  MessageCircle,
  Trash2,
  Receipt,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { Page, User, Tournament } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { getEffectiveRole, getRoleBadgeMeta, hasPanelAccess } from '../constants';
import { formatMatchTime } from '../utils/dateUtils';
import AdminNotificationsTab from '../components/AdminNotificationsTab';
import { useIosFeedback } from '../components/IosFeedback';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  serverTimestamp,
  runTransaction,
  query,
  orderBy,
  limit,
  increment,
  setDoc,
} from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface StaffPanelProps {
  user?: User | null;
  onPageChange: (page: Page, id?: string) => void;
}

enum StaffTab {
  ROOM_DISPATCH = 'room_dispatch',
  ALERTS = 'alerts',
  RULES = 'rules',
  TRANSACTIONS = 'transactions',
}

const RULE_PRESETS: Record<string, { title: string; category: string; rules: string[] }> = {
  battle_royale: {
    title: 'Battle Royale',
    category: 'Battle Royale',
    rules: [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: Strictly mobile & tablet devices only. Emulators/PC are prohibited.',
      'Anti-Teaming Rule: Teaming with opponents results in permanent ban.',
      'Late Entry: Room closes 2 minutes before match start time.',
      'Screenshot Policy: High-definition final match screenshot is mandatory in case of dispute.',
    ],
  },
  clash_squad: {
    title: 'Clash Squad (4v4 / Duo)',
    category: 'Clash Squad',
    rules: [
      'Level Requirement: Minimum Level 40 in Free Fire account.',
      'Device Requirements: Mobile & Tablet only.',
      'Teaming & Sabotage: Strictly forbidden.',
      'Screenshot Policy: Winning captain must submit end-game score screenshot.',
    ],
  },
  lone_wolf: {
    title: 'Lone Wolf (1v1 / 2v2)',
    category: 'Lone Wolf',
    rules: [
      'Level Requirement: Level 30+ Free Fire profile.',
      'Mobile / Tablet players only.',
      'Respect weapon restrictions if specified in room title.',
      'Victory screenshot mandatory for dispute settlement.',
    ],
  },
};

export default function StaffPanel({ user: currentUser, onPageChange }: StaffPanelProps) {
  const { showToast } = useIosFeedback();
  const effectiveRole = getEffectiveRole(
    currentUser || { email: auth.currentUser?.email, id: auth.currentUser?.uid }
  );
  const roleBadge = getRoleBadgeMeta(effectiveRole);

  const [activeTab, setActiveTab] = useState<StaffTab>(StaffTab.ROOM_DISPATCH);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [gameRulesDocs, setGameRulesDocs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [matchSearch, setMatchSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState<
    'need_room' | 'room_ready' | 'live' | 'completed' | 'all'
  >('need_room');
  const [txSearch, setTxSearch] = useState('');
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  const [inlineRoomDrafts, setInlineRoomDrafts] = useState<
    Record<string, { roomId?: string; roomPassword?: string }>
  >({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Declare Room Modal
  const [isDeclareRoomModalOpen, setIsDeclareRoomModalOpen] = useState(false);
  const [selectedDeclareMatch, setSelectedDeclareMatch] = useState<Tournament | null>(null);
  const [declareRoomForm, setDeclareRoomForm] = useState({
    roomId: '',
    roomPassword: '',
    setStatusLive: true,
    sendNotificationOnRoomDeclare: true,
  });

  // Submit / Declare Results Modal
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [selectedMatchResults, setSelectedMatchResults] = useState<Tournament | null>(null);
  const [playerResults, setPlayerResults] = useState<Record<string, number>>({});
  const [playerPositionResults, setPlayerPositionResults] = useState<Record<string, number>>({});

  // Rules Editor
  const [activeRuleTab, setActiveRuleTab] = useState('battle_royale');
  const [ruleList, setRuleList] = useState<string[]>([]);
  const [ruleText, setRuleText] = useState('');
  const [ruleEditMode, setRuleEditMode] = useState<'interactive' | 'raw'>('interactive');
  const [newRuleLine, setNewRuleLine] = useState('');

  useModalBackHandler(isDeclareRoomModalOpen, () => setIsDeclareRoomModalOpen(false));
  useModalBackHandler(isResultModalOpen, () => setIsResultModalOpen(false));

  useEffect(() => {
    const email = currentUser?.email || auth.currentUser?.email;
    const uid = currentUser?.id || auth.currentUser?.uid;
    if (!hasPanelAccess(currentUser || { email, id: uid })) {
      onPageChange(Page.HOME);
      return;
    }

    const unsubMatches = onSnapshot(
      collection(db, 'matches'),
      (snap) => setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tournament))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'matches')
    );

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubTrans = onSnapshot(
      query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(120)),
      (snap) => setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubRules = onSnapshot(
      collection(db, 'gameRules'),
      (snap) => {
        const docsMap: Record<string, any> = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          docsMap[docSnap.id] = {
            id: docSnap.id,
            title: data.title || data.section || data.type || docSnap.id.replace(/_/g, ' '),
            category: data.category || data.title || 'General',
            rules: data.rules || [],
          };
        });
        setGameRulesDocs(docsMap);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'gameRules')
    );

    setLoading(false);
    return () => {
      unsubMatches();
      unsubUsers();
      unsubTrans();
      unsubRules();
    };
  }, [onPageChange, currentUser?.id]);

  const needRoomCount = useMemo(
    () =>
      matches.filter((m) => m.status !== 'completed' && (!m.roomId || m.roomId.trim() === ''))
        .length,
    [matches]
  );
  const readyOrLiveCount = useMemo(
    () =>
      matches.filter(
        (m) => m.status === 'ongoing' || (m.status !== 'completed' && m.roomId?.trim())
      ).length,
    [matches]
  );
  const completedCount = useMemo(
    () => matches.filter((m) => m.status === 'completed').length,
    [matches]
  );
  const totalSlots = useMemo(
    () => matches.reduce((sum, m) => sum + Number(m.playersCount || 0), 0),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    return matches
      .filter((m) => {
        const qMatch =
          m.title.toLowerCase().includes(matchSearch.toLowerCase()) ||
          (m.displayId || '').toLowerCase().includes(matchSearch.toLowerCase()) ||
          (m.map || '').toLowerCase().includes(matchSearch.toLowerCase());
        if (!qMatch) return false;
        const hasRoom = Boolean(m.roomId && m.roomId.trim() !== '');
        if (matchFilter === 'need_room') return m.status !== 'completed' && !hasRoom;
        if (matchFilter === 'room_ready') return m.status !== 'completed' && hasRoom;
        if (matchFilter === 'live') return m.status === 'ongoing';
        if (matchFilter === 'completed') return m.status === 'completed';
        return true;
      })
      .sort((a, b) => Number(b.matchNumber || 0) - Number(a.matchNumber || 0));
  }, [matches, matchSearch, matchFilter]);

  useEffect(() => {
    const fsDoc = gameRulesDocs[activeRuleTab];
    if (fsDoc?.rules?.length > 0) {
      setRuleList(fsDoc.rules);
      setRuleText(fsDoc.rules.join('\n'));
    } else if (RULE_PRESETS[activeRuleTab]) {
      setRuleList(RULE_PRESETS[activeRuleTab].rules);
      setRuleText(RULE_PRESETS[activeRuleTab].rules.join('\n'));
    }
  }, [activeRuleTab, gameRulesDocs]);

  const handleCopy = (val: string, key: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    showToast('Copied to clipboard.', 'success');
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleSaveDeclareRoom = async () => {
    if (!selectedDeclareMatch) return;
    setIsProcessing(true);
    try {
      const cleanId = declareRoomForm.roomId.trim();
      const cleanPass = declareRoomForm.roomPassword.trim();
      const updates: any = {
        roomId: cleanId,
        roomPassword: cleanPass,
        roomDeclaredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (declareRoomForm.setStatusLive && selectedDeclareMatch.status !== 'completed') {
        updates.status = 'ongoing';
      }
      await updateDoc(doc(db, 'matches', selectedDeclareMatch.id), updates);

      if (declareRoomForm.sendNotificationOnRoomDeclare && cleanId) {
        await addDoc(collection(db, 'notifications'), {
          title: `Room Ready: ${selectedDeclareMatch.title}`,
          message: `Room ID: ${cleanId} | Password: ${cleanPass || 'No Password'}. Join now in Free Fire!`,
          type: 'room_creds',
          audience: 'match',
          targetMatchId: selectedDeclareMatch.id,
          targetMatchTitle: selectedDeclareMatch.title,
          actionPage: Page.TOURNAMENTS,
          actionText: 'View Credentials',
          createdAt: serverTimestamp(),
          readBy: [],
        }).catch(() => {});
      }

      setIsDeclareRoomModalOpen(false);
      showToast('Room ID & Password dispatched!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `matches/${selectedDeclareMatch.id}`);
      showToast('Failed to publish room.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitResult = async () => {
    if (!selectedMatchResults?.id) return;
    setIsProcessing(true);
    try {
      const matchId = selectedMatchResults.id;
      const players = selectedMatchResults.players || [];

      const resultsArray = players.map((player) => {
        const key = `${player.userId}_${player.slot}`;
        const score = playerResults[key] || 0;
        let winningAmount = 0;
        if (selectedMatchResults.section === 'Battle Royale') {
          if (selectedMatchResults.prizeType === 'perKill') {
            const rank = playerPositionResults[key] || 0;
            winningAmount =
              score * (selectedMatchResults.perKillAmount || 0) +
              (selectedMatchResults.positionPrizeDistribution?.[rank] || 0);
          } else {
            winningAmount = selectedMatchResults.prizeDistribution?.[score] || 0;
          }
        } else if (score === 1) {
          winningAmount = selectedMatchResults.prizePool || 0;
        }
        return {
          userId: player.userId,
          slot: player.slot,
          username: player.username,
          ign: player.ign,
          rankOrKills: score,
          positionRank: playerPositionResults[key] || null,
          winningAmount,
        };
      });

      if (effectiveRole === 'admin' || effectiveRole === 'co_owner') {
        await runTransaction(db, async (tx) => {
          const userSnaps: { ref: any; snap: any; userId: string; player: any }[] = [];
          for (const p of players) {
            if (!p.userId) continue;
            const uRef = doc(db, 'users', p.userId);
            const snap = await tx.get(uRef);
            userSnaps.push({ ref: uRef, snap, userId: p.userId, player: p });
          }
          for (const { ref: uRef, snap, userId, player } of userSnaps) {
            if (!snap.exists()) continue;
            const res = resultsArray.find(
              (r) => r.userId === userId && r.slot === player.slot
            );
            const winAmt = res?.winningAmount || 0;
            const updates: any = { 'stats.matchesPlayed': increment(1) };
            if (winAmt > 0) {
              updates['wallet.winnings'] = increment(winAmt);
              updates['stats.totalWinnings'] = increment(winAmt);
              if (effectiveRole === 'admin') {
                tx.set(doc(collection(db, 'transactions')), {
                  userId,
                  type: 'win',
                  amount: winAmt,
                  matchId,
                  status: 'completed',
                  title: `WON IN MATCH: ${selectedMatchResults.displayId || '#000'}`,
                  createdAt: serverTimestamp(),
                });
              }
            }
            if (selectedMatchResults.prizeType === 'perKill') {
              updates['stats.totalKills'] = increment(res?.rankOrKills || 0);
            }
            tx.update(uRef, updates);
          }

          tx.set(doc(db, 'matchResults', matchId), {
            matchId,
            matchTitle: selectedMatchResults.title,
            section: selectedMatchResults.section,
            prizeType: selectedMatchResults.prizeType || null,
            results: resultsArray,
            payoutPending: false,
            declaredBy: currentUser?.email || effectiveRole,
            createdAt: serverTimestamp(),
          });
          tx.update(doc(db, 'matches', matchId), { status: 'completed' });
        });
        showToast('Results verified & prizes credited!', 'success');
      } else {
        // Staff cannot directly modify other users' wallets; saves verified scoreboard for payout
        await setDoc(doc(db, 'matchResults', matchId), {
          matchId,
          matchTitle: selectedMatchResults.title,
          section: selectedMatchResults.section,
          prizeType: selectedMatchResults.prizeType || null,
          results: resultsArray,
          payoutPending: true,
          submittedByStaff: currentUser?.email || auth.currentUser?.email || 'staff',
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'matches', matchId), { status: 'completed' });
        showToast('Official scores submitted! Admin will finalize prize payout.', 'success');
      }

      setIsResultModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `matchResults/${selectedMatchResults.id}`);
      showToast('Failed to submit scores.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveRules = async () => {
    const finalRules =
      ruleEditMode === 'raw'
        ? ruleText
            .split('\n')
            .map((r) => r.trim())
            .filter(Boolean)
        : ruleList.map((r) => r.trim()).filter(Boolean);
    if (finalRules.length === 0) {
      showToast('Add at least one rule.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const preset = RULE_PRESETS[activeRuleTab];
      await setDoc(
        doc(db, 'gameRules', activeRuleTab),
        {
          id: activeRuleTab,
          title: preset?.title || activeRuleTab.replace(/_/g, ' '),
          section: preset?.title || activeRuleTab.replace(/_/g, ' '),
          category: preset?.category || 'General',
          rules: finalRules,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      showToast('Rules updated successfully.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `gameRules/${activeRuleTab}`);
      showToast('Could not save rules.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex flex-col items-center justify-center">
        <Loader2 className="text-emerald-600 animate-spin mb-3" size={32} />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Loading Staff Desk...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28">
      {/* Frosted Sticky Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onPageChange(Page.PROFILE)}
              className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 truncate">
                  Staff Desk
                </h1>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${roleBadge.lightPillClass}`}
                >
                  {roleBadge.label}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                Live Room Dispatch, Roster Verification & Support
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(effectiveRole === 'admin' || effectiveRole === 'co_owner') && (
              <div className="hidden sm:flex items-center p-1 bg-slate-200/70 rounded-full">
                {effectiveRole === 'admin' && (
                  <button
                    type="button"
                    onClick={() => onPageChange(Page.ADMIN)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-600 hover:text-slate-900"
                  >
                    Admin
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onPageChange(Page.CO_OWNER)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-600 hover:text-slate-900"
                >
                  Co-Owner
                </button>
                <span className="px-3 py-1.5 rounded-full bg-white text-emerald-700 text-[11px] font-extrabold shadow-xs">
                  Staff
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => onPageChange(Page.CHAT)}
              className="h-10 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100"
            >
              <MessageCircle size={15} />
              <span className="hidden sm:inline">Support Chat</span>
            </button>
          </div>
        </div>

        {/* Mobile Switcher if Admin or Co-Owner */}
        {(effectiveRole === 'admin' || effectiveRole === 'co_owner') && (
          <div className="sm:hidden px-4 pb-2.5 flex items-center gap-1.5">
            {effectiveRole === 'admin' && (
              <button
                type="button"
                onClick={() => onPageChange(Page.ADMIN)}
                className="flex-1 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-bold"
              >
                Admin
              </button>
            )}
            <button
              type="button"
              onClick={() => onPageChange(Page.CO_OWNER)}
              className="flex-1 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-bold"
            >
              Co-Owner
            </button>
            <span className="flex-1 py-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold text-center shadow-xs">
              Staff Desk
            </span>
          </div>
        )}

        {/* Segmented Scroll Tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: StaffTab.ROOM_DISPATCH, label: 'Room Dispatch', icon: Key },
            { id: StaffTab.ALERTS, label: 'Room Alerts', icon: Bell },
            { id: StaffTab.RULES, label: 'Fair Play Rules', icon: ListChecks },
            { id: StaffTab.TRANSACTIONS, label: 'Transactions Lookup', icon: Receipt },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:border-emerald-300'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Operational KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
            <p className="text-[11px] font-bold text-slate-500">Need Room ID</p>
            <p className="text-2xl font-black text-amber-600 tabular-nums mt-1">{needRoomCount}</p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
            <p className="text-[11px] font-bold text-slate-500">Room Ready / Live</p>
            <p className="text-2xl font-black text-[#007AFF] tabular-nums mt-1">
              {readyOrLiveCount}
            </p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
            <p className="text-[11px] font-bold text-slate-500">Completed</p>
            <p className="text-2xl font-black text-emerald-600 tabular-nums mt-1">
              {completedCount}
            </p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
            <p className="text-[11px] font-bold text-slate-500">Total Lobby Slots</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums mt-1">{totalSlots}</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === StaffTab.ROOM_DISPATCH && (
            <motion.div
              key="dispatch"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Search match ID, title, or map..."
                    value={matchSearch}
                    onChange={(e) => setMatchSearch(e.target.value)}
                    className="w-full h-11 bg-white border border-slate-200 rounded-2xl pl-10 pr-4 text-xs font-semibold outline-none focus:border-emerald-500 text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                  className="h-11 px-5 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                >
                  <Plus size={16} /> Create Match
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {[
                  { id: 'need_room', label: `Need Room (${needRoomCount})` },
                  { id: 'room_ready', label: 'Room Ready' },
                  { id: 'live', label: 'Live' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'all', label: 'All' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMatchFilter(f.id as any)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      matchFilter === f.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredMatches.map((m) => {
                  const draft = inlineRoomDrafts[m.id] || {};
                  const draftId = draft.roomId ?? m.roomId ?? '';
                  const draftPass = draft.roomPassword ?? m.roomPassword ?? '';
                  const isRosterOpen = expandedRosterId === m.id;
                  const players = m.players || [];

                  return (
                    <div
                      key={m.id}
                      className="bg-white border border-slate-200/80 rounded-[24px] p-4 sm:p-5 shadow-xs space-y-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#007AFF] text-[10px] font-extrabold tabular-nums">
                              {m.displayId || '#000'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                m.status === 'completed'
                                  ? 'bg-slate-100 text-slate-600'
                                  : m.status === 'ongoing'
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {m.status === 'ongoing' ? 'Live' : m.status || 'Upcoming'}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500">
                              {m.section} • {m.mode}
                            </span>
                          </div>
                          <h4 className="text-sm font-extrabold text-slate-900 line-clamp-1">
                            {m.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {formatMatchTime(m.time)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapIcon size={12} /> {m.map}
                            </span>
                            <span className="tabular-nums font-bold text-slate-700">
                              {m.playersCount || 0}/{m.totalSlots || m.maxPlayers} joined
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRosterId(isRosterOpen ? null : m.id)
                          }
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 shrink-0"
                        >
                          <UsersIcon size={13} />
                          <span>Roster ({players.length})</span>
                        </button>
                      </div>

                      {/* Expandable Lobby Roster for IGN verification */}
                      {isRosterOpen && (
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5 max-h-48 overflow-y-auto">
                          {players.length === 0 ? (
                            <p className="text-xs text-slate-500">No players registered yet.</p>
                          ) : (
                            players.map((p, i) => (
                              <div
                                key={`${p.userId}_${i}`}
                                className="flex items-center justify-between text-xs py-1 border-b border-slate-200/50 last:border-b-0"
                              >
                                <span className="font-bold text-slate-900">
                                  Slot #{p.slot || i + 1} — {p.ign || p.username}
                                </span>
                                <span className="text-[11px] text-slate-500">@{p.username}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* Quick Room ID / Password Dispatch */}
                      <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-200/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1">
                            <Key size={12} /> Quick Room Credentials
                          </span>
                          {m.roomId && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  `Room ID: ${m.roomId} | Pass: ${m.roomPassword || '-'}`,
                                  m.id
                                )
                              }
                              className="text-[11px] font-bold text-emerald-700 flex items-center gap-1"
                            >
                              {copiedKey === m.id ? <Check size={12} /> : <Copy size={12} />} Copy
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="Room ID"
                            value={draftId}
                            onChange={(e) =>
                              setInlineRoomDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...prev[m.id], roomId: e.target.value },
                              }))
                            }
                            className="h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
                          />
                          <input
                            type="text"
                            placeholder="Password"
                            value={draftPass}
                            onChange={(e) =>
                              setInlineRoomDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...prev[m.id], roomPassword: e.target.value },
                              }))
                            }
                            className="h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await updateDoc(doc(db, 'matches', m.id), {
                                roomId: draftId.trim(),
                                roomPassword: draftPass.trim(),
                                updatedAt: serverTimestamp(),
                              });
                              showToast('Room credentials saved.', 'success');
                            }}
                            className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1"
                          >
                            <Save size={13} /> Save
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDeclareMatch(m);
                            setDeclareRoomForm({
                              roomId: m.roomId || '',
                              roomPassword: m.roomPassword || '',
                              setStatusLive: m.status !== 'completed',
                              sendNotificationOnRoomDeclare: true,
                            });
                            setIsDeclareRoomModalOpen(true);
                          }}
                          className="flex-1 min-w-[125px] h-10 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#007AFF] text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <Bell size={13} /> Declare & Notify
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMatchResults(m);
                            setPlayerResults({});
                            setPlayerPositionResults({});
                            setIsResultModalOpen(true);
                          }}
                          className="flex-1 min-w-[125px] h-10 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <Trophy size={13} /> Submit Results
                        </button>
                        <button
                          type="button"
                          onClick={() => onPageChange(Page.ADMIN_EDIT_MATCH, m.id)}
                          className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === StaffTab.ALERTS && (
            <motion.div
              key="alerts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AdminNotificationsTab matches={matches} users={users} onPageChange={onPageChange} />
            </motion.div>
          )}

          {activeTab === StaffTab.RULES && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Fair Play Rules Desk</h3>
                  <p className="text-xs text-slate-500">
                    Update room guidelines shown before match join
                  </p>
                </div>
                <div className="flex p-1 bg-slate-100 rounded-xl self-start">
                  <button
                    type="button"
                    onClick={() => setRuleEditMode('interactive')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold ${
                      ruleEditMode === 'interactive'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleEditMode('raw')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold ${
                      ruleEditMode === 'raw'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Raw
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {Object.entries(RULE_PRESETS).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveRuleTab(k)}
                    className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      activeRuleTab === k
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {v.title}
                  </button>
                ))}
              </div>

              {ruleEditMode === 'interactive' ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {ruleList.map((r, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-start gap-2.5"
                      >
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-extrabold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                          {idx + 1}
                        </span>
                        <p className="flex-1 text-xs font-semibold text-slate-800">{r}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (idx === 0) return;
                              const next = [...ruleList];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              setRuleList(next);
                              setRuleText(next.join('\n'));
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (idx === ruleList.length - 1) return;
                              const next = [...ruleList];
                              [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                              setRuleList(next);
                              setRuleText(next.join('\n'));
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = ruleList.filter((_, i) => i !== idx);
                              setRuleList(next);
                              setRuleText(next.join('\n'));
                            }}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add new rule..."
                      value={newRuleLine}
                      onChange={(e) => setNewRuleLine(e.target.value)}
                      className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold outline-none focus:border-emerald-500 text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newRuleLine.trim()) return;
                        const next = [...ruleList, newRuleLine.trim()];
                        setRuleList(next);
                        setRuleText(next.join('\n'));
                        setNewRuleLine('');
                      }}
                      className="h-11 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <textarea
                  rows={8}
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500"
                />
              )}

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSaveRules}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Save size={15} /> Save Rules
              </button>
            </motion.div>
          )}

          {activeTab === StaffTab.TRANSACTIONS && (
            <motion.div
              key="tx"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Lookup by user ID, type, or match ref..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="w-full h-11 bg-white border border-slate-200 rounded-2xl pl-10 pr-4 text-xs font-semibold outline-none focus:border-emerald-500 text-slate-900"
                />
              </div>

              <div className="bg-white border border-slate-200/80 rounded-[24px] divide-y divide-slate-100 shadow-xs overflow-hidden">
                {transactions
                  .filter(
                    (t) =>
                      (t.title || '').toLowerCase().includes(txSearch.toLowerCase()) ||
                      (t.userId || '').toLowerCase().includes(txSearch.toLowerCase()) ||
                      (t.type || '').toLowerCase().includes(txSearch.toLowerCase())
                  )
                  .slice(0, 50)
                  .map((t) => (
                    <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 truncate">
                          {t.title || t.type?.toUpperCase()}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          UID: {t.userId} • Status: {t.status || 'completed'}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-black tabular-nums shrink-0 ${
                          t.type === 'deposit' || t.type === 'win' || t.type === 'refund'
                            ? 'text-emerald-600'
                            : 'text-slate-900'
                        }`}
                      >
                        ₹{Number(t.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Declare Room Modal */}
      {isDeclareRoomModalOpen && selectedDeclareMatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">
              Dispatch Room — {selectedDeclareMatch.title}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Room ID *</label>
                <input
                  type="text"
                  value={declareRoomForm.roomId}
                  onChange={(e) =>
                    setDeclareRoomForm({ ...declareRoomForm, roomId: e.target.value })
                  }
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Password</label>
                <input
                  type="text"
                  value={declareRoomForm.roomPassword}
                  onChange={(e) =>
                    setDeclareRoomForm({ ...declareRoomForm, roomPassword: e.target.value })
                  }
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={declareRoomForm.sendNotificationOnRoomDeclare}
                  onChange={(e) =>
                    setDeclareRoomForm({
                      ...declareRoomForm,
                      sendNotificationOnRoomDeclare: e.target.checked,
                    })
                  }
                />
                Push instant Room Ready alert to joined players
              </label>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDeclareRoomModalOpen(false)}
                className="flex-1 h-11 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSaveDeclareRoom}
                className="flex-1 h-11 rounded-2xl bg-emerald-600 text-white text-xs font-extrabold"
              >
                Publish & Notify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Results Modal */}
      {isResultModalOpen && selectedMatchResults && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Submit Scores — {selectedMatchResults.displayId}
              </h3>
              {effectiveRole === 'staff' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2 font-semibold">
                  Verified scores are saved directly to match standings; Admin finalizes wallet prize settlement.
                </p>
              )}
            </div>

            {(selectedMatchResults.players || []).length === 0 ? (
              <p className="text-xs text-slate-500">No players joined this match.</p>
            ) : (
              <div className="space-y-2.5">
                {(selectedMatchResults.players || []).map((p) => {
                  const key = `${p.userId}_${p.slot}`;
                  const isPerKill =
                    selectedMatchResults.section === 'Battle Royale' &&
                    selectedMatchResults.prizeType === 'perKill';
                  return (
                    <div
                      key={key}
                      className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 truncate">
                          Slot #{p.slot || '-'} • {p.ign || p.username}
                        </p>
                        <p className="text-[11px] text-slate-500">{p.username}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder={isPerKill ? 'Kills' : 'Rank (1,2..)'}
                          value={playerResults[key] || ''}
                          onChange={(e) =>
                            setPlayerResults((prev) => ({
                              ...prev,
                              [key]: Number(e.target.value),
                            }))
                          }
                          className="w-24 h-9 bg-white border border-slate-200 rounded-xl px-2.5 text-xs font-bold text-slate-900 tabular-nums"
                        />
                        {isPerKill && (selectedMatchResults.positionWinnersCount || 0) > 0 && (
                          <input
                            type="number"
                            min={0}
                            placeholder="Rank"
                            value={playerPositionResults[key] || ''}
                            onChange={(e) =>
                              setPlayerPositionResults((prev) => ({
                                ...prev,
                                [key]: Number(e.target.value),
                              }))
                            }
                            className="w-20 h-9 bg-white border border-slate-200 rounded-xl px-2.5 text-xs font-bold text-slate-900 tabular-nums"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResultModalOpen(false)}
                className="flex-1 h-11 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSubmitResult}
                className="flex-1 h-11 rounded-2xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={15} />
                {isProcessing ? 'Submitting...' : 'Submit Official Result'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
