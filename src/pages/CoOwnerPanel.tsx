import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Shield,
  Users,
  Trophy,
  Plus,
  Trash2,
  Clock,
  Map as MapIcon,
  Users as UsersIcon,
  CheckCircle2,
  Loader2,
  Save,
  Edit2,
  Copy,
  Upload,
  Gamepad2,
  Key,
  Check,
  CheckCheck,
  ListChecks,
  Sparkles,
  PlusCircle,
  ChevronUp,
  ChevronDown,
  Bell,
  TrendingUp,
  Search,
  Crown,
  MessageCircle,
  Image as ImageIcon,
  UserPlus,
} from 'lucide-react';
import { Page, User, UserRole, Tournament, Banner } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  getEffectiveRole,
  getRoleBadgeMeta,
  hasPanelAccess,
  isAdminIdentity,
} from '../constants';
import { formatMatchTime } from '../utils/dateUtils';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';
import AdminNotificationsTab from '../components/AdminNotificationsTab';
import { useIosFeedback } from '../components/IosFeedback';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  runTransaction,
  query,
  orderBy,
  increment,
  setDoc,
} from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface CoOwnerPanelProps {
  user?: User | null;
  onPageChange: (page: Page, id?: string) => void;
}

enum CoOwnerTab {
  OVERVIEW = 'overview',
  MATCHES = 'matches',
  STAFF_TEAM = 'staff_team',
  PLAYERS = 'players',
  MODES_BANNERS = 'modes_banners',
  RULES_ALERTS = 'rules_alerts',
}

const RULE_PRESETS: Record<string, { title: string; category: string; rules: string[] }> = {
  battle_royale: {
    title: 'Battle Royale',
    category: 'Battle Royale',
    rules: [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: Strictly mobile & tablet devices only. Emulators/PC are 100% prohibited.',
      'Registration Name: Enter exact in-game IGN without font errors or unsupported special characters.',
      'Anti-Teaming Rule: Teaming with opponents is strictly prohibited and results in permanent ban.',
      'Hacking & Scripts: Zero-tolerance policy for aimbots, auto-headshots, speed hacks, or modified game files.',
      'Late Entry: Room closes 2 minutes before match start time. Late entry is not entertained.',
      'Screenshot Policy: High-definition final match screenshot is mandatory in case of dispute.',
    ],
  },
  clash_squad: {
    title: 'Clash Squad (4v4 / Duo)',
    category: 'Clash Squad',
    rules: [
      'Level Requirement: Minimum Level 40 in Free Fire account.',
      'Headshot Rate: Clash Squad headshot rate must remain below 70%.',
      'Device Requirements: Mobile & Tablet only. Emulators will be immediately kicked and banned.',
      'Teaming & Sabotage: Teaming or intentional feeding is strictly forbidden.',
      'Screenshot Policy: Winning team captain must submit end-game score screenshot in case of dispute.',
      'Admin Decision: Admin ruling will be final and binding for all participants.',
    ],
  },
  lone_wolf: {
    title: 'Lone Wolf (1v1 / 2v2)',
    category: 'Lone Wolf',
    rules: [
      'Level Requirement: Level 30+ Free Fire profile.',
      'Device Requirements: Mobile / Tablet players only. No PC / Emulators.',
      'Fair Duel: One-on-one duel requires true sportsman spirit without glitch exploiting.',
      'Weapon Restrictions: Respect custom weapon restrictions if specified in room title.',
      'Screenshot Requirement: Final victory screen screenshot mandatory for dispute settlement.',
    ],
  },
  custom_room: {
    title: 'Custom Room / Tournament',
    category: 'Custom Room',
    rules: [
      'All standard esports tournament fairplay rules apply.',
      'Slot Assignment: Players must join ONLY their assigned slot number.',
      'No third-party crosshairs, config files, or GFX tools allowed.',
      'Admin decision is final in all dispute settlements.',
    ],
  },
};

export default function CoOwnerPanel({ user: currentUser, onPageChange }: CoOwnerPanelProps) {
  const { showToast, confirmDialog } = useIosFeedback();
  const effectiveRole = getEffectiveRole(
    currentUser || { email: auth.currentUser?.email, id: auth.currentUser?.uid }
  );
  const roleBadge = getRoleBadgeMeta(effectiveRole);

  const [activeTab, setActiveTab] = useState<CoOwnerTab>(CoOwnerTab.OVERVIEW);
  const [earningPeriod, setEarningPeriod] = useState<'today' | 'all'>('all');
  const [users, setUsers] = useState<User[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<
    { id: string; email: string; role: UserRole; assignedBy?: string }[]
  >([]);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [gameRulesDocs, setGameRulesDocs] = useState<Record<string, any>>({});
  const [gameModesList, setGameModesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Staff Team Form
  const [staffEmailInput, setStaffEmailInput] = useState('');
  const [staffSearchTerm, setStaffSearchTerm] = useState('');

  // Players & Match Filters
  const [playerSearch, setPlayerSearch] = useState('');
  const [matchSearch, setMatchSearch] = useState('');
  const [matchStatusFilter, setMatchStatusFilter] = useState<
    'all' | 'need_room' | 'room_ready' | 'live' | 'completed'
  >('all');
  const [inlineRoomDrafts, setInlineRoomDrafts] = useState<
    Record<string, { roomId?: string; roomPassword?: string }>
  >({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Declare Room Modal
  const [isDeclareRoomModalOpen, setIsDeclareRoomModalOpen] = useState(false);
  const [selectedDeclareRoomMatch, setSelectedDeclareRoomMatch] = useState<Tournament | null>(null);
  const [declareRoomForm, setDeclareRoomForm] = useState({
    roomId: '',
    roomPassword: '',
    setStatusLive: true,
    customNotes: '',
    sendNotificationOnRoomDeclare: true,
  });

  // Declare Result Modal
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [selectedMatchResults, setSelectedMatchResults] = useState<Tournament | null>(null);
  const [playerResults, setPlayerResults] = useState<Record<string, number>>({});
  const [playerPositionResults, setPlayerPositionResults] = useState<Record<string, number>>({});

  // Banner Modal
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [bannerType, setBannerType] = useState<Banner['type']>('main');
  const [bannerOrder, setBannerOrder] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rules Editor State
  const [activeRuleTab, setActiveRuleTab] = useState<string>('battle_royale');
  const [activeSectionTitle, setActiveSectionTitle] = useState<string>('Battle Royale');
  const [activeSectionCategory, setActiveSectionCategory] = useState<string>('Battle Royale');
  const [ruleList, setRuleList] = useState<string[]>([]);
  const [ruleText, setRuleText] = useState('');
  const [ruleEditMode, setRuleEditMode] = useState<'interactive' | 'raw'>('interactive');
  const [newSingleRuleText, setNewSingleRuleText] = useState('');
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [newSectionForm, setNewSectionForm] = useState({
    title: '',
    category: '',
    template: 'battle_royale',
  });

  useModalBackHandler(isDeclareRoomModalOpen, () => setIsDeclareRoomModalOpen(false));
  useModalBackHandler(isResultModalOpen, () => setIsResultModalOpen(false));
  useModalBackHandler(isBannerModalOpen, () => setIsBannerModalOpen(false));
  useModalBackHandler(isAddSectionModalOpen, () => setIsAddSectionModalOpen(false));

  useEffect(() => {
    const email = currentUser?.email || auth.currentUser?.email;
    const uid = currentUser?.id || auth.currentUser?.uid;
    if (!hasPanelAccess(currentUser || { email, id: uid })) {
      onPageChange(Page.HOME);
      return;
    }
    if (effectiveRole === 'staff') {
      onPageChange(Page.STAFF);
      return;
    }

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubRoleInvites = onSnapshot(
      collection(db, 'roleAssignments'),
      (snap) =>
        setRoleAssignments(
          snap.docs.map((d) => ({
            id: d.id,
            email: d.data().email || d.id,
            role: (d.data().role || 'staff') as UserRole,
            assignedBy: d.data().assignedBy,
          }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'roleAssignments')
    );

    const unsubMatches = onSnapshot(
      collection(db, 'matches'),
      (snap) => setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tournament))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'matches')
    );

    const unsubTrans = onSnapshot(
      query(collection(db, 'transactions'), orderBy('createdAt', 'desc')),
      (snap) => setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubBanners = onSnapshot(
      query(collection(db, 'banners'), orderBy('order', 'asc')),
      (snap) => setBanners(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Banner))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    const unsubModes = onSnapshot(
      collection(db, 'gameModes'),
      (snap) => setGameModesList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'gameModes')
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
      unsubUsers();
      unsubRoleInvites();
      unsubMatches();
      unsubTrans();
      unsubBanners();
      unsubModes();
      unsubRules();
    };
  }, [onPageChange, currentUser?.id, effectiveRole]);

  const totalJoinedSlots = useMemo(
    () => matches.reduce((sum, m) => sum + Number(m.playersCount || 0), 0),
    [matches]
  );

  const scheduledMatchPoolValue = useMemo(
    () => matches.reduce((sum, m) => sum + Number(m.entryFee || 0) * Number(m.playersCount || 0), 0),
    [matches]
  );

  const getTxTimestampMs = (tx: any): number | null => {
    if (!tx?.createdAt) return null;
    if (typeof tx.createdAt.toMillis === 'function') return tx.createdAt.toMillis();
    if (typeof tx.createdAt.toDate === 'function') return tx.createdAt.toDate().getTime();
    if (tx.createdAt instanceof Date) return tx.createdAt.getTime();
    const parsed = new Date(tx.createdAt).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  };

  const earningSummary = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let entries = 0;
    let prizes = 0;
    let deposits = 0;
    let refunds = 0;

    transactions.forEach((t) => {
      const status = String(t.status || 'completed').toLowerCase();
      if (status === 'failed' || status === 'rejected' || status === 'cancelled') return;
      if (earningPeriod === 'today') {
        const ms = getTxTimestampMs(t);
        if (!ms || ms < startOfToday) return;
      }
      const amt = Number(t.amount || 0);
      if (t.type === 'entry') entries += amt;
      else if (t.type === 'win') prizes += amt;
      else if (t.type === 'deposit') deposits += amt;
      else if (t.type === 'refund') refunds += amt;
    });

    return {
      entries,
      prizes,
      deposits,
      refunds,
      netMatchEarning: entries - prizes - refunds,
    };
  }, [transactions, earningPeriod]);

  const filteredMatches = useMemo(() => {
    return matches
      .filter((m) => {
        const matchesQuery =
          m.title.toLowerCase().includes(matchSearch.toLowerCase()) ||
          (m.displayId || '').toLowerCase().includes(matchSearch.toLowerCase()) ||
          (m.map || '').toLowerCase().includes(matchSearch.toLowerCase());
        if (!matchesQuery) return false;
        const hasRoom = Boolean(m.roomId && m.roomId.trim() !== '');
        if (matchStatusFilter === 'need_room') return m.status !== 'completed' && !hasRoom;
        if (matchStatusFilter === 'room_ready') return m.status !== 'completed' && hasRoom;
        if (matchStatusFilter === 'live') return m.status === 'ongoing';
        if (matchStatusFilter === 'completed') return m.status === 'completed';
        return true;
      })
      .sort((a, b) => Number(b.matchNumber || 0) - Number(a.matchNumber || 0));
  }, [matches, matchSearch, matchStatusFilter]);

  const handleCopyCredential = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard.', 'success');
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleOpenDeclareRoomModal = (m: Tournament) => {
    setSelectedDeclareRoomMatch(m);
    setDeclareRoomForm({
      roomId: m.roomId || '',
      roomPassword: m.roomPassword || '',
      setStatusLive: m.status !== 'completed',
      customNotes: (m as any).roomNotes || '',
      sendNotificationOnRoomDeclare: true,
    });
    setIsDeclareRoomModalOpen(true);
  };

  const handleSaveDeclareRoom = async () => {
    if (!selectedDeclareRoomMatch) return;
    setIsProcessing(true);
    try {
      const cleanRoomId = declareRoomForm.roomId.trim();
      const cleanPass = declareRoomForm.roomPassword.trim();
      const updates: any = {
        roomId: cleanRoomId,
        roomPassword: cleanPass,
        roomNotes: declareRoomForm.customNotes.trim(),
        roomDeclaredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (declareRoomForm.setStatusLive && selectedDeclareRoomMatch.status !== 'completed') {
        updates.status = 'ongoing';
      }
      await updateDoc(doc(db, 'matches', selectedDeclareRoomMatch.id), updates);

      if (declareRoomForm.sendNotificationOnRoomDeclare && cleanRoomId) {
        await addDoc(collection(db, 'notifications'), {
          title: `Room Ready: ${selectedDeclareRoomMatch.title}`,
          message: `Room ID: ${cleanRoomId} | Password: ${cleanPass || 'No Password'}. Join immediately in Free Fire!`,
          type: 'room_creds',
          audience: 'match',
          targetMatchId: selectedDeclareRoomMatch.id,
          targetMatchTitle: selectedDeclareRoomMatch.title,
          actionPage: Page.TOURNAMENTS,
          actionText: 'View Credentials',
          createdAt: serverTimestamp(),
          readBy: [],
        }).catch(() => {});
      }

      setIsDeclareRoomModalOpen(false);
      setSelectedDeclareRoomMatch(null);
      showToast('Room ID & Password published!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `matches/${selectedDeclareRoomMatch.id}`);
      showToast('Failed to publish room credentials.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteMatch = async (match: Tournament) => {
    const ok = await confirmDialog({
      title: 'Delete Tournament?',
      message:
        match.status !== 'completed' && (match.playersCount || 0) > 0
          ? `Refund ₹${match.entryFee} entry fee to all ${match.playersCount} joined players and delete ${match.title}?`
          : `Delete "${match.title}" permanently?`,
      confirmText: 'Delete Match',
      destructive: true,
    });
    if (!ok) return;

    setIsProcessing(true);
    try {
      await runTransaction(db, async (tx) => {
        const matchRef = doc(db, 'matches', match.id);
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists()) return;
        const matchData = matchSnap.data() as Tournament;
        const players = matchData.players || [];
        const entryFee = Number(matchData.entryFee || 0);

        if (matchData.status !== 'completed' && players.length > 0 && entryFee > 0) {
          for (const player of players) {
            if (!player.userId) continue;
            tx.update(doc(db, 'users', player.userId), { 'wallet.deposit': increment(entryFee) });
            // Per firestore.rules: only isAdmin() may create cross-user transactions docs
            if (effectiveRole === 'admin') {
              const newTransRef = doc(collection(db, 'transactions'));
              tx.set(newTransRef, {
                userId: player.userId,
                type: 'refund',
                amount: entryFee,
                matchId: match.id,
                status: 'completed',
                title: `REFUND: ${matchData.displayId || '#000'}`,
                createdAt: serverTimestamp(),
              });
            }
          }
        }
        tx.delete(matchRef);
      });
      showToast('Match deleted and eligible wallets refunded.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `matches/${match.id}`);
      showToast('Could not delete match.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenDeclareResult = (match: Tournament) => {
    setSelectedMatchResults(match);
    setPlayerResults({});
    setPlayerPositionResults({});
    setIsResultModalOpen(true);
  };

  const handleSubmitResult = async () => {
    if (!selectedMatchResults?.id) return;
    setIsProcessing(true);
    try {
      await runTransaction(db, async (tx) => {
        const matchId = selectedMatchResults.id!;
        const players = selectedMatchResults.players || [];

        const userDocs: { ref: any; snap: any; userId: string; player: any }[] = [];
        for (const player of players) {
          if (!player.userId) continue;
          const userRef = doc(db, 'users', player.userId);
          const snap = await tx.get(userRef);
          userDocs.push({ ref: userRef, snap, userId: player.userId, player });
        }

        for (const { ref: userRef, snap: uSnap, userId, player } of userDocs) {
          if (!uSnap.exists()) continue;
          const playerKey = `${player.userId}_${player.slot}`;
          let winningAmount = 0;

          if (selectedMatchResults.section === 'Battle Royale') {
            if (selectedMatchResults.prizeType === 'perKill') {
              const kills = playerResults[playerKey] || 0;
              const killsWin = kills * (selectedMatchResults.perKillAmount || 0);
              const rank = playerPositionResults[playerKey] || 0;
              const posWin = selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
              winningAmount = killsWin + posWin;
            } else {
              const rank = playerResults[playerKey] || 0;
              winningAmount = selectedMatchResults.prizeDistribution?.[rank] || 0;
            }
          } else {
            const rank = playerResults[playerKey] || 0;
            if (rank === 1) winningAmount = selectedMatchResults.prizePool || 0;
          }

          const updates: any = { 'stats.matchesPlayed': increment(1) };
          if (winningAmount > 0) {
            updates['wallet.winnings'] = increment(winningAmount);
            updates['stats.totalWinnings'] = increment(winningAmount);

            if (effectiveRole === 'admin') {
              const transRef = doc(collection(db, 'transactions'));
              tx.set(transRef, {
                userId,
                type: 'win',
                amount: winningAmount,
                matchId,
                status: 'completed',
                title: `WON IN MATCH: ${selectedMatchResults.displayId || '#000'}`,
                createdAt: serverTimestamp(),
              });
            }
          }
          if (selectedMatchResults.prizeType === 'perKill') {
            updates['stats.totalKills'] = increment(playerResults[playerKey] || 0);
          }
          tx.update(userRef, updates);
        }

        const resultsArray = players.map((player) => {
          const playerKey = `${player.userId}_${player.slot}`;
          const score = playerResults[playerKey] || 0;
          let winningAmount = 0;
          if (selectedMatchResults.section === 'Battle Royale') {
            if (selectedMatchResults.prizeType === 'perKill') {
              const rank = playerPositionResults[playerKey] || 0;
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
            positionRank: playerPositionResults[playerKey] || null,
            winningAmount,
          };
        });

        tx.set(doc(db, 'matchResults', matchId), {
          matchId,
          matchTitle: selectedMatchResults.title,
          section: selectedMatchResults.section,
          prizeType: selectedMatchResults.prizeType || null,
          results: resultsArray,
          declaredBy: currentUser?.email || effectiveRole,
          createdAt: serverTimestamp(),
        });

        tx.update(doc(db, 'matches', matchId), { status: 'completed' });
      });

      setIsResultModalOpen(false);
      showToast('Match results published & winnings credited!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `matches/${selectedMatchResults.id}`);
      showToast('Failed to declare results.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Staff Team Handlers (Co-Owner may only manage 'staff' role!)
  const handleAssignStaff = async () => {
    const cleanEmail = staffEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('Enter a valid email address.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const matchedUser = users.find((u) => (u.email || '').trim().toLowerCase() === cleanEmail);
      await setDoc(doc(db, 'roleAssignments', cleanEmail), {
        email: cleanEmail,
        role: 'staff',
        assignedBy: currentUser?.email || auth.currentUser?.email || 'co_owner',
        updatedAt: serverTimestamp(),
      });
      if (matchedUser?.id && getEffectiveRole(matchedUser) === 'user') {
        await updateDoc(doc(db, 'users', matchedUser.id), {
          role: 'staff',
          isAdmin: false,
        });
        await setDoc(doc(db, 'admins', matchedUser.id), {
          role: 'staff',
          email: cleanEmail,
          updatedAt: serverTimestamp(),
        });
      }
      setStaffEmailInput('');
      showToast(
        matchedUser
          ? `${matchedUser.username} promoted to Staff!`
          : `Staff invite pre-assigned to ${cleanEmail}.`,
        'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'roleAssignments');
      showToast('Failed to assign staff role.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Banner CRUD
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(15);
    try {
      const downloadURL = await uploadOriginalImage(file, (p) => setUploadProgress(p));
      setImageUrl(downloadURL);
      showToast('Banner image ready.', 'success');
    } catch {
      showToast('Image upload failed.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim()) {
      showToast('Provide a banner image or upload one.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const data = {
        imageUrl: imageUrl.trim(),
        redirectUrl: redirectUrl.trim() || null,
        type: bannerType,
        order: Number(bannerOrder) || 0,
        isActive: editingBanner ? editingBanner.isActive : true,
        updatedAt: serverTimestamp(),
      };
      if (editingBanner?.id) {
        await updateDoc(doc(db, 'banners', editingBanner.id), data);
        showToast('Banner updated.', 'success');
      } else {
        await addDoc(collection(db, 'banners'), { ...data, createdAt: serverTimestamp() });
        showToast('Banner published.', 'success');
      }
      setIsBannerModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'banners');
      showToast('Failed to save banner.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Rules sections
  const allRuleSections = useMemo(() => {
    const map: Record<string, { id: string; title: string; category: string; rulesCount: number }> = {};
    Object.keys(RULE_PRESETS).forEach((key) => {
      const p = RULE_PRESETS[key];
      const fsDoc = gameRulesDocs[key];
      map[key] = {
        id: key,
        title: fsDoc?.title || p.title,
        category: fsDoc?.category || p.category,
        rulesCount: fsDoc?.rules?.length ?? p.rules.length,
      };
    });
    gameModesList.forEach((m) => {
      const key = (m.id || m.title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
      if (key && !map[key]) {
        const fsDoc = gameRulesDocs[key];
        map[key] = {
          id: key,
          title: fsDoc?.title || m.title || key,
          category: fsDoc?.category || m.category || 'Custom Mode',
          rulesCount: fsDoc?.rules?.length || 0,
        };
      }
    });
    Object.keys(gameRulesDocs).forEach((key) => {
      const docData = gameRulesDocs[key];
      if (!map[key]) {
        map[key] = {
          id: key,
          title: docData.title || key.replace(/_/g, ' '),
          category: docData.category || 'General',
          rulesCount: docData.rules?.length || 0,
        };
      }
    });
    return Object.values(map);
  }, [gameRulesDocs, gameModesList]);

  useEffect(() => {
    const currentDoc = gameRulesDocs[activeRuleTab];
    if (currentDoc?.rules?.length > 0) {
      setRuleList(currentDoc.rules);
      setRuleText(currentDoc.rules.join('\n'));
      setActiveSectionTitle(currentDoc.title);
      setActiveSectionCategory(currentDoc.category || 'General');
    } else if (RULE_PRESETS[activeRuleTab]) {
      const p = RULE_PRESETS[activeRuleTab];
      setRuleList(p.rules);
      setRuleText(p.rules.join('\n'));
      setActiveSectionTitle(p.title);
      setActiveSectionCategory(p.category);
    } else {
      const fallback = [
        'Mobile & tablet only. No emulators allowed.',
        'Screenshot mandatory for score verification.',
        'Fair play required — zero tolerance for hacks.',
      ];
      setRuleList(fallback);
      setRuleText(fallback.join('\n'));
      setActiveSectionTitle(activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory('General');
    }
  }, [activeRuleTab, gameRulesDocs]);

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
      await setDoc(
        doc(db, 'gameRules', activeRuleTab),
        {
          id: activeRuleTab,
          title: activeSectionTitle.trim() || activeRuleTab,
          section: activeSectionTitle.trim() || activeRuleTab,
          category: activeSectionCategory.trim() || 'General',
          rules: finalRules,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setRuleList(finalRules);
      setRuleText(finalRules.join('\n'));
      showToast(`Saved rules for ${activeSectionTitle}.`, 'success');
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
        <Loader2 className="text-[#007AFF] animate-spin mb-3" size={32} />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Loading Co-Owner Suite...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28">
      {/* Sticky iOS Frosted Header */}
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
                  Co-Owner Panel
                </h1>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${roleBadge.lightPillClass}`}
                >
                  {roleBadge.label}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                Operations, Staff Roster & Arena Control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
              <span className="px-3 py-1.5 rounded-full bg-white text-sky-700 text-[11px] font-extrabold shadow-xs">
                Co-Owner
              </span>
              <button
                type="button"
                onClick={() => onPageChange(Page.STAFF)}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-600 hover:text-slate-900"
              >
                Staff
              </button>
            </div>

            <button
              type="button"
              onClick={() => onPageChange(Page.CHAT)}
              className="h-10 px-3 rounded-full bg-blue-50 border border-blue-200 text-[#007AFF] text-xs font-bold flex items-center gap-1.5 hover:bg-blue-100"
            >
              <MessageCircle size={15} />
              <span className="hidden md:inline">Support Chat</span>
            </button>
          </div>
        </div>

        {/* Mobile Panel Switcher */}
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
          <span className="flex-1 py-1.5 rounded-full bg-sky-600 text-white text-[11px] font-extrabold text-center shadow-xs">
            Co-Owner
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Page.STAFF)}
            className="flex-1 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-bold"
          >
            Staff Desk
          </button>
        </div>

        {/* Segmented Scroll Tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: CoOwnerTab.OVERVIEW, label: 'Overview', icon: Crown },
            { id: CoOwnerTab.MATCHES, label: 'Matches & Rooms', icon: Trophy },
            { id: CoOwnerTab.STAFF_TEAM, label: 'Staff Team', icon: Shield },
            { id: CoOwnerTab.PLAYERS, label: 'Players', icon: Users },
            { id: CoOwnerTab.MODES_BANNERS, label: 'Modes & Banners', icon: ImageIcon },
            { id: CoOwnerTab.RULES_ALERTS, label: 'Rules & Alerts', icon: Bell },
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
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:border-sky-300'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5">
        <AnimatePresence mode="wait">
          {activeTab === CoOwnerTab.OVERVIEW && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* 4 KPI Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500">Total Players</span>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                      <Users size={16} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{users.length}</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500">Tournaments</span>
                    <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                      <Trophy size={16} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{matches.length}</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500">Filled Slots</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <UsersIcon size={16} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{totalJoinedSlots}</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500">Active Pool Value</span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <TrendingUp size={16} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">
                    ₹{scheduledMatchPoolValue.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Financial Pulse Strip */}
              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Earning Count Summary</h3>
                    <p className="text-xs text-slate-500">Live match entries vs prizes & refunds</p>
                  </div>
                  <div className="inline-flex p-1 bg-slate-100 rounded-xl self-start">
                    {(['today', 'all'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEarningPeriod(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                          earningPeriod === p
                            ? 'bg-white text-sky-700 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {p === 'today' ? 'Today' : 'All Time'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200/70">
                    <p className="text-[11px] font-bold text-sky-700">Match Net Earning</p>
                    <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">
                      {earningSummary.netMatchEarning >= 0 ? '+' : '-'}₹
                      {Math.abs(earningSummary.netMatchEarning).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <p className="text-[11px] font-bold text-slate-500">Entry Fees</p>
                    <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">
                      ₹{earningSummary.entries.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <p className="text-[11px] font-bold text-slate-500">Prizes Credited</p>
                    <p className="text-lg font-black text-rose-600 tabular-nums mt-0.5">
                      ₹{earningSummary.prizes.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <p className="text-[11px] font-bold text-slate-500">Deposits Volume</p>
                    <p className="text-lg font-black text-emerald-700 tabular-nums mt-0.5">
                      ₹{earningSummary.deposits.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Co-Owner Shortcuts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                  className="p-5 rounded-[22px] bg-[#007AFF] hover:bg-[#0066D6] text-white text-left space-y-2 shadow-sm active:scale-[0.98] transition-all"
                >
                  <Plus size={22} />
                  <p className="text-sm font-extrabold">Create Tournament</p>
                  <p className="text-xs text-blue-100">Publish new Free Fire lobby</p>
                </button>

                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN_MODES)}
                  className="p-5 rounded-[22px] bg-white border border-slate-200/80 hover:border-sky-300 text-left space-y-2 shadow-xs active:scale-[0.98] transition-all"
                >
                  <Gamepad2 size={22} className="text-sky-600" />
                  <p className="text-sm font-extrabold text-slate-900">Manage Game Modes</p>
                  <p className="text-xs text-slate-500">Edit BR, Clash Squad & Lone Wolf</p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab(CoOwnerTab.STAFF_TEAM)}
                  className="p-5 rounded-[22px] bg-white border border-slate-200/80 hover:border-emerald-300 text-left space-y-2 shadow-xs active:scale-[0.98] transition-all"
                >
                  <UserPlus size={22} className="text-emerald-600" />
                  <p className="text-sm font-extrabold text-slate-900">Manage Staff Team</p>
                  <p className="text-xs text-slate-500">Invite or revoke Staff members</p>
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === CoOwnerTab.MATCHES && (
            <motion.div
              key="matches"
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
                    className="w-full h-11 bg-white border border-slate-200 rounded-2xl pl-10 pr-4 text-xs font-semibold outline-none focus:border-[#007AFF] text-slate-900"
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
                  { id: 'all', label: 'All' },
                  { id: 'need_room', label: 'Need Room' },
                  { id: 'room_ready', label: 'Room Ready' },
                  { id: 'live', label: 'Live' },
                  { id: 'completed', label: 'Completed' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMatchStatusFilter(f.id as any)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      matchStatusFilter === f.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredMatches.map((m) => {
                  const hasRoom = Boolean(m.roomId && m.roomId.trim() !== '');
                  const draft = inlineRoomDrafts[m.id] || {};
                  const draftRoomId = draft.roomId ?? m.roomId ?? '';
                  const draftPass = draft.roomPassword ?? m.roomPassword ?? '';

                  return (
                    <div
                      key={m.id}
                      className="bg-white border border-slate-200/80 rounded-[24px] p-4 sm:p-5 shadow-xs space-y-4"
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
                                  : 'bg-emerald-50 text-emerald-700'
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
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-medium mt-1">
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {formatMatchTime(m.time)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapIcon size={12} /> {m.map}
                            </span>
                            <span className="tabular-nums font-bold text-slate-700">
                              {m.playersCount || 0}/{m.totalSlots || m.maxPlayers} slots
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-slate-400">Entry / Prize</p>
                          <p className="text-sm font-black text-slate-900 tabular-nums">
                            ₹{m.entryFee} / {m.prize}
                          </p>
                        </div>
                      </div>

                      {/* Inline Room Credentials Bar */}
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                            <Key size={12} className="text-[#007AFF]" /> Custom Room Credentials
                          </span>
                          {hasRoom && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyCredential(
                                  `Room ID: ${m.roomId} | Pass: ${m.roomPassword || '-'}`,
                                  m.id
                                )
                              }
                              className="text-[11px] font-bold text-[#007AFF] flex items-center gap-1"
                            >
                              {copiedKey === m.id ? <Check size={12} /> : <Copy size={12} />}
                              Copy
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="Room ID"
                            value={draftRoomId}
                            onChange={(e) =>
                              setInlineRoomDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...prev[m.id], roomId: e.target.value },
                              }))
                            }
                            className="h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF]"
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
                            className="h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF]"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await updateDoc(doc(db, 'matches', m.id), {
                                roomId: draftRoomId.trim(),
                                roomPassword: draftPass.trim(),
                                updatedAt: serverTimestamp(),
                              });
                              showToast('Room credentials saved.', 'success');
                            }}
                            className="h-10 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-extrabold flex items-center justify-center gap-1"
                          >
                            <Save size={13} /> Save
                          </button>
                        </div>
                      </div>

                      {/* Match Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleOpenDeclareRoomModal(m)}
                          className="flex-1 min-w-[120px] h-10 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#007AFF] text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <Key size={13} /> Declare & Notify
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeclareResult(m)}
                          className="flex-1 min-w-[120px] h-10 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <Trophy size={13} /> Declare Result
                        </button>
                        <button
                          type="button"
                          onClick={() => onPageChange(Page.ADMIN_EDIT_MATCH, m.id)}
                          className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH, m.id)}
                          className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
                        >
                          <Copy size={13} /> Clone
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMatch(m)}
                          className="h-10 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === CoOwnerTab.STAFF_TEAM && (
            <motion.div
              key="staff_team"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Invite or Add Staff</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    As Co-Owner, you can recruit Staff moderators for room hosting and rules management.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="email"
                    placeholder="Enter staff member email (e.g. mod@gmail.com)"
                    value={staffEmailInput}
                    onChange={(e) => setStaffEmailInput(e.target.value)}
                    className="flex-1 h-12 bg-slate-50 border border-slate-200 focus:border-[#007AFF] focus:bg-white rounded-2xl px-4 text-sm font-semibold outline-none text-slate-900"
                  />
                  <button
                    type="button"
                    disabled={isProcessing || !staffEmailInput.trim()}
                    onClick={handleAssignStaff}
                    className="h-12 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold uppercase tracking-wider disabled:opacity-40 shrink-0"
                  >
                    + Assign Staff
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
                  Leadership & Staff Directory
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {users
                    .filter((u) => getEffectiveRole(u) !== 'user')
                    .map((u) => {
                      const uRole = getEffectiveRole(u);
                      const badge = getRoleBadgeMeta(uRole);
                      const canRevoke =
                        uRole === 'staff' && !isAdminIdentity(u.email, u.id);
                      return (
                        <div
                          key={u.id}
                          className="p-4 bg-white border border-slate-200/80 rounded-[22px] flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-extrabold text-slate-900 truncate">
                                {u.username}
                              </p>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badge.lightPillClass}`}
                              >
                                {badge.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{u.email}</p>
                          </div>
                          {canRevoke && u.id && (
                            <button
                              type="button"
                              onClick={async () => {
                                await updateDoc(doc(db, 'users', u.id!), {
                                  role: 'user',
                                  isAdmin: false,
                                });
                                await deleteDoc(doc(db, 'admins', u.id!)).catch(() => {});
                                if (u.email) {
                                  await deleteDoc(
                                    doc(db, 'roleAssignments', u.email.trim().toLowerCase())
                                  ).catch(() => {});
                                }
                                showToast(`${u.username} removed from Staff.`, 'info');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-xs font-bold shrink-0"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {roleAssignments.filter((ra) => ra.role === 'staff').length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
                    Pending Staff Invites
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {roleAssignments
                      .filter((ra) => ra.role === 'staff')
                      .map((ra) => (
                        <div
                          key={ra.id}
                          className="p-3.5 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between gap-2 shadow-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold">
                              STAFF
                            </span>
                            <span className="text-xs font-semibold text-slate-700 truncate">
                              {ra.email}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteDoc(doc(db, 'roleAssignments', ra.id));
                              showToast('Staff invite deleted.', 'info');
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Quick Promote Player */}
              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Quick Promote Registered Player to Staff
                </h4>
                <input
                  type="text"
                  placeholder="Search player username or email..."
                  value={staffSearchTerm}
                  onChange={(e) => setStaffSearchTerm(e.target.value)}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {users
                    .filter((u) => getEffectiveRole(u) === 'user')
                    .filter(
                      (u) =>
                        u.username.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
                        (u.email || '').toLowerCase().includes(staffSearchTerm.toLowerCase())
                    )
                    .slice(0, 8)
                    .map((u) => (
                      <div
                        key={u.id}
                        className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-900 truncate">
                            {u.username}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!u.id) return;
                            await updateDoc(doc(db, 'users', u.id), {
                              role: 'staff',
                              isAdmin: false,
                            });
                            await setDoc(doc(db, 'admins', u.id), {
                              role: 'staff',
                              email: (u.email || '').toLowerCase(),
                              updatedAt: serverTimestamp(),
                            });
                            showToast(`${u.username} promoted to Staff!`, 'success');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold uppercase shrink-0"
                        >
                          + Staff
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === CoOwnerTab.PLAYERS && (
            <motion.div
              key="players"
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
                  placeholder="Search player username, email, or phone..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="w-full h-11 bg-white border border-slate-200 rounded-2xl pl-10 pr-4 text-xs font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {users
                  .filter(
                    (u) =>
                      u.username.toLowerCase().includes(playerSearch.toLowerCase()) ||
                      (u.email || '').toLowerCase().includes(playerSearch.toLowerCase()) ||
                      (u.phone || '').includes(playerSearch)
                  )
                  .map((u) => {
                    const totalBalance =
                      (u.wallet?.deposit || 0) + (u.wallet?.winnings || 0) + (u.wallet?.bonus || 0);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, u.id)}
                        className="p-4 bg-white border border-slate-200/80 hover:border-[#007AFF] rounded-[22px] text-left flex items-center justify-between gap-3 shadow-xs transition-all"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-extrabold text-slate-900 truncate">
                              {u.username}
                            </p>
                            {u.isBanned && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-extrabold uppercase">
                                Banned
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{u.email}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-black text-[#007AFF] tabular-nums">
                            ₹{totalBalance}
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold">Inspect →</p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {activeTab === CoOwnerTab.MODES_BANNERS && (
            <motion.div
              key="modes_banners"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Game Modes Library</h3>
                  <p className="text-xs text-slate-500">
                    Configure Battle Royale, Clash Squad & Lone Wolf mode cards
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN_MODES)}
                  className="h-11 px-5 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-extrabold flex items-center justify-center gap-2 shrink-0"
                >
                  <Gamepad2 size={16} /> Open Game Modes Studio
                </button>
              </div>

              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
                  Promotional Banners ({banners.length})
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setEditingBanner(null);
                    setImageUrl('');
                    setRedirectUrl('');
                    setBannerType('main');
                    setBannerOrder(banners.length);
                    setIsBannerModalOpen(true);
                  }}
                  className="h-10 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-extrabold flex items-center gap-1.5"
                >
                  <Plus size={15} /> Add Banner
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {banners.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white border border-slate-200/80 rounded-[22px] overflow-hidden shadow-xs"
                  >
                    <div className="aspect-[16/9] bg-slate-100 relative">
                      <SafeImage
                        src={b.imageUrl}
                        alt="Banner"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-slate-900 text-[10px] font-extrabold uppercase shadow-xs">
                        {b.type} • #{b.order}
                      </span>
                    </div>
                    <div className="p-3.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!b.id) return;
                          await updateDoc(doc(db, 'banners', b.id), { isActive: !b.isActive });
                          showToast(b.isActive ? 'Banner hidden.' : 'Banner activated.', 'info');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                          b.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {b.isActive ? 'Active' : 'Hidden'}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBanner(b);
                            setImageUrl(b.imageUrl);
                            setRedirectUrl(b.redirectUrl || '');
                            setBannerType(b.type);
                            setBannerOrder(b.order || 0);
                            setIsBannerModalOpen(true);
                          }}
                          className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!b.id) return;
                            await deleteDoc(doc(db, 'banners', b.id));
                            showToast('Banner deleted.', 'info');
                          }}
                          className="h-9 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === CoOwnerTab.RULES_ALERTS && (
            <motion.div
              key="rules_alerts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <AdminNotificationsTab matches={matches} users={users} onPageChange={onPageChange} />

              {/* Rules Editor */}
              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Tournament Rules & Fairplay Editor
                    </h3>
                    <p className="text-xs text-slate-500">
                      Manage live rules displayed inside Match Details
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddSectionModalOpen(true)}
                      className="h-9 px-3.5 rounded-xl bg-blue-50 text-[#007AFF] border border-blue-200 text-xs font-bold flex items-center gap-1"
                    >
                      <PlusCircle size={14} /> Add Section
                    </button>
                    <div className="flex p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setRuleEditMode('interactive')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold ${
                          ruleEditMode === 'interactive'
                            ? 'bg-white text-[#007AFF] shadow-xs'
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
                            ? 'bg-white text-[#007AFF] shadow-xs'
                            : 'text-slate-500'
                        }`}
                      >
                        Raw
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {allRuleSections.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setActiveRuleTab(sec.id)}
                      className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                        activeRuleTab === sec.id
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {sec.title} ({sec.rulesCount})
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
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-[#007AFF] text-[11px] font-extrabold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                            {idx + 1}
                          </span>
                          <p className="flex-1 text-xs font-semibold text-slate-800 leading-relaxed">
                            {r}
                          </p>
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
                        placeholder="Add new rule line..."
                        value={newSingleRuleText}
                        onChange={(e) => setNewSingleRuleText(e.target.value)}
                        className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newSingleRuleText.trim()) return;
                          const next = [...ruleList, newSingleRuleText.trim()];
                          setRuleList(next);
                          setRuleText(next.join('\n'));
                          setNewSingleRuleText('');
                        }}
                        className="h-11 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0"
                      >
                        Add Line
                      </button>
                    </div>
                  </div>
                ) : (
                  <textarea
                    rows={8}
                    value={ruleText}
                    onChange={(e) => setRuleText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 outline-none focus:border-[#007AFF]"
                    placeholder="Enter one rule per line..."
                  />
                )}

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleSaveRules}
                  className="w-full h-12 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <Save size={15} /> Save {activeSectionTitle} Rules
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Declare Room Modal */}
      {isDeclareRoomModalOpen && selectedDeclareRoomMatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">
              Publish Room — {selectedDeclareRoomMatch.title}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Room ID *</label>
                <input
                  type="text"
                  value={declareRoomForm.roomId}
                  onChange={(e) => setDeclareRoomForm({ ...declareRoomForm, roomId: e.target.value })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#007AFF]"
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
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#007AFF]"
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
                Push instant Room Ready notification to players
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
                className="flex-1 h-11 rounded-2xl bg-[#007AFF] text-white text-xs font-extrabold"
              >
                Publish Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Declare Result Modal */}
      {isResultModalOpen && selectedMatchResults && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">
              Declare Match Results — {selectedMatchResults.displayId}
            </h3>
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
                            setPlayerResults((prev) => ({ ...prev, [key]: Number(e.target.value) }))
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
                className="flex-1 h-11 rounded-2xl bg-emerald-600 text-white text-xs font-extrabold"
              >
                {isProcessing ? 'Saving...' : 'Submit & Credit Prizes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner Modal */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveBanner}
            className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              {editingBanner ? 'Edit Banner' : 'Add Promotional Banner'}
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Banner Image URL or upload..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-11 px-4 rounded-xl bg-blue-50 text-[#007AFF] border border-blue-200 text-xs font-bold flex items-center gap-1"
                >
                  <Upload size={14} /> Upload
                </button>
              </div>
              {isUploading && (
                <p className="text-[11px] font-bold text-[#007AFF]">
                  Uploading... {Math.round(uploadProgress)}%
                </p>
              )}
              <select
                value={bannerType}
                onChange={(e) => setBannerType(e.target.value as any)}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900"
              >
                <option value="main">Main Carousel</option>
                <option value="offer">Offer Spotlight</option>
                <option value="freefire">Free Fire Arena</option>
              </select>
              <input
                type="number"
                placeholder="Display Order (0, 1, 2...)"
                value={bannerOrder}
                onChange={(e) => setBannerOrder(Number(e.target.value))}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900 tabular-nums"
              />
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setIsBannerModalOpen(false)}
                className="flex-1 h-11 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="flex-1 h-11 rounded-2xl bg-[#007AFF] text-white text-xs font-extrabold"
              >
                Save Banner
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Rule Section Modal */}
      {isAddSectionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Create Rule Section</h3>
            <input
              type="text"
              placeholder="Section Title (e.g. Bermuda Clash)"
              value={newSectionForm.title}
              onChange={(e) => setNewSectionForm({ ...newSectionForm, title: e.target.value })}
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
            />
            <select
              value={newSectionForm.template}
              onChange={(e) => setNewSectionForm({ ...newSectionForm, template: e.target.value })}
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900"
            >
              {Object.entries(RULE_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  Starter Template: {v.title}
                </option>
              ))}
            </select>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setIsAddSectionModalOpen(false)}
                className="flex-1 h-11 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNewSectionSubmit}
                className="flex-1 h-11 rounded-2xl bg-[#007AFF] text-white text-xs font-extrabold"
              >
                Create Section
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function handleAddNewSectionSubmit() {
    const cleanId = newSectionForm.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    if (!cleanId) {
      showToast('Enter a valid section title.', 'error');
      return;
    }
    const starter = RULE_PRESETS[newSectionForm.template] || RULE_PRESETS.battle_royale;
    await setDoc(
      doc(db, 'gameRules', cleanId),
      {
        id: cleanId,
        title: newSectionForm.title.trim(),
        section: newSectionForm.title.trim(),
        category: newSectionForm.category.trim() || newSectionForm.title.trim(),
        rules: [...starter.rules],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setActiveRuleTab(cleanId);
    setIsAddSectionModalOpen(false);
    setNewSectionForm({ title: '', category: '', template: 'battle_royale' });
    showToast('Rule section created.', 'success');
  }
}
