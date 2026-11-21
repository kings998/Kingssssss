import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Shield,
  Users,
  Trophy,
  DollarSign,
  Settings,
  Search,
  Ban,
  Unlock,
  Plus,
  Minus,
  Trash2,
  Clock,
  Map as MapIcon,
  Users as UsersIcon,
  CheckCircle2,
  Loader2,
  Save,
  RefreshCw,
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
  ArrowUpRight,
  Coins,
  BarChart3,
  Crown,
  MessageCircle,
} from 'lucide-react';
import { Page, User, UserRole, Tournament, Banner, PaymentGateway } from '../types';
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
  writeBatch,
  query,
  orderBy,
  increment,
  setDoc,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface AdminPageProps {
  user?: User | null;
  onPageChange: (page: Page, id?: string) => void;
}

enum AdminTab {
  DASHBOARD = 'dashboard',
  MATCHES = 'matches',
  STAFF = 'staff',
  USERS = 'users',
  TRANSACTIONS = 'transactions',
  NOTIFICATIONS = 'notifications',
  RULES = 'rules',
  BANNERS = 'banners',
  MODES = 'modes',
  REFERRAL = 'referral',
  PAYMENT = 'payment',
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
      'Screenshot Policy: In case of ranking/kill dispute, high-definition final match screenshot is mandatory.',
      'Match Result Policy: Scores will be verified by the admin team post-match before prize distribution.',
      'Cancellation & Refund Policy: If a match is cancelled by admin, 100% of entry fee is refunded back to wallet instantly.',
    ],
  },
  clash_squad: {
    title: 'Clash Squad (4v4 / Duo)',
    category: 'Clash Squad',
    rules: [
      'Level Requirement: Minimum Level 40 in Free Fire account.',
      'Headshot Rate: Clash Squad headshot rate must remain below 70%.',
      'Device Requirements: Mobile & Tablet only. Emulators will be immediately kicked and banned.',
      'Gun Attributes: Gun attributes and character skill settings will be as per custom room setup.',
      'Grenades & Items: Usage of limited tactical items will follow room preset rules.',
      'Teaming & Sabotage: Teaming or intentional feeding is strictly forbidden.',
      'Screenshot Policy: Winning team captain must submit end-game score screenshot in case of dispute.',
      'Prize Distribution: Winnings will be credited automatically to winning player/team wallets post verification.',
      'Admin Decision: Admin ruling will be final and binding for all participants.',
    ],
  },
  lone_wolf: {
    title: 'Lone Wolf (1v1 / 2v2)',
    category: 'Lone Wolf',
    rules: [
      'Level Requirement: Level 30+ Free Fire profile.',
      'Headshot Rate: Lone Wolf headshot rate maximum 75%.',
      'Device Requirements: Mobile / Tablet players only. No PC / Emulators.',
      'Fair Duel: One-on-one duel requires true sportsman spirit without glitch exploiting.',
      'Weapon Restrictions: Respect custom weapon restrictions if specified in room title (e.g. M1887 only, Sniper only).',
      'Disconnect Policy: If a player disconnects mid-round, rematch will only be granted if admin verifies technical glitch.',
      'Screenshot Requirement: Final victory screen screenshot mandatory for dispute settlement.',
      'Instant Payout: Winnings credited within 10-15 minutes after match confirmation.',
    ],
  },
  custom_room: {
    title: 'Custom Room / Tournament',
    category: 'Custom Room',
    rules: [
      'All standard esports tournament fairplay rules apply.',
      'Slot Assignment: Players must join ONLY their assigned slot number. Wrong slot leads to kick without refund.',
      'Room Settings: Custom room parameters (Ammo, Fall Damage, Character Skills) are set as specified in match title.',
      'No third-party crosshairs, config files, or GFX tools allowed.',
      'Admin decision is final in all dispute settlements.',
    ],
  },
  sniper_only: {
    title: 'Sniper Only Challenge',
    category: 'Sniper Only',
    rules: [
      'Only Sniper Rifles (AWM, Kar98k, M82B, Barrett) are permitted for combat.',
      'Using pistols, melee, or AR/SMG weapons will result in immediate disqualification with 0 points.',
      'No emulator or modified script allowed.',
      'Final kill feed and damage screenshot must be submitted.',
    ],
  },
  four_v_four: {
    title: '4v4 Clash Duel',
    category: '4v4 Clash',
    rules: [
      'Full squad (4 players) must be ready before room launch time.',
      'All 4 players must have registered with valid IGNs.',
      'No roof camping or out-of-bounds wall glitching.',
      'First team to win the required round count wins the contest.',
    ],
  },
  one_v_one: {
    title: '1v1 Duel Arena',
    category: '1v1 Duel',
    rules: [
      'Pure 1v1 head-to-head showdown on chosen map.',
      'Gun selection rules as specified in room rules (e.g. Desert Eagle only or Shotgun only).',
      'No wall-trapping or infinite gloo wall glitch.',
      'Proof screenshot required for claiming bounty prize.',
    ],
  },
};

export default function AdminPage({ user: currentUser, onPageChange }: AdminPageProps) {
  const { showToast, confirmDialog } = useIosFeedback();
  const effectiveRole = getEffectiveRole(
    currentUser || { email: auth.currentUser?.email, id: auth.currentUser?.uid }
  );
  const roleBadge = getRoleBadgeMeta(effectiveRole);

  const visibleTabs: AdminTab[] =
    effectiveRole === 'admin'
      ? Object.values(AdminTab)
      : effectiveRole === 'co_owner'
      ? [
          AdminTab.DASHBOARD,
          AdminTab.MATCHES,
          AdminTab.STAFF,
          AdminTab.USERS,
          AdminTab.NOTIFICATIONS,
          AdminTab.RULES,
          AdminTab.BANNERS,
          AdminTab.MODES,
        ]
      : [AdminTab.DASHBOARD, AdminTab.MATCHES, AdminTab.NOTIFICATIONS, AdminTab.RULES];

  const [activeTab, setActiveTab] = useState<AdminTab>(AdminTab.DASHBOARD);
  const [earningPeriod, setEarningPeriod] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [users, setUsers] = useState<User[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<
    { id: string; email: string; role: UserRole; assignedBy?: string }[]
  >([]);
  const [staffEmailInput, setStaffEmailInput] = useState('');
  const [staffRoleInput, setStaffRoleInput] = useState<UserRole>('staff');
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [staffFeedback, setStaffFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<{
    isOpen: boolean;
    matchId: string;
  }>({ isOpen: false, matchId: '' });
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [selectedMatchResults, setSelectedMatchResults] = useState<Tournament | null>(null);
  const [playerResults, setPlayerResults] = useState<Record<string, number>>({});
  const [playerPositionResults, setPlayerPositionResults] = useState<Record<string, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Quick inline room credential drafts keyed by match id
  const [inlineRoomDrafts, setInlineRoomDrafts] = useState<
    Record<string, { roomId?: string; roomPassword?: string }>
  >({});

  // Dynamic Rules State
  const [gameRulesDocs, setGameRulesDocs] = useState<
    Record<
      string,
      {
        id: string;
        title: string;
        category?: string;
        section?: string;
        rules: string[];
        updatedAt?: any;
      }
    >
  >({});
  const [gameModesList, setGameModesList] = useState<any[]>([]);
  const [activeRuleTab, setActiveRuleTab] = useState<string>('battle_royale');
  const [activeSectionTitle, setActiveSectionTitle] = useState<string>('Battle Royale');
  const [activeSectionCategory, setActiveSectionCategory] = useState<string>('Battle Royale');
  const [ruleText, setRuleText] = useState('');
  const [ruleList, setRuleList] = useState<string[]>([]);
  const [ruleEditMode, setRuleEditMode] = useState<'interactive' | 'raw'>('interactive');
  const [newSingleRuleText, setNewSingleRuleText] = useState('');
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [newSectionForm, setNewSectionForm] = useState({
    title: '',
    category: '',
    template: 'battle_royale',
  });

  // Room ID & Password Modal State
  const [isDeclareRoomModalOpen, setIsDeclareRoomModalOpen] = useState(false);
  const [selectedDeclareRoomMatch, setSelectedDeclareRoomMatch] = useState<Tournament | null>(
    null
  );
  const [declareRoomForm, setDeclareRoomForm] = useState({
    roomId: '',
    roomPassword: '',
    setStatusLive: true,
    customNotes: '',
    sendNotificationOnRoomDeclare: true,
  });
  const [matchStatusFilter, setMatchStatusFilter] = useState<
    'all' | 'need_room' | 'room_ready' | 'live' | 'completed'
  >('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<any>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [bannerType, setBannerType] = useState<Banner['type']>('main');
  const [bannerOrder, setBannerOrder] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [gatewayForm, setGatewayForm] = useState({
    name: '',
    apiKey: '',
    secretKey: '',
    merchantId: '',
    webhookSecret: '',
    upiId: '',
  });

  useModalBackHandler(isDeleteConfirmOpen.isOpen, () =>
    setIsDeleteConfirmOpen({ isOpen: false, matchId: '' })
  );
  useModalBackHandler(isResultModalOpen, () => setIsResultModalOpen(false));
  useModalBackHandler(isBannerModalOpen, () => setIsBannerModalOpen(false));
  useModalBackHandler(isDeclareRoomModalOpen, () => setIsDeclareRoomModalOpen(false));
  useModalBackHandler(isAddSectionModalOpen, () => setIsAddSectionModalOpen(false));
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const downloadURL = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setImageUrl(downloadURL);
      setUploadProgress(100);
      showToast('Banner image uploaded.', 'success');
    } catch (error: any) {
      console.error('Upload Process Error:', error);
      showToast('Upload failed, please try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const email = currentUser?.email || auth.currentUser?.email;
    const uid = currentUser?.id || auth.currentUser?.uid;
    const isAllowed = hasPanelAccess(currentUser || { email, id: uid });

    if (!isAllowed) {
      onPageChange(Page.HOME);
      return;
    }

    if (effectiveRole === 'co_owner') {
      onPageChange(Page.CO_OWNER);
      return;
    }
    if (effectiveRole === 'staff') {
      onPageChange(Page.STAFF);
      return;
    }

    const canViewUsers = effectiveRole === 'admin';
    const canViewTrans = effectiveRole === 'admin';
    const canViewSettings = effectiveRole === 'admin';
    const canViewGateways = effectiveRole === 'admin';

    const unsubUsers = canViewUsers
      ? onSnapshot(
          collection(db, 'users'),
          (snapshot) => {
            setUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as User)));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      : () => {};

    const unsubRoleInvites = canViewUsers
      ? onSnapshot(
          collection(db, 'roleAssignments'),
          (snapshot) => {
            setRoleAssignments(
              snapshot.docs.map((d) => ({
                id: d.id,
                email: d.data().email || d.id,
                role: (d.data().role || 'staff') as UserRole,
                assignedBy: d.data().assignedBy,
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'roleAssignments')
        )
      : () => {};

    const unsubMatches = onSnapshot(
      collection(db, 'matches'),
      (snapshot) => {
        setMatches(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Tournament)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'matches')
    );

    const unsubTrans = canViewTrans
      ? onSnapshot(
          query(collection(db, 'transactions'), orderBy('createdAt', 'desc')),
          (snapshot) => {
            setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
        )
      : () => {};

    const unsubRules = onSnapshot(
      collection(db, 'gameRules'),
      (snapshot) => {
        const docsMap: Record<string, any> = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          docsMap[docSnap.id] = {
            id: docSnap.id,
            title: data.title || data.section || data.type || docSnap.id.replace(/_/g, ' '),
            category: data.category || data.title || 'General',
            section: data.section || data.title || docSnap.id,
            rules: data.rules || [],
            updatedAt: data.updatedAt,
          };
        });
        setGameRulesDocs(docsMap);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'gameRules')
    );

    const unsubModes = onSnapshot(
      collection(db, 'gameModes'),
      (snapshot) => {
        setGameModesList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'gameModes')
    );

    const unsubSettings = canViewSettings
      ? onSnapshot(
          doc(db, 'appSettings', 'referral_support'),
          (snapshot) => {
            if (snapshot.exists()) {
              setAppSettings(snapshot.data());
            }
          },
          (err) => handleFirestoreError(err, OperationType.GET, 'appSettings/referral_support')
        )
      : () => {};

    const unsubBanners = onSnapshot(
      query(collection(db, 'banners'), orderBy('order', 'asc')),
      (snapshot) => {
        setBanners(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Banner)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    const unsubGateways = canViewGateways
      ? onSnapshot(
          collection(db, 'paymentSettings'),
          (snapshot) => {
            setPaymentGateways(
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentGateway))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'paymentSettings')
        )
      : () => {};

    setLoading(false);
    return () => {
      unsubUsers();
      unsubRoleInvites();
      unsubMatches();
      unsubTrans();
      unsubRules();
      unsubModes();
      unsubSettings();
      unsubBanners();
      unsubGateways();
    };
  }, [onPageChange, currentUser?.id, currentUser?.role, effectiveRole]);

  const totalUsers = users.length;
  const totalMatches = matches.length;
  const totalJoinedPlayers = matches.reduce((acc, m) => acc + (m.playersCount || 0), 0);

  const getTxTimestampMs = (tx: any): number | null => {
    if (!tx?.createdAt) return null;
    if (typeof tx.createdAt.toMillis === 'function') return tx.createdAt.toMillis();
    if (typeof tx.createdAt.toDate === 'function') return tx.createdAt.toDate().getTime();
    if (tx.createdAt instanceof Date) return tx.createdAt.getTime();
    const parsed = new Date(tx.createdAt).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  };

  const computeEarningsForWindow = (period: 'today' | '7d' | '30d' | 'all') => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const cutoffMs =
      period === 'today'
        ? startOfToday
        : period === '7d'
        ? now.getTime() - 7 * 24 * 60 * 60 * 1000
        : period === '30d'
        ? now.getTime() - 30 * 24 * 60 * 60 * 1000
        : 0;

    let deposits = 0;
    let depositsCount = 0;
    let withdrawals = 0;
    let withdrawalsCount = 0;
    let entries = 0;
    let entriesCount = 0;
    let prizes = 0;
    let prizesCount = 0;
    let refunds = 0;
    let refundsCount = 0;

    transactions.forEach((t) => {
      const status = String(t.status || 'completed').toLowerCase();
      if (status === 'failed' || status === 'rejected' || status === 'cancelled') return;

      if (period !== 'all') {
        const ms = getTxTimestampMs(t);
        if (!ms || ms < cutoffMs) return;
      }

      const amt = Number(t.amount || 0);
      if (t.type === 'deposit') {
        deposits += amt;
        depositsCount++;
      } else if (t.type === 'withdraw' || t.type === 'withdrawal') {
        withdrawals += amt;
        withdrawalsCount++;
      } else if (t.type === 'entry') {
        entries += amt;
        entriesCount++;
      } else if (t.type === 'win') {
        prizes += amt;
        prizesCount++;
      } else if (t.type === 'refund') {
        refunds += amt;
        refundsCount++;
      }
    });

    const matchNetEarning = entries - prizes - refunds;
    const cashflowNet = deposits - withdrawals;

    return {
      deposits,
      depositsCount,
      withdrawals,
      withdrawalsCount,
      entries,
      entriesCount,
      prizes,
      prizesCount,
      refunds,
      refundsCount,
      matchNetEarning,
      cashflowNet,
      totalEarningTxCount: depositsCount + entriesCount,
    };
  };

  const earningStats = useMemo(
    () => computeEarningsForWindow(earningPeriod),
    [transactions, earningPeriod]
  );

  const todayEarnings = useMemo(() => computeEarningsForWindow('today'), [transactions]);
  const allTimeEarnings = useMemo(() => computeEarningsForWindow('all'), [transactions]);

  const scheduledMatchPoolValue = useMemo(
    () =>
      matches.reduce((sum, m) => sum + Number(m.entryFee || 0) * Number(m.playersCount || 0), 0),
    [matches]
  );

  const totalDeposits = allTimeEarnings.deposits;
  const totalWithdrawals = allTimeEarnings.withdrawals;

  const handleBanUser = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { isBanned: !currentStatus });
      showToast(!currentStatus ? 'User banned.' : 'User unbanned.', 'info');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleUpdateBalance = async (
    userId: string,
    amount: number,
    type: 'deposit' | 'withdrawal'
  ) => {
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('User not found');

        const userData = userSnap.data() as User;
        const currentDeposit = userData.wallet?.deposit || 0;

        if (type === 'withdrawal' && currentDeposit < amount) {
          throw new Error('Insufficient deposit balance');
        }

        const newDeposit = type === 'deposit' ? currentDeposit + amount : currentDeposit - amount;

        transaction.update(userRef, { 'wallet.deposit': newDeposit });

        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId,
          type,
          amount,
          status: 'completed',
          title: `Admin ${type}`,
          createdAt: serverTimestamp(),
        });
      });
      showToast(`Balance ${type}ed successfully!`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Balance update failed.', 'error');
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      showToast(`Password reset email sent to ${email}.`, 'success');
    } catch (e) {
      showToast('Failed to send reset email.', 'error');
      console.error(e);
    }
  };

  const processDeleteMatch = async () => {
    const { matchId } = isDeleteConfirmOpen;
    if (!matchId || typeof matchId !== 'string') return;

    setIsProcessing(true);
    try {
      await runTransaction(db, async (tx) => {
        const matchRef = doc(db, 'matches', matchId);
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists()) return;

        const matchData = matchSnap.data() as Tournament;
        const players = matchData.players || [];
        const entryFee = Number(matchData.entryFee || 0);

        if (matchData.status !== 'completed' && players.length > 0 && entryFee > 0) {
          for (const player of players) {
            if (!player.userId || typeof player.userId !== 'string') continue;
            const userRef = doc(db, 'users', player.userId);
            tx.update(userRef, { 'wallet.deposit': increment(entryFee) });

            const newTransRef = doc(collection(db, 'transactions'));
            tx.set(newTransRef, {
              userId: player.userId,
              type: 'refund',
              amount: entryFee,
              matchId,
              status: 'completed',
              title: `REFUND: ${matchData.displayId || '#000'}`,
              createdAt: serverTimestamp(),
            });
          }
        }
        tx.delete(matchRef);
      });

      setIsDeleteConfirmOpen({ isOpen: false, matchId: '' });
      showToast('Match deleted and players refunded.', 'success');
    } catch (e) {
      console.error('Error during match deletion:', e);
      showToast('Failed to delete match.', 'error');
      handleFirestoreError(e, OperationType.DELETE, `matches/${matchId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclareResult = (match: Tournament) => {
    setSelectedMatchResults(match);
    setPlayerResults({});
    setPlayerPositionResults({});
    setIsResultModalOpen(true);
  };

  const handleEditMatch = (m: Tournament) => {
    if (!m.id) return;
    onPageChange(Page.ADMIN_EDIT_MATCH, m.id);
  };

  const handleDuplicateMatch = (m: Tournament) => {
    if (!m.id) {
      showToast('Match data missing.', 'error');
      return;
    }
    onPageChange(Page.ADMIN_CREATE_MATCH, m.id);
  };

  const handleSubmitResult = async () => {
    if (!selectedMatchResults || !selectedMatchResults.id) return;
    setIsProcessing(true);

    try {
      await runTransaction(db, async (tx) => {
        const matchId = selectedMatchResults.id!;
        const players = selectedMatchResults.players || [];

        const userDocs: { ref: any; snap: any; userId: string; player: any }[] = [];
        for (const player of players) {
          const userId = player.userId;
          if (!userId || typeof userId !== 'string') continue;
          const userRef = doc(db, 'users', userId);
          const snap = await tx.get(userRef);
          userDocs.push({ ref: userRef, snap, userId, player });
        }

        for (const { ref: userRef, snap: uSnap, userId, player } of userDocs) {
          if (uSnap.exists()) {
            let winningAmount = 0;

            if (selectedMatchResults.section === 'Battle Royale') {
              if (selectedMatchResults.prizeType === 'perKill') {
                const playerKey = `${player.userId}_${player.slot}`;
                const kills = playerResults[playerKey] || 0;
                const killsWinning = kills * (selectedMatchResults.perKillAmount || 0);
                const rank = playerPositionResults[playerKey] || 0;
                const positionWinning = selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
                winningAmount = killsWinning + positionWinning;
              } else if (selectedMatchResults.prizeType === 'survival') {
                const rank = playerResults[`${player.userId}_${player.slot}`] || 0;
                winningAmount = selectedMatchResults.prizeDistribution?.[rank] || 0;
              }
            } else {
              const rank = playerResults[`${player.userId}_${player.slot}`] || 0;
              if (rank === 1) {
                winningAmount = selectedMatchResults.prizePool || 0;
              }
            }

            const updates: any = {
              'stats.matchesPlayed': increment(1),
            };

            if (winningAmount > 0) {
              updates['wallet.winnings'] = increment(winningAmount);
              updates['stats.totalWinnings'] = increment(winningAmount);

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

            if (selectedMatchResults.prizeType === 'perKill') {
              updates['stats.totalKills'] = increment(
                playerResults[`${player.userId}_${player.slot}`] || 0
              );
            }

            tx.update(userRef, updates);
          }
        }

        const matchRef = doc(db, 'matches', matchId);
        const resultsArray = players.map((player) => {
          const playerKey = `${player.userId}_${player.slot}`;
          const score = playerResults[playerKey] || 0;
          let winningAmount = 0;

          if (selectedMatchResults.section === 'Battle Royale') {
            if (selectedMatchResults.prizeType === 'perKill') {
              const kills = score;
              const killsWinning = kills * (selectedMatchResults.perKillAmount || 0);
              const rank = playerPositionResults[playerKey] || 0;
              const positionWinning = selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
              winningAmount = killsWinning + positionWinning;
            } else if (selectedMatchResults.prizeType === 'survival') {
              winningAmount = selectedMatchResults.prizeDistribution?.[score] || 0;
            }
          } else {
            if (score === 1) {
              winningAmount = selectedMatchResults.prizePool || 0;
            }
          }

          return {
            userId: player.userId,
            slot: player.slot,
            username: player.username,
            ign: player.ign,
            rankOrKills: score,
            positionRank: playerPositionResults[playerKey] || null,
            winningAmount,
            killsWinning:
              selectedMatchResults.prizeType === 'perKill'
                ? score * (selectedMatchResults.perKillAmount || 0)
                : 0,
            positionWinning:
              selectedMatchResults.prizeType === 'perKill'
                ? selectedMatchResults.positionPrizeDistribution?.[
                    playerPositionResults[playerKey] || 0
                  ] || 0
                : 0,
          };
        });

        const resultsRef = doc(db, 'matchResults', matchId);
        tx.set(resultsRef, {
          matchId,
          matchTitle: selectedMatchResults.title,
          section: selectedMatchResults.section,
          prizeType: selectedMatchResults.prizeType || null,
          results: resultsArray,
          createdAt: serverTimestamp(),
        });

        tx.update(matchRef, { status: 'completed' });
      });

      setIsResultModalOpen(false);
      showToast('Results declared & winnings credited!', 'success');
    } catch (e) {
      console.error('Error during result submission:', e);
      showToast('Failed to declare results.', 'error');
      handleFirestoreError(e, OperationType.UPDATE, `matches/${selectedMatchResults.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const allAvailableRuleSections = useMemo(() => {
    const map: Record<
      string,
      { id: string; title: string; category: string; rulesCount: number; isPreset: boolean }
    > = {};

    Object.keys(RULE_PRESETS).forEach((key) => {
      const p = RULE_PRESETS[key];
      const firestoreDoc = gameRulesDocs[key];
      map[key] = {
        id: key,
        title: firestoreDoc?.title || p.title,
        category: firestoreDoc?.category || p.category,
        rulesCount: firestoreDoc?.rules ? firestoreDoc.rules.length : p.rules.length,
        isPreset: true,
      };
    });

    gameModesList.forEach((m) => {
      const rawKey = (m.id || m.title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
      if (rawKey && !map[rawKey]) {
        const firestoreDoc = gameRulesDocs[rawKey];
        map[rawKey] = {
          id: rawKey,
          title: firestoreDoc?.title || m.title || m.subtitle || rawKey.replace(/_/g, ' '),
          category: firestoreDoc?.category || m.category || 'Custom Mode',
          rulesCount: firestoreDoc?.rules?.length || 0,
          isPreset: false,
        };
      }
    });

    Object.keys(gameRulesDocs).forEach((key) => {
      const docData = gameRulesDocs[key];
      if (!map[key]) {
        map[key] = {
          id: key,
          title: docData.title || key.replace(/_/g, ' '),
          category: docData.category || 'Custom Section',
          rulesCount: docData.rules?.length || 0,
          isPreset: false,
        };
      } else {
        map[key].title = docData.title || map[key].title;
        map[key].category = docData.category || map[key].category;
        map[key].rulesCount = docData.rules?.length || 0;
      }
    });

    return Object.values(map);
  }, [gameRulesDocs, gameModesList]);

  useEffect(() => {
    const currentDoc = gameRulesDocs[activeRuleTab];
    if (currentDoc && currentDoc.rules && currentDoc.rules.length > 0) {
      setRuleList(currentDoc.rules);
      setRuleText(currentDoc.rules.join('\n'));
      setActiveSectionTitle(currentDoc.title || activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory(currentDoc.category || 'General');
    } else if (RULE_PRESETS[activeRuleTab]) {
      const p = RULE_PRESETS[activeRuleTab];
      setRuleList(p.rules);
      setRuleText(p.rules.join('\n'));
      setActiveSectionTitle(p.title);
      setActiveSectionCategory(p.category);
    } else {
      const defaultSample = [
        'Fair Play: No hacking, scripts or third-party tools allowed.',
        'Device Requirements: Mobile & tablet devices only. Strictly no emulators.',
        'Verification: High-definition victory/final scorecard screenshot mandatory in case of dispute.',
        'Match Entry: Room closes 2 minutes before match start time.',
        'Admin Decision: Admin decision is final and binding for all participants.',
      ];
      setRuleList(defaultSample);
      setRuleText(defaultSample.join('\n'));
      setActiveSectionTitle(activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory('General');
    }
  }, [activeRuleTab, gameRulesDocs]);

  const handleSaveCurrentSectionRules = async () => {
    setIsProcessing(true);
    try {
      const finalRules =
        ruleEditMode === 'raw'
          ? ruleText
              .split('\n')
              .map((r) => r.trim())
              .filter((r) => r.length > 0)
          : ruleList.map((r) => r.trim()).filter((r) => r.length > 0);

      if (finalRules.length === 0) {
        showToast('Please provide at least one rule item.', 'error');
        setIsProcessing(false);
        return;
      }

      await setDoc(
        doc(db, 'gameRules', activeRuleTab),
        {
          id: activeRuleTab,
          title: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
          section: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
          category: activeSectionCategory.trim() || 'General',
          rules: finalRules,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setRuleList(finalRules);
      setRuleText(finalRules.join('\n'));
      showToast(`Rules for "${activeSectionTitle}" saved!`, 'success');
    } catch (e) {
      console.error('Error saving rules:', e);
      showToast('Failed to save rules.', 'error');
      handleFirestoreError(e, OperationType.UPDATE, `gameRules/${activeRuleTab}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddSingleRule = () => {
    if (!newSingleRuleText.trim()) return;
    const updated = [...ruleList, newSingleRuleText.trim()];
    setRuleList(updated);
    setRuleText(updated.join('\n'));
    setNewSingleRuleText('');
  };

  const handleDeleteSingleRule = (index: number) => {
    const updated = ruleList.filter((_, i) => i !== index);
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === ruleList.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...ruleList];
    const item = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = item;
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  const handleApplyPresetTemplate = async (presetKey: string) => {
    if (RULE_PRESETS[presetKey]) {
      const preset = RULE_PRESETS[presetKey];
      const ok = await confirmDialog({
        title: 'Load Rule Preset?',
        message: `Replace the current editor with "${preset.title}" regulations?`,
        confirmText: 'Load Preset',
      });
      if (ok) {
        setRuleList([...preset.rules]);
        setRuleText(preset.rules.join('\n'));
        showToast('Preset loaded into editor.', 'info');
      }
    }
  };

  const handleAddNewSectionSubmit = async () => {
    if (!newSectionForm.title.trim()) {
      showToast('Please enter a section title.', 'error');
      return;
    }
    const cleanId = newSectionForm.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    if (!cleanId) {
      showToast('Invalid section title.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const starterTemplate =
        RULE_PRESETS[newSectionForm.template] || RULE_PRESETS.battle_royale;
      const initialRules = [...starterTemplate.rules];

      await setDoc(
        doc(db, 'gameRules', cleanId),
        {
          id: cleanId,
          title: newSectionForm.title.trim(),
          section: newSectionForm.title.trim(),
          category: newSectionForm.category.trim() || newSectionForm.title.trim(),
          rules: initialRules,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setActiveRuleTab(cleanId);
      setActiveSectionTitle(newSectionForm.title.trim());
      setActiveSectionCategory(newSectionForm.category.trim() || newSectionForm.title.trim());
      setRuleList(initialRules);
      setRuleText(initialRules.join('\n'));
      setIsAddSectionModalOpen(false);
      setNewSectionForm({ title: '', category: '', template: 'battle_royale' });
      showToast(`Created "${newSectionForm.title}" rules!`, 'success');
    } catch (err) {
      console.error('Failed to create new rule section:', err);
      showToast('Could not create rule section.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteCustomSectionRules = async (secId: string, secTitle: string) => {
    if (['battle_royale', 'clash_squad', 'lone_wolf'].includes(secId)) {
      showToast('Default game mode sections cannot be deleted.', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: 'Delete Section Rules?',
      message: `Remove rules for "${secTitle}"?`,
      confirmText: 'Delete Rules',
      destructive: true,
    });
    if (!ok) return;

    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'gameRules', secId));
      setActiveRuleTab('battle_royale');
      showToast(`Rules for "${secTitle}" removed.`, 'info');
    } catch (err) {
      console.error('Failed to delete section rules:', err);
      showToast('Failed to delete section rules.', 'error');
    } finally {
      setIsProcessing(false);
    }
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
        try {
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
          });
        } catch (notifErr) {
          console.warn('Could not auto push notification:', notifErr);
        }
      }

      setIsDeclareRoomModalOpen(false);
      setSelectedDeclareRoomMatch(null);
      showToast('Room ID & Password published to players!', 'success');
    } catch (err: any) {
      console.error('Failed to declare room:', err);
      showToast('Failed to declare room credentials.', 'error');
      handleFirestoreError(err, OperationType.UPDATE, `matches/${selectedDeclareRoomMatch.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearRoomCredentials = async (matchId: string) => {
    const ok = await confirmDialog({
      title: 'Clear Room Credentials?',
      message: 'Remove the published Room ID and Password from this match?',
      confirmText: 'Clear',
      destructive: true,
    });
    if (!ok) return;

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'matches', matchId), {
        roomId: '',
        roomPassword: '',
        roomNotes: '',
        updatedAt: serverTimestamp(),
      });
      if (isDeclareRoomModalOpen) {
        setIsDeclareRoomModalOpen(false);
        setSelectedDeclareRoomMatch(null);
      }
      showToast('Room credentials cleared.', 'info');
    } catch (err) {
      console.error('Failed to clear room:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyCredential = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard.', 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveSettings = async (data: any) => {
    setIsProcessing(true);
    try {
      await setDoc(doc(db, 'appSettings', 'referral_support'), data, { merge: true });
      showToast('Settings updated successfully!', 'success');
    } catch (e) {
      showToast('Could not save settings.', 'error');
      handleFirestoreError(e, OperationType.UPDATE, 'appSettings/referral_support');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveBanner = async () => {
    if (!imageUrl) {
      showToast('Image URL is required.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const bannerData = {
        imageUrl,
        redirectUrl: bannerType === 'main' || bannerType === 'offer' ? redirectUrl : '',
        type: bannerType,
        order: Number(bannerOrder),
        isActive: true,
        updatedAt: serverTimestamp(),
      };

      if (editingBanner?.id) {
        await updateDoc(doc(db, 'banners', editingBanner.id), bannerData);
      } else {
        await addDoc(collection(db, 'banners'), {
          ...bannerData,
          createdAt: serverTimestamp(),
        });
      }
      setIsBannerModalOpen(false);
      setEditingBanner(null);
      setImageUrl('');
      setRedirectUrl('');
      showToast('Promotion banner saved!', 'success');
    } catch (e) {
      showToast('Failed to save banner.', 'error');
      handleFirestoreError(e, OperationType.WRITE, 'banners');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBanner = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Delete Banner?',
      message: 'Permanently delete this promotion banner? This cannot be undone.',
      confirmText: 'Delete Banner',
      destructive: true,
    });
    if (!ok) return;

    setDeletingBannerId(id);
    try {
      await deleteDoc(doc(db, 'banners', id));
      showToast('Banner deleted.', 'info');
    } catch (e) {
      console.error('Error deleting banner:', e);
      showToast('Could not delete banner.', 'error');
      handleFirestoreError(e, OperationType.DELETE, `banners/${id}`);
    } finally {
      setDeletingBannerId(null);
    }
  };

  const handleToggleGateway = async (gatewayId: string, currentStatus: boolean) => {
    setIsProcessing(true);
    try {
      if (!currentStatus) {
        const batch = writeBatch(db);
        paymentGateways.forEach((g) => {
          if (g.isActive) {
            batch.update(doc(db, 'paymentSettings', g.id), { isActive: false });
          }
        });
        batch.update(doc(db, 'paymentSettings', gatewayId), {
          isActive: true,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        showToast(`${gatewayId.toUpperCase()} enabled as active gateway.`, 'success');
      } else {
        await updateDoc(doc(db, 'paymentSettings', gatewayId), {
          isActive: false,
          updatedAt: serverTimestamp(),
        });
        showToast(`${gatewayId.toUpperCase()} disabled.`, 'info');
      }
    } catch (e) {
      showToast('Gateway update failed.', 'error');
      handleFirestoreError(e, OperationType.UPDATE, `paymentSettings/${gatewayId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveGateway = async () => {
    if (!gatewayForm.name) {
      showToast('Gateway name is required.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const gId = editingGateway?.id || gatewayForm.name.toLowerCase().replace(/\s+/g, '_');
      const gatewayData = {
        ...gatewayForm,
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'paymentSettings', gId), gatewayData, { merge: true });

      setIsGatewayModalOpen(false);
      setEditingGateway(null);
      setGatewayForm({
        name: '',
        apiKey: '',
        secretKey: '',
        merchantId: '',
        webhookSecret: '',
        upiId: '',
      });
      showToast('Payment gateway saved!', 'success');
    } catch (e) {
      showToast('Failed to save gateway configuration.', 'error');
      handleFirestoreError(e, OperationType.WRITE, 'paymentSettings');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex flex-col items-center justify-center">
        <Loader2 className="text-[#007AFF] animate-spin mb-3" size={30} />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Loading Admin Console...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28">
      {/* Frosted iOS Sticky Header + Panel Switcher */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
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
                  Admin Console
                </h1>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${roleBadge.lightPillClass}`}
                >
                  {roleBadge.label}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                {currentUser?.email || auth.currentUser?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Control Panel Switcher (Desktop/Tablet) */}
            <div className="hidden md:flex items-center p-1 bg-slate-100 border border-slate-200 rounded-full">
              <button
                type="button"
                className="px-3.5 py-1.5 rounded-full bg-[#007AFF] text-white text-xs font-bold shadow-xs"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => onPageChange(Page.CO_OWNER)}
                className="px-3.5 py-1.5 rounded-full text-slate-600 hover:text-slate-900 text-xs font-bold transition-colors"
              >
                Co-Owner
              </button>
              <button
                type="button"
                onClick={() => onPageChange(Page.STAFF)}
                className="px-3.5 py-1.5 rounded-full text-slate-600 hover:text-slate-900 text-xs font-bold transition-colors"
              >
                Staff
              </button>
            </div>

            <button
              type="button"
              onClick={() => onPageChange(Page.CHAT)}
              className="h-9 px-3 rounded-full bg-blue-50 border border-blue-200 text-[#007AFF] text-xs font-bold flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
            >
              <MessageCircle size={14} />
              <span className="hidden sm:inline">Support Chat</span>
            </button>
          </div>
        </div>

        {/* Mobile Panel Switcher */}
        <div className="md:hidden max-w-6xl mx-auto px-4 pb-2.5 flex items-center gap-1.5">
          <button
            type="button"
            className="flex-1 py-1.5 rounded-xl bg-[#007AFF] text-white text-[11px] font-bold shadow-xs"
          >
            Admin Panel
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Page.CO_OWNER)}
            className="flex-1 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] font-bold"
          >
            Co-Owner Panel
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Page.STAFF)}
            className="flex-1 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] font-bold"
          >
            Staff Panel
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Live Earning Count Strip */}
        <div className="bg-white border border-blue-200/80 rounded-[24px] p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-[#007AFF] flex items-center justify-center shrink-0">
              <TrendingUp size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#007AFF]">
                Earning Count • All-Time Net
              </p>
              <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
                <span className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums">
                  ₹{allTimeEarnings.matchNetEarning.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  ({allTimeEarnings.entriesCount} entries collected)
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-extrabold text-emerald-700 uppercase">
              Today
            </span>
            <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
              +₹{(todayEarnings.entries > 0 ? todayEarnings.entries : todayEarnings.deposits).toLocaleString()}
            </p>
            <p className="text-[10px] font-semibold text-slate-400 tabular-nums">
              {todayEarnings.totalEarningTxCount} txns
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {visibleTabs.map((tab) => {
            const label =
              tab === AdminTab.STAFF
                ? 'Staff & Co-Owners'
                : tab === AdminTab.REFERRAL
                ? 'Referral & Support'
                : tab === AdminTab.PAYMENT
                ? 'Gateways'
                : tab === AdminTab.MODES
                ? 'Game Modes'
                : tab.charAt(0).toUpperCase() + tab.slice(1);
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  if (tab === AdminTab.MODES) {
                    onPageChange(Page.ADMIN_MODES);
                    return;
                  }
                  setActiveTab(tab);
                }}
                className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
                  activeTab === tab
                    ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-sm shadow-blue-500/25'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === AdminTab.DASHBOARD && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* Full Platform Earnings Card */}
              <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 sm:p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#007AFF] flex items-center gap-1.5">
                      <BarChart3 size={14} /> Revenue & Earning Count
                    </p>
                    <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                      Platform Financial Analytics
                    </h3>
                  </div>

                  <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start">
                    {(
                      [
                        { id: 'today', label: 'Today' },
                        { id: '7d', label: '7D' },
                        { id: '30d', label: '30D' },
                        { id: 'all', label: 'All Time' },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setEarningPeriod(p.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          earningPeriod === p.id
                            ? 'bg-white text-[#007AFF] shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800">Match Net Earning</span>
                      <ArrowUpRight size={16} className="text-emerald-600" />
                    </div>
                    <p
                      className={`text-2xl font-extrabold tabular-nums mt-1 ${
                        earningStats.matchNetEarning >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      ₹{earningStats.matchNetEarning.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-emerald-700/80 font-medium mt-0.5">
                      Entry Fees − Prizes & Refunds
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900">Wallet Cashflow</span>
                      <Coins size={16} className="text-[#007AFF]" />
                    </div>
                    <p
                      className={`text-2xl font-extrabold tabular-nums mt-1 ${
                        earningStats.cashflowNet >= 0 ? 'text-[#007AFF]' : 'text-rose-600'
                      }`}
                    >
                      ₹{earningStats.cashflowNet.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-blue-800/80 font-medium mt-0.5">
                      Deposits − Withdrawals
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-slate-500">Entries</p>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#007AFF] text-[10px] font-extrabold tabular-nums">
                        {earningStats.entriesCount}x
                      </span>
                    </div>
                    <p className="text-base font-extrabold text-slate-900 tabular-nums">
                      ₹{earningStats.entries.toLocaleString()}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-slate-500">Prizes Paid</p>
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold tabular-nums">
                        {earningStats.prizesCount}x
                      </span>
                    </div>
                    <p className="text-base font-extrabold text-rose-600 tabular-nums">
                      ₹{earningStats.prizes.toLocaleString()}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-slate-500">Deposits</p>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-extrabold tabular-nums">
                        {earningStats.depositsCount}x
                      </span>
                    </div>
                    <p className="text-base font-extrabold text-emerald-700 tabular-nums">
                      ₹{earningStats.deposits.toLocaleString()}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-slate-500">Withdrawals</p>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold tabular-nums">
                        {earningStats.withdrawalsCount}x
                      </span>
                    </div>
                    <p className="text-base font-extrabold text-amber-700 tabular-nums">
                      ₹{earningStats.withdrawals.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pt-3 border-t border-slate-100">
                  <span>Active Match Entry Pool Value</span>
                  <span className="text-slate-900 font-extrabold tabular-nums">
                    ₹{scheduledMatchPoolValue.toLocaleString()} ({totalJoinedPlayers} slots)
                  </span>
                </div>
              </div>

              {/* 4 KPI Summary Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <StatCard label="Total Players" value={totalUsers} icon={Users} accent="blue" />
                <StatCard label="Tournaments" value={totalMatches} icon={Trophy} accent="sky" />
                <StatCard
                  label="Joined Slots"
                  value={totalJoinedPlayers}
                  icon={UsersIcon}
                  accent="amber"
                />
                <StatCard
                  label="Net Cashflow"
                  value={`₹${(totalDeposits - totalWithdrawals).toLocaleString()}`}
                  icon={DollarSign}
                  accent="emerald"
                />
              </div>

              {/* Quick Actions & System Health */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Quick Console Actions
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                      className="p-4 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] text-white text-left space-y-2 transition-all active:scale-95"
                    >
                      <Plus size={22} />
                      <p className="text-xs font-extrabold">Create Match</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPageChange(Page.ADMIN_MODES)}
                      className="p-4 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#007AFF] text-left space-y-2 transition-all active:scale-95"
                    >
                      <Gamepad2 size={22} />
                      <p className="text-xs font-extrabold">Game Modes</p>
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-1.5">
                    <Shield size={14} className="text-[#007AFF]" /> Infrastructure Status
                  </h4>
                  <div className="space-y-3">
                    <HealthBar label="Cloud Firestore Database" status="Operational" />
                    <HealthBar label="Firebase Authentication" status="Operational" />
                    <HealthBar label="Payment Webhook & Sync" status="Active" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.STAFF && (
            <motion.div
              key="staff"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Assign Staff, Co-Owner, or Admin
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter any email (even before they sign up) or promote an existing player below.
                  </p>
                </div>

                {staffFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold border ${
                      staffFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}
                  >
                    {staffFeedback.msg}
                  </div>
                )}

                <div className="space-y-3">
                  <input
                    type="email"
                    placeholder="Enter email (e.g. staff@gmail.com)"
                    value={staffEmailInput}
                    onChange={(e) => setStaffEmailInput(e.target.value)}
                    className="w-full h-12 bg-slate-50 border border-slate-200 focus:border-[#007AFF] focus:bg-white rounded-2xl px-4 text-sm font-semibold text-slate-900 outline-none"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setStaffRoleInput('staff')}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        staffRoleInput === 'staff'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Staff
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaffRoleInput('co_owner')}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        staffRoleInput === 'co_owner'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Co-Owner
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaffRoleInput('admin')}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        staffRoleInput === 'admin'
                          ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Admin
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing || !staffEmailInput.trim()}
                    onClick={async () => {
                      const cleanEmail = staffEmailInput.trim().toLowerCase();
                      if (!cleanEmail || !cleanEmail.includes('@')) {
                        setStaffFeedback({ type: 'error', msg: 'Enter a valid email address.' });
                        return;
                      }
                      setIsProcessing(true);
                      setStaffFeedback(null);
                      try {
                        const matchedUser = users.find(
                          (u) => (u.email || '').trim().toLowerCase() === cleanEmail
                        );
                        await setDoc(doc(db, 'roleAssignments', cleanEmail), {
                          email: cleanEmail,
                          role: staffRoleInput,
                          assignedBy: currentUser?.email || auth.currentUser?.email || 'admin',
                          updatedAt: serverTimestamp(),
                        });
                        if (matchedUser?.id) {
                          await updateDoc(doc(db, 'users', matchedUser.id), {
                            role: staffRoleInput,
                            isAdmin: staffRoleInput === 'admin',
                          });
                          await setDoc(doc(db, 'admins', matchedUser.id), {
                            role: staffRoleInput,
                            email: cleanEmail,
                            updatedAt: serverTimestamp(),
                          });
                        }
                        setStaffEmailInput('');
                        setStaffFeedback({
                          type: 'success',
                          msg: matchedUser
                            ? `${matchedUser.username} (${cleanEmail}) is now ${staffRoleInput.replace('_', '-').toUpperCase()}!`
                            : `Role ${staffRoleInput.replace('_', '-').toUpperCase()} pre-assigned to ${cleanEmail}. Activates on sign-in.`,
                        });
                      } catch (err) {
                        handleFirestoreError(err, OperationType.WRITE, 'roleAssignments');
                        setStaffFeedback({
                          type: 'error',
                          msg: 'Failed to assign role. Check permissions.',
                        });
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                    className="w-full h-12 rounded-2xl bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-40 text-white text-xs font-extrabold uppercase tracking-wider shadow-sm transition-all"
                  >
                    Assign {staffRoleInput.replace('_', '-').toUpperCase()} Role
                  </button>
                </div>
              </div>

              {/* Active Team Members */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
                  Active Team Roster
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {users
                    .filter((u) => getEffectiveRole(u) !== 'user')
                    .map((u) => {
                      const uRole = getEffectiveRole(u);
                      const uBadge = getRoleBadgeMeta(uRole);
                      const isPrimaryOwner = isAdminIdentity(u.email, u.id);
                      return (
                        <div
                          key={u.id}
                          className="p-4 bg-white border border-slate-200/80 rounded-[22px] shadow-xs space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h5 className="text-sm font-extrabold text-slate-900 truncate">
                                  {u.username}
                                </h5>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${uBadge.lightPillClass}`}
                                >
                                  {uBadge.label}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{u.email}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, u.id)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 shrink-0"
                            >
                              Inspect
                            </button>
                          </div>

                          {!isPrimaryOwner && u.id && (
                            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateDoc(doc(db, 'users', u.id!), {
                                    role: 'staff',
                                    isAdmin: false,
                                  });
                                  await setDoc(doc(db, 'admins', u.id!), {
                                    role: 'staff',
                                    email: (u.email || '').toLowerCase(),
                                    updatedAt: serverTimestamp(),
                                  });
                                  showToast(`${u.username} set to Staff.`, 'success');
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                                  uRole === 'staff'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                Staff
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateDoc(doc(db, 'users', u.id!), {
                                    role: 'co_owner',
                                    isAdmin: false,
                                  });
                                  await setDoc(doc(db, 'admins', u.id!), {
                                    role: 'co_owner',
                                    email: (u.email || '').toLowerCase(),
                                    updatedAt: serverTimestamp(),
                                  });
                                  showToast(`${u.username} set to Co-Owner.`, 'success');
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                                  uRole === 'co_owner'
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                Co-Owner
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateDoc(doc(db, 'users', u.id!), {
                                    role: 'admin',
                                    isAdmin: true,
                                  });
                                  await setDoc(doc(db, 'admins', u.id!), {
                                    role: 'admin',
                                    email: (u.email || '').toLowerCase(),
                                    updatedAt: serverTimestamp(),
                                  });
                                  showToast(`${u.username} set to Admin.`, 'success');
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                                  uRole === 'admin'
                                    ? 'bg-[#007AFF] text-white border-[#007AFF]'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                Admin
                              </button>
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
                                  showToast('Role revoked.', 'info');
                                }}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {roleAssignments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
                    Email Pre-Assignments
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {roleAssignments.map((ra) => {
                      const badge = getRoleBadgeMeta(ra.role);
                      return (
                        <div
                          key={ra.id}
                          className="p-3.5 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between gap-2 shadow-xs"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badge.lightPillClass}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 truncate">
                              {ra.email}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteDoc(doc(db, 'roleAssignments', ra.id));
                              showToast('Email invite removed.', 'info');
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Revoke assignment"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Promote Registered Players */}
              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Quick Promote Registered Players
                </h4>
                <div className="relative">
                  <Search
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={15}
                  />
                  <input
                    type="text"
                    placeholder="Search player by name or email..."
                    value={staffSearchTerm}
                    onChange={(e) => setStaffSearchTerm(e.target.value)}
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 text-xs font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {users
                    .filter((u) => getEffectiveRole(u) === 'user')
                    .filter(
                      (u) =>
                        u.username.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
                        (u.email || '').toLowerCase().includes(staffSearchTerm.toLowerCase())
                    )
                    .slice(0, 10)
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
                        <div className="flex items-center gap-1.5 shrink-0">
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
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase"
                          >
                            + Staff
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!u.id) return;
                              await updateDoc(doc(db, 'users', u.id), {
                                role: 'co_owner',
                                isAdmin: false,
                              });
                              await setDoc(doc(db, 'admins', u.id), {
                                role: 'co_owner',
                                email: (u.email || '').toLowerCase(),
                                updatedAt: serverTimestamp(),
                              });
                              showToast(`${u.username} promoted to Co-Owner!`, 'success');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-[10px] font-bold uppercase"
                          >
                            + Co-Owner
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.NOTIFICATIONS && (
            <motion.div
              key="notifications"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AdminNotificationsTab
                matches={matches}
                users={users}
                onPageChange={onPageChange}
              />
            </motion.div>
          )}

          {activeTab === AdminTab.USERS && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search by username or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-12 bg-white border border-slate-200 rounded-2xl pl-11 pr-4 text-sm font-medium outline-none focus:border-[#007AFF] shadow-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {users
                  .filter(
                    (u) =>
                      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((u) => {
                    const uRole = getEffectiveRole(u);
                    const uBadge = getRoleBadgeMeta(uRole);
                    const totalBal =
                      (u.wallet?.deposit || 0) +
                      (u.wallet?.winnings || 0) +
                      (u.wallet?.bonus || 0);
                    return (
                      <div
                        key={u.id}
                        onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, u.id)}
                        className="p-4 bg-white border border-slate-200/80 rounded-[22px] flex items-center justify-between cursor-pointer hover:border-[#007AFF] shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                            <Users size={19} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-extrabold text-slate-900 truncate">
                                {u.username}
                              </h4>
                              {uRole !== 'user' && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${uBadge.lightPillClass}`}
                                >
                                  {uBadge.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-extrabold text-emerald-600 tabular-nums">
                            ₹{totalBal}
                          </span>
                          {u.isBanned && <Ban size={15} className="text-rose-500" />}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.MATCHES && (
            <motion.div
              key="matches"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                  className="sm:w-56 h-12 bg-[#007AFF] hover:bg-[#0066D6] rounded-2xl flex items-center justify-center gap-2 shadow-sm shadow-blue-500/25 active:scale-[0.98] transition-all text-white text-xs font-extrabold uppercase tracking-wider shrink-0"
                >
                  <Plus size={18} />
                  <span>Create Match</span>
                </button>

                <div className="relative flex-1">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Search by Match ID, Title, Map or Section..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-12 bg-white border border-slate-200 rounded-2xl pl-11 pr-4 text-sm font-medium outline-none focus:border-[#007AFF] shadow-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Match Status Filters */}
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {[
                  { id: 'all', label: `All (${matches.length})` },
                  {
                    id: 'need_room',
                    label: `Need Room (${matches.filter((m) => (!m.roomId || !m.roomPassword) && m.status !== 'completed').length})`,
                  },
                  {
                    id: 'room_ready',
                    label: `Room Ready (${matches.filter((m) => m.roomId && m.roomPassword && m.status !== 'completed').length})`,
                  },
                  {
                    id: 'live',
                    label: `Live (${matches.filter((m) => m.status === 'ongoing').length})`,
                  },
                  {
                    id: 'completed',
                    label: `Completed (${matches.filter((m) => m.status === 'completed').length})`,
                  },
                ].map((filterItem) => (
                  <button
                    key={filterItem.id}
                    type="button"
                    onClick={() => setMatchStatusFilter(filterItem.id as any)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                      matchStatusFilter === filterItem.id
                        ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {filterItem.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {matches
                  .filter((m) => {
                    const matchText =
                      (m.displayId || '') +
                      ' ' +
                      (m.title || '') +
                      ' ' +
                      (m.section || '') +
                      ' ' +
                      (m.map || '');
                    const matchesSearch = matchText
                      .toLowerCase()
                      .includes(searchTerm.toLowerCase());
                    if (!matchesSearch) return false;

                    if (matchStatusFilter === 'need_room') {
                      return (!m.roomId || !m.roomPassword) && m.status !== 'completed';
                    }
                    if (matchStatusFilter === 'room_ready') {
                      return Boolean(m.roomId && m.roomPassword && m.status !== 'completed');
                    }
                    if (matchStatusFilter === 'live') return m.status === 'ongoing';
                    if (matchStatusFilter === 'completed') return m.status === 'completed';
                    return true;
                  })
                  .map((m) => {
                    const hasRoomCreds = Boolean(m.roomId && m.roomPassword);
                    const draft = inlineRoomDrafts[m.id] || {};
                    const currentRoomVal =
                      draft.roomId !== undefined ? draft.roomId : m.roomId || '';
                    const currentPassVal =
                      draft.roomPassword !== undefined
                        ? draft.roomPassword
                        : m.roomPassword || '';

                    return (
                      <div
                        key={m.id}
                        className="p-5 bg-white border border-slate-200/80 rounded-[24px] shadow-xs flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-extrabold text-[#007AFF] bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200 tabular-nums">
                                {m.displayId || '#000'}
                              </span>
                              <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                                {m.section || m.mode || 'Battle Royale'}
                              </span>
                              {m.status === 'completed' ? (
                                <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full">
                                  Completed
                                </span>
                              ) : m.status === 'ongoing' ? (
                                <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full">
                                  Live
                                </span>
                              ) : (
                                <span className="bg-sky-50 border border-sky-200 text-sky-700 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full">
                                  Upcoming
                                </span>
                              )}
                            </div>

                            <div className="flex gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDuplicateMatch(m)}
                                className="w-8 h-8 bg-blue-50 text-[#007AFF] rounded-xl hover:bg-[#007AFF] hover:text-white flex items-center justify-center transition-colors"
                                title="Duplicate Match"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditMatch(m)}
                                className="w-8 h-8 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-800 hover:text-white flex items-center justify-center transition-colors"
                                title="Edit Match"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setIsDeleteConfirmOpen({ isOpen: true, matchId: m.id })
                                }
                                className="w-8 h-8 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white flex items-center justify-center transition-colors"
                                title="Delete Match"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <h4 className="text-base font-extrabold text-slate-900 mb-2">{m.title}</h4>

                          <div className="flex flex-wrap gap-4 mb-4 text-xs text-slate-500 font-medium">
                            <span className="flex items-center gap-1.5">
                              <Clock size={14} className="text-[#007AFF]" />
                              {formatMatchTime(m.time)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <MapIcon size={14} className="text-[#007AFF]" />
                              {m.map}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100">
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                Players
                              </p>
                              <p className="text-sm font-extrabold text-slate-900 tabular-nums">
                                {m.playersCount}/{m.totalSlots || m.maxPlayers}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                Entry Fee
                              </p>
                              <p className="text-sm font-extrabold text-emerald-600 tabular-nums">
                                {m.entryFee === 0 ? 'FREE' : `₹${m.entryFee}`}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                Prize
                              </p>
                              <p className="text-sm font-extrabold text-[#007AFF] tabular-nums">
                                {m.prizeType === 'perKill'
                                  ? `₹${m.perKillAmount}/kill`
                                  : `₹${m.prizePool}`}
                              </p>
                            </div>
                          </div>

                          {/* Room Credentials Section */}
                          <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <Key
                                  size={14}
                                  className={hasRoomCreds ? 'text-emerald-600' : 'text-amber-600'}
                                />
                                Room Credentials
                              </span>
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                  hasRoomCreds
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {hasRoomCreds ? 'Published' : 'Pending'}
                              </span>
                            </div>

                            {hasRoomCreds && (
                              <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between pr-1">
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                                      Room ID
                                    </p>
                                    <p className="text-xs font-extrabold text-slate-900 font-mono">
                                      {m.roomId}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCredential(m.roomId!, `room_${m.id}`)}
                                    className="p-1 text-slate-400 hover:text-[#007AFF]"
                                  >
                                    {copiedKey === `room_${m.id}` ? (
                                      <Check size={13} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={13} />
                                    )}
                                  </button>
                                </div>
                                <div className="flex items-center justify-between border-l border-slate-200 pl-2">
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                                      Password
                                    </p>
                                    <p className="text-xs font-extrabold text-slate-900 font-mono">
                                      {m.roomPassword}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyCredential(m.roomPassword!, `pass_${m.id}`)
                                    }
                                    className="p-1 text-slate-400 hover:text-[#007AFF]"
                                  >
                                    {copiedKey === `pass_${m.id}` ? (
                                      <Check size={13} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={13} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Room ID"
                                value={currentRoomVal}
                                onChange={(e) =>
                                  setInlineRoomDrafts((prev) => ({
                                    ...prev,
                                    [m.id]: { ...prev[m.id], roomId: e.target.value },
                                  }))
                                }
                                className="flex-1 h-9 bg-white border border-slate-200 rounded-xl px-3 text-xs font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                              />
                              <input
                                type="text"
                                placeholder="Password"
                                value={currentPassVal}
                                onChange={(e) =>
                                  setInlineRoomDrafts((prev) => ({
                                    ...prev,
                                    [m.id]: { ...prev[m.id], roomPassword: e.target.value },
                                  }))
                                }
                                className="flex-1 h-9 bg-white border border-slate-200 rounded-xl px-3 text-xs font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  const updates: any = {
                                    roomId: currentRoomVal.trim(),
                                    roomPassword: currentPassVal.trim(),
                                    updatedAt: serverTimestamp(),
                                  };
                                  if (currentRoomVal.trim() && m.status === 'upcoming') {
                                    updates.status = 'ongoing';
                                  }
                                  await updateDoc(doc(db, 'matches', m.id), updates);
                                  showToast('Room credentials saved!', 'success');
                                }}
                                className="w-9 h-9 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-xl flex items-center justify-center shrink-0"
                                title="Quick Save"
                              >
                                <Save size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 mt-4">
                          <button
                            type="button"
                            onClick={() => handleOpenDeclareRoomModal(m)}
                            className="h-11 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#007AFF] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Key size={14} />
                            {hasRoomCreds ? 'Edit & Notify' : 'Declare Room'}
                          </button>

                          {m.status !== 'completed' ? (
                            <button
                              type="button"
                              onClick={() => handleDeclareResult(m)}
                              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all"
                            >
                              <Trophy size={14} />
                              Declare Result
                            </button>
                          ) : (
                            <div className="h-11 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 flex items-center justify-center gap-1.5">
                              <CheckCheck size={14} className="text-emerald-600" />
                              Result Declared
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.TRANSACTIONS && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Live Transaction Ledger
                </h4>
                <RefreshCw size={14} className="text-slate-400" />
              </div>

              <div className="bg-white border border-slate-200/80 rounded-[24px] divide-y divide-slate-100 shadow-xs overflow-hidden">
                {transactions.slice(0, 60).map((t) => {
                  const isCredit =
                    t.type === 'deposit' || t.type === 'refund' || t.type === 'win';
                  return (
                    <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isCredit
                              ? 'text-emerald-600 bg-emerald-50'
                              : 'text-rose-600 bg-rose-50'
                          }`}
                        >
                          {t.type === 'refund' ? (
                            <CheckCircle2 size={16} />
                          ) : isCredit ? (
                            <Plus size={16} />
                          ) : (
                            <Minus size={16} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-extrabold text-slate-900 uppercase truncate">
                            {t.title || t.type}
                          </h4>
                          <p className="text-[11px] text-slate-400 font-mono">
                            ID: {t.id?.slice(0, 10)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-sm font-extrabold tabular-nums ${
                            isCredit ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isCredit ? '+' : '-'}₹{t.amount}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400">
                          {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.RULES && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <ListChecks size={18} className="text-[#007AFF]" />
                    Game Mode Regulations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Customize fair play rules synced directly to player screens
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddSectionModalOpen(true)}
                  className="px-4 py-2 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <PlusCircle size={14} />
                  Add Section
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {allAvailableRuleSections.map((sec) => {
                  const isActive = activeRuleTab === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setActiveRuleTab(sec.id)}
                      className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border flex items-center gap-2 ${
                        isActive
                          ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      <span>{sec.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold tabular-nums ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {sec.rulesCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Section Title</label>
                    <input
                      type="text"
                      value={activeSectionTitle}
                      onChange={(e) => setActiveSectionTitle(e.target.value)}
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Category Tag</label>
                    <input
                      type="text"
                      value={activeSectionCategory}
                      onChange={(e) => setActiveSectionCategory(e.target.value)}
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setRuleEditMode('interactive')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        ruleEditMode === 'interactive'
                          ? 'bg-white text-[#007AFF] shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Interactive ({ruleList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRuleEditMode('raw')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        ruleEditMode === 'raw'
                          ? 'bg-white text-[#007AFF] shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Multi-line Text
                    </button>
                  </div>

                  <div className="relative group">
                    <button
                      type="button"
                      className="text-xs font-bold text-[#007AFF] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl flex items-center gap-1"
                    >
                      <Sparkles size={13} />
                      Load Preset
                    </button>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-2xl p-1.5 shadow-xl z-20 w-52 space-y-1">
                      {Object.keys(RULE_PRESETS).map((pKey) => (
                        <button
                          key={pKey}
                          type="button"
                          onClick={() => handleApplyPresetTemplate(pKey)}
                          className="text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#007AFF] transition-colors"
                        >
                          {RULE_PRESETS[pKey].title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {ruleEditMode === 'interactive' ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a new rule item..."
                        value={newSingleRuleText}
                        onChange={(e) => setNewSingleRuleText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSingleRule();
                          }
                        }}
                        className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-medium text-slate-900 outline-none focus:border-[#007AFF]"
                      />
                      <button
                        type="button"
                        onClick={handleAddSingleRule}
                        className="px-4 h-11 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-xl text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1 no-scrollbar">
                      {ruleList.length === 0 ? (
                        <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                          <p className="text-xs font-bold text-slate-500">
                            No rules in this section yet
                          </p>
                        </div>
                      ) : (
                        ruleList.map((r, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-2.5"
                          >
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-[#007AFF] text-[11px] font-extrabold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={r}
                              onChange={(e) => {
                                const updated = [...ruleList];
                                updated[idx] = e.target.value;
                                setRuleList(updated);
                                setRuleText(updated.join('\n'));
                              }}
                              className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 font-medium outline-none py-1"
                            />
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleMoveRule(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1.5 text-slate-400 hover:text-[#007AFF] disabled:opacity-25"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveRule(idx, 'down')}
                                disabled={idx === ruleList.length - 1}
                                className="p-1.5 text-slate-400 hover:text-[#007AFF] disabled:opacity-25"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleRule(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500">
                      One rule per line ({ruleText.split('\n').filter((r) => r.trim()).length}{' '}
                      lines)
                    </p>
                    <textarea
                      value={ruleText}
                      onChange={(e) => {
                        setRuleText(e.target.value);
                        setRuleList(e.target.value.split('\n').filter((r) => r.trim()));
                      }}
                      className="w-full h-72 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono text-slate-800 outline-none focus:border-[#007AFF] leading-relaxed resize-none"
                    />
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveCurrentSectionRules}
                    disabled={isProcessing}
                    className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider shadow-sm flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Save "{activeSectionTitle}" Regulations
                  </button>

                  {!['battle_royale', 'clash_squad', 'lone_wolf'].includes(activeRuleTab) && (
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteCustomSectionRules(activeRuleTab, activeSectionTitle)
                      }
                      disabled={isProcessing}
                      className="w-full py-2 text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={13} />
                      Delete Custom Section Rules
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.REFERRAL && (
            <motion.div
              key="referral"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-5"
            >
              {/* Referral Engine */}
              <div className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-[24px] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-slate-900">Referral Engine</h3>
                  <Copy size={17} className="text-[#007AFF]" />
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block">
                      Base Referral URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://kingsreload.in"
                      value={appSettings?.referral?.baseUrl || ''}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          referral: { ...appSettings?.referral, baseUrl: e.target.value },
                        })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block">
                      Per Referral Reward (₹)
                    </label>
                    <input
                      type="number"
                      value={appSettings?.referral?.perReferralReward || 0}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          referral: {
                            ...appSettings?.referral,
                            perReferralReward: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] tabular-nums"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block">Reward Type</label>
                    <select
                      value={appSettings?.referral?.rewardType || 'deposit'}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          referral: { ...appSettings?.referral, rewardType: e.target.value },
                        })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                    >
                      <option value="deposit">Deposit Only</option>
                      <option value="bonus">Bonus Only</option>
                      <option value="both">Both (Split)</option>
                    </select>
                  </div>

                  {appSettings?.referral?.rewardType === 'both' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 block">Deposit %</label>
                        <input
                          type="number"
                          value={appSettings?.referral?.depositPercentage || 50}
                          onChange={(e) =>
                            setAppSettings({
                              ...appSettings,
                              referral: {
                                ...appSettings?.referral,
                                depositPercentage: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 block">Bonus %</label>
                        <input
                          type="number"
                          value={appSettings?.referral?.bonusPercentage || 50}
                          onChange={(e) =>
                            setAppSettings({
                              ...appSettings,
                              referral: {
                                ...appSettings?.referral,
                                bonusPercentage: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block">
                      New User Reward (₹)
                    </label>
                    <input
                      type="number"
                      value={appSettings?.referral?.newUserReward || 0}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          referral: {
                            ...appSettings?.referral,
                            newUserReward: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider shadow-xs flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save Referral Configuration
                </button>
              </div>

              {/* Customer Support */}
              <div className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-[24px] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-slate-900">Support Channels</h3>
                  <UsersIcon size={17} className="text-[#007AFF]" />
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block">WhatsApp Link</label>
                    <input
                      type="text"
                      placeholder="https://wa.me/..."
                      value={appSettings?.support?.whatsapp || ''}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          support: { ...appSettings?.support, whatsapp: e.target.value },
                        })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block">Telegram Link</label>
                    <input
                      type="text"
                      placeholder="https://t.me/..."
                      value={appSettings?.support?.telegram || ''}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          support: { ...appSettings?.support, telegram: e.target.value },
                        })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block">Support Email</label>
                    <input
                      type="email"
                      placeholder="support@kingsreload.com"
                      value={appSettings?.support?.email || ''}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          support: { ...appSettings?.support, email: e.target.value },
                        })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider shadow-xs flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Update Support Links
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.BANNERS && (
            <motion.div
              key="banners"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
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
                className="w-full sm:w-auto px-6 h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl flex items-center justify-center gap-2 shadow-sm text-xs font-extrabold uppercase tracking-wider"
              >
                <Plus size={18} />
                Add Promotion Banner
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {banners
                  .filter((b) => b.isActive !== false)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="p-4 bg-white border border-slate-200/80 rounded-[24px] shadow-xs"
                    >
                      <div className="relative aspect-video rounded-2xl overflow-hidden mb-3.5 border border-slate-200">
                        <SafeImage src={b.imageUrl} alt="" className="w-full h-full object-cover" />
                        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200 flex items-center gap-1.5 z-20">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              b.type === 'main' || b.type === 'offer'
                                ? 'bg-emerald-500'
                                : 'bg-[#007AFF]'
                            }`}
                          />
                          <span className="text-[10px] font-extrabold uppercase text-slate-800">
                            {b.type}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-500 tabular-nums">
                            Order: {b.order}
                          </p>
                          {b.redirectUrl && (
                            <p className="text-xs font-medium text-[#007AFF] truncate max-w-[180px]">
                              {b.redirectUrl}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBanner(b);
                              setImageUrl(b.imageUrl);
                              setRedirectUrl(b.redirectUrl || '');
                              setBannerType(b.type);
                              setBannerOrder(b.order);
                              setIsBannerModalOpen(true);
                            }}
                            className="w-9 h-9 bg-blue-50 text-[#007AFF] rounded-xl hover:bg-[#007AFF] hover:text-white flex items-center justify-center transition-colors"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBanner(b.id!)}
                            disabled={deletingBannerId === b.id}
                            className="w-9 h-9 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                          >
                            {deletingBannerId === b.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.PAYMENT && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="p-5 bg-white border border-blue-200/80 rounded-[24px] flex items-center justify-between shadow-xs">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Payment Gateways</h3>
                  <p className="text-xs font-medium text-slate-500">
                    Configure & activate ZapUPI, Cashfree, Razorpay, or custom UPI
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingGateway(null);
                    setGatewayForm({
                      name: '',
                      apiKey: '',
                      secretKey: '',
                      merchantId: '',
                      webhookSecret: '',
                      upiId: '',
                    });
                    setIsGatewayModalOpen(true);
                  }}
                  className="w-11 h-11 bg-[#007AFF] hover:bg-[#0066D6] rounded-2xl text-white flex items-center justify-center shadow-xs"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['razorpay', 'cashfree', 'transupi', 'zapupi', 'custom'].map((gId) => {
                  const gateway = paymentGateways.find((g) => g.id === gId);
                  const isConfigured = !!gateway;
                  const isActive = gateway?.isActive || false;

                  return (
                    <div
                      key={gId}
                      className={`p-5 bg-white border rounded-[24px] shadow-xs transition-all ${
                        isActive ? 'border-[#007AFF] ring-2 ring-[#007AFF]/10' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              isActive
                                ? 'bg-[#007AFF] text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <DollarSign size={18} />
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold uppercase text-slate-900">
                              {gateway?.name || gId.toUpperCase()}
                            </h4>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] font-bold ${
                                  isConfigured ? 'text-emerald-600' : 'text-slate-400'
                                }`}
                              >
                                {isConfigured ? 'Configured' : 'Not Configured'}
                              </span>
                              {isActive && (
                                <span className="text-[10px] font-extrabold uppercase text-[#007AFF] bg-blue-50 px-2 py-0.5 rounded-full">
                                  Active
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGateway(
                                gateway || { id: gId, name: gId.toUpperCase(), isActive: false }
                              );
                              setGatewayForm({
                                name: gateway?.name || gId.toUpperCase(),
                                apiKey: gateway?.apiKey || '',
                                secretKey: gateway?.secretKey || '',
                                merchantId: gateway?.merchantId || '',
                                webhookSecret: gateway?.webhookSecret || '',
                                upiId: gateway?.upiId || '',
                              });
                              setIsGatewayModalOpen(true);
                            }}
                            className="p-2 text-slate-500 hover:text-[#007AFF]"
                          >
                            <Settings size={17} />
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing || !isConfigured}
                            onClick={() => handleToggleGateway(gId, isActive)}
                            className={`w-12 h-7 rounded-full relative transition-colors ${
                              isActive ? 'bg-[#007AFF]' : 'bg-slate-300'
                            } ${!isConfigured ? 'opacity-40' : ''}`}
                          >
                            <span
                              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-xs transition-transform ${
                                isActive ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {isConfigured && (
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">
                              Merchant ID
                            </p>
                            <p className="font-semibold text-slate-700 truncate">
                              {gateway.merchantId || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">API Key</p>
                            <p className="font-semibold text-slate-700 truncate">
                              {gateway.apiKey ? '••••••••' : 'N/A'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* User Quick Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] p-6 border border-slate-200 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-extrabold text-slate-900">Manage Player</h3>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
                >
                  &times;
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-400">
                      Current Balance
                    </p>
                    <p className="text-xl font-extrabold text-emerald-600 tabular-nums">
                      ₹
                      {(selectedUser.wallet?.deposit || 0) +
                        (selectedUser.wallet?.winnings || 0) +
                        (selectedUser.wallet?.bonus || 0)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'deposit')}
                      className="w-10 h-10 bg-emerald-600 rounded-xl text-white flex items-center justify-center"
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'withdrawal')}
                      className="w-10 h-10 bg-rose-600 rounded-xl text-white flex items-center justify-center"
                    >
                      <Minus size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Account Safety</h4>
                    <p className="text-xs text-slate-500">
                      {selectedUser.isBanned ? 'User is Banned' : 'User is Active'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBanUser(selectedUser.id!, selectedUser.isBanned || false)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                      selectedUser.isBanned
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}
                  >
                    {selectedUser.isBanned ? <Unlock size={14} /> : <Ban size={14} />}
                    {selectedUser.isBanned ? 'Unban' : 'Ban User'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Password</h4>
                    <p className="text-xs text-slate-500">Send reset link</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleResetPassword(selectedUser.email)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Reset Password
                  </button>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <DetailRow label="Username" value={selectedUser.username} />
                  <DetailRow label="Email" value={selectedUser.email} />
                  <DetailRow label="Phone" value={selectedUser.phone || 'N/A'} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Match Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen.isOpen && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[60] flex items-center justify-center p-5">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-xs bg-white rounded-[26px] p-6 border border-slate-200 shadow-2xl text-center"
            >
              <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 mx-auto mb-3">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Delete Match?</h3>
              <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">
                This permanently removes the match and automatically refunds entry fees to all joined
                players.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen({ isOpen: false, matchId: '' })}
                  className="h-11 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={processDeleteMatch}
                  disabled={isProcessing}
                  className="h-11 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center justify-center"
                >
                  {isProcessing ? <Loader2 size={15} className="animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Result Modal */}
      <AnimatePresence>
        {isResultModalOpen && selectedMatchResults && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-lg bg-white rounded-[28px] p-6 border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Declare Match Result</h3>
                  <p className="text-xs text-slate-500">{selectedMatchResults.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResultModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 py-4">
                <div className="bg-blue-50/70 rounded-2xl p-4 border border-blue-200 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Format</p>
                    <p className="text-xs font-extrabold text-slate-900">
                      {selectedMatchResults.section === 'Battle Royale'
                        ? selectedMatchResults.prizeType === 'perKill'
                          ? 'Per Kill + Rank'
                          : 'Survival'
                        : selectedMatchResults.section}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Prize Pool</p>
                    <p className="text-xs font-extrabold text-emerald-700 tabular-nums">
                      {selectedMatchResults.section === 'Battle Royale'
                        ? selectedMatchResults.prizeType === 'perKill'
                          ? `₹${selectedMatchResults.perKillAmount}/kill`
                          : 'Rank Split'
                        : `₹${selectedMatchResults.prizePool}`}
                    </p>
                  </div>
                </div>

                {selectedMatchResults.playersCount === 0 ? (
                  <div className="text-center py-10">
                    <UsersIcon size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-xs font-bold text-slate-500">
                      No players joined this match yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(selectedMatchResults.players || []).map((player) => {
                      const playerKey = `${player.userId}_${player.slot}`;
                      const kills = playerResults[playerKey] || 0;
                      const rank = playerPositionResults[playerKey] || 0;
                      const killsReward = kills * (selectedMatchResults.perKillAmount || 0);
                      const posReward =
                        selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
                      const totalReward = killsReward + posReward;

                      return (
                        <div
                          key={playerKey}
                          className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div
                              onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, player.userId)}
                              className="flex items-center gap-3 cursor-pointer"
                            >
                              <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#007AFF] flex items-center justify-center font-extrabold text-xs tabular-nums">
                                #{player.slot || 1}
                              </div>
                              <div>
                                <h4 className="text-xs font-extrabold text-slate-900">
                                  {player.ign || player.username}
                                </h4>
                                <p className="text-[11px] text-slate-500">{player.username}</p>
                              </div>
                            </div>
                            {totalReward > 0 && (
                              <div className="text-right">
                                <p className="text-xs font-extrabold text-emerald-600 tabular-nums">
                                  ₹{totalReward}
                                </p>
                                <p className="text-[10px] text-slate-400">Winnings</p>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 block">
                                {selectedMatchResults.section === 'Battle Royale'
                                  ? selectedMatchResults.prizeType === 'perKill'
                                    ? 'Kills'
                                    : 'Rank'
                                  : 'Rank (1=Win)'}
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                value={playerResults[playerKey] || ''}
                                onChange={(e) =>
                                  setPlayerResults({
                                    ...playerResults,
                                    [playerKey]: Number(e.target.value),
                                  })
                                }
                                className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF] tabular-nums"
                              />
                            </div>

                            {selectedMatchResults.prizeType === 'perKill' && (
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 block">
                                  Rank (Optional)
                                </label>
                                <select
                                  value={rank}
                                  onChange={(e) =>
                                    setPlayerPositionResults({
                                      ...playerPositionResults,
                                      [playerKey]: Number(e.target.value),
                                    })
                                  }
                                  className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF]"
                                >
                                  <option value={0}>No Rank</option>
                                  {Array.from({
                                    length: selectedMatchResults.positionWinnersCount || 0,
                                  }).map((_, idx) => (
                                    <option key={idx + 1} value={idx + 1}>
                                      Rank {idx + 1}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSubmitResult}
                disabled={isProcessing || selectedMatchResults.playersCount === 0}
                className="w-full mt-3 h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  'Finalize & Credit Winnings'
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Banner Modal */}
      <AnimatePresence>
        {isBannerModalOpen && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-[28px] p-6 border border-slate-200 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingBanner ? 'Edit Banner' : 'New Banner'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsBannerModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">Banner Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['main', 'offer', 'freefire'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setBannerType(t as any)}
                        className={`py-2.5 rounded-xl text-xs font-bold uppercase border ${
                          bannerType === t
                            ? 'bg-[#007AFF] border-[#007AFF] text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 block">Banner Image</label>
                  {imageUrl ? (
                    <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-200">
                      <SafeImage src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-2 right-2 px-3 py-1.5 bg-white/95 text-slate-900 text-xs font-bold rounded-full shadow-sm"
                      >
                        Change Image
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 hover:border-[#007AFF] bg-slate-50"
                    >
                      {isUploading ? (
                        <Loader2 size={24} className="text-[#007AFF] animate-spin" />
                      ) : (
                        <>
                          <Upload size={22} className="text-[#007AFF]" />
                          <p className="text-xs font-bold text-slate-600">Upload Banner Image</p>
                        </>
                      )}
                    </button>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />

                  {isUploading && (
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#007AFF]"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>

                {(bannerType === 'main' || bannerType === 'offer') && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 block">
                      Redirect URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={redirectUrl}
                      onChange={(e) => setRedirectUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-medium outline-none focus:border-[#007AFF]"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">Display Order</label>
                  <input
                    type="number"
                    value={bannerOrder}
                    onChange={(e) => setBannerOrder(Number(e.target.value))}
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] tabular-nums"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveBanner}
                  disabled={isProcessing || isUploading || !imageUrl}
                  className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing || isUploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {isUploading ? 'Uploading...' : editingBanner ? 'Update Banner' : 'Publish Banner'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Gateway Modal */}
      <AnimatePresence>
        {isGatewayModalOpen && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-[28px] p-6 border border-slate-200 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingGateway ? 'Gateway Settings' : 'Add Gateway'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsGatewayModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">Gateway Name</label>
                  <input
                    type="text"
                    value={gatewayForm.name}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })}
                    placeholder="ZapUPI, Cashfree, Razorpay"
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 block">Merchant ID</label>
                    <input
                      type="text"
                      value={gatewayForm.merchantId}
                      onChange={(e) =>
                        setGatewayForm({ ...gatewayForm, merchantId: e.target.value })
                      }
                      placeholder="MID..."
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 block">
                      UPI ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={gatewayForm.upiId}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, upiId: e.target.value })}
                      placeholder="merchant@upi"
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">API Key</label>
                  <input
                    type="password"
                    value={gatewayForm.apiKey}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, apiKey: e.target.value })}
                    placeholder="Public API Key"
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">
                    Secret Key / Token
                  </label>
                  <input
                    type="password"
                    value={gatewayForm.secretKey}
                    onChange={(e) =>
                      setGatewayForm({ ...gatewayForm, secretKey: e.target.value })
                    }
                    placeholder="Secret Key"
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">
                    Webhook Secret (Optional)
                  </label>
                  <input
                    type="password"
                    value={gatewayForm.webhookSecret}
                    onChange={(e) =>
                      setGatewayForm({ ...gatewayForm, webhookSecret: e.target.value })
                    }
                    placeholder="Webhook Secret"
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveGateway}
                  disabled={isProcessing}
                  className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 mt-2"
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save Configuration
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Room Credentials Modal */}
      <AnimatePresence>
        {isDeclareRoomModalOpen && selectedDeclareRoomMatch && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              className="w-full max-w-md bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                    <Key size={19} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Publish Room Credentials
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedDeclareRoomMatch.displayId || selectedDeclareRoomMatch.id.slice(0, 6)}{' '}
                      • {selectedDeclareRoomMatch.title}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDeclareRoomModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 py-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">
                    Custom Room ID *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={declareRoomForm.roomId}
                      onChange={(e) =>
                        setDeclareRoomForm({ ...declareRoomForm, roomId: e.target.value })
                      }
                      placeholder="e.g. 19284752"
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-mono font-bold text-slate-900 outline-none focus:border-[#007AFF]"
                    />
                    {declareRoomForm.roomId && (
                      <button
                        type="button"
                        onClick={() => handleCopyCredential(declareRoomForm.roomId, 'modal_room')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#007AFF]"
                      >
                        {copiedKey === 'modal_room' ? (
                          <Check size={14} className="text-emerald-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">
                    Room Password *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={declareRoomForm.roomPassword}
                      onChange={(e) =>
                        setDeclareRoomForm({ ...declareRoomForm, roomPassword: e.target.value })
                      }
                      placeholder="e.g. 1234"
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-mono font-bold text-slate-900 outline-none focus:border-[#007AFF]"
                    />
                    {declareRoomForm.roomPassword && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCredential(declareRoomForm.roomPassword, 'modal_pass')
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#007AFF]"
                      >
                        {copiedKey === 'modal_pass' ? (
                          <Check size={14} className="text-emerald-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDeclareRoomForm({ ...declareRoomForm, setStatusLive: true })
                    }
                    className={`py-2.5 rounded-xl text-xs font-bold border ${
                      declareRoomForm.setStatusLive
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    Mark Live / Ongoing
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeclareRoomForm({ ...declareRoomForm, setStatusLive: false })
                    }
                    className={`py-2.5 rounded-xl text-xs font-bold border ${
                      !declareRoomForm.setStatusLive
                        ? 'bg-blue-50 border-blue-300 text-[#007AFF]'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    Keep Status
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setDeclareRoomForm({
                      ...declareRoomForm,
                      sendNotificationOnRoomDeclare: !declareRoomForm.sendNotificationOnRoomDeclare,
                    })
                  }
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-left ${
                    declareRoomForm.sendNotificationOnRoomDeclare
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        declareRoomForm.sendNotificationOnRoomDeclare
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      <Bell size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Auto Push Notification</p>
                      <p className="text-[11px] text-slate-500">
                        Alert all joined players instantly
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      declareRoomForm.sendNotificationOnRoomDeclare
                        ? 'bg-[#007AFF] border-[#007AFF] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {declareRoomForm.sendNotificationOnRoomDeclare && <Check size={12} />}
                  </div>
                </button>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleSaveDeclareRoom}
                  disabled={isProcessing}
                  className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Publish Room Credentials
                </button>

                {(selectedDeclareRoomMatch.roomId || selectedDeclareRoomMatch.roomPassword) && (
                  <button
                    type="button"
                    onClick={() => handleClearRoomCredentials(selectedDeclareRoomMatch.id)}
                    disabled={isProcessing}
                    className="w-full py-2 text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Trash2 size={13} />
                    Clear Credentials
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Section Rules Modal */}
      <AnimatePresence>
        {isAddSectionModalOpen && (
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Create Mode Section Rules
                    </h3>
                    <p className="text-xs text-slate-500">Tailored regulations for a section</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddSectionModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 py-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">Section Name *</label>
                  <input
                    type="text"
                    value={newSectionForm.title}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, title: e.target.value })}
                    placeholder="e.g. Clash Squad 2v2"
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">Category Tag</label>
                  <input
                    type="text"
                    value={newSectionForm.category}
                    onChange={(e) =>
                      setNewSectionForm({ ...newSectionForm, category: e.target.value })
                    }
                    placeholder="e.g. Custom Tournament"
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 block">Starter Preset</label>
                  <select
                    value={newSectionForm.template}
                    onChange={(e) =>
                      setNewSectionForm({ ...newSectionForm, template: e.target.value })
                    }
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#007AFF]"
                  >
                    {Object.keys(RULE_PRESETS).map((pKey) => (
                      <option key={pKey} value={pKey}>
                        {RULE_PRESETS[pKey].title} ({RULE_PRESETS[pKey].rules.length} rules)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddNewSectionSubmit}
                disabled={isProcessing}
                className="w-full h-12 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <PlusCircle size={16} />
                )}
                Create Section & Rules
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: any;
  accent: 'blue' | 'sky' | 'amber' | 'emerald';
}) {
  const accentMap = {
    blue: 'bg-blue-50 text-[#007AFF]',
    sky: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="bg-white border border-slate-200/80 rounded-[22px] p-4 shadow-xs flex flex-col justify-between">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accentMap[accent]}`}>
        <Icon size={18} />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5 truncate">
        {value}
      </p>
    </div>
  );
}

function HealthBar({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
        {status}
      </span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/70 last:border-b-0">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      <span className="text-xs font-bold text-slate-900">{value}</span>
    </div>
  );
}
