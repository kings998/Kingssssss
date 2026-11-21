import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useParams, useNavigate } from 'react-router-dom';
import { Page, User, UserRole, Transaction, Wallet } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getEffectiveRole, getRoleBadgeMeta, isAdminIdentity } from '../constants';
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  ChevronLeft,
  Shield,
  ShieldAlert,
  Wallet as WalletIcon,
  Trophy,
  History,
  Plus,
  Minus,
  User as UserIcon,
  Mail,
  Phone,
  Crown,
} from 'lucide-react';
import { useIosFeedback } from '../components/IosFeedback';

interface AdminUserDetailProps {
  currentUser?: User | null;
  onPageChange: (page: Page, id?: string) => void;
}

export default function AdminUserDetail({ currentUser, onPageChange }: AdminUserDetailProps) {
  const { id: userId } = useParams();
  const navigate = useNavigate();
  const { showToast, confirmDialog } = useIosFeedback();
  const [userData, setUserData] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [joinedMatches, setJoinedMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceModal, setBalanceModal] = useState<{
    open: boolean;
    type: 'add' | 'deduct';
    walletType: keyof Wallet;
  } | null>(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      onPageChange(Page.ADMIN);
    }
  };

  useEffect(() => {
    if (!userId) return;

    const unsubscribeUser = onSnapshot(
      doc(db, 'users', userId),
      (docSnap) => {
        if (docSnap.exists()) {
          setUserData({ id: docSnap.id, ...docSnap.data() } as User);
        }
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${userId}`);
        setLoading(false);
      }
    );

    const qTransactions = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribeTransactions = onSnapshot(
      qTransactions,
      (snapshot) => {
        const txs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
        setTransactions(txs);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'transactions')
    );

    const fetchMatches = async () => {
      try {
        const qReg = query(collection(db, 'registrations'), where('userId', '==', userId));
        const regSnap = await getDocs(qReg);
        const matchIds = regSnap.docs.map((d) => d.data().tournamentId).filter(Boolean);

        if (matchIds.length > 0) {
          const qMatches = query(
            collection(db, 'matches'),
            where('__name__', 'in', matchIds.slice(0, 30))
          );
          const matchSnap = await getDocs(qMatches);
          const matches = matchSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setJoinedMatches(matches);
        }
      } catch (error) {
        console.error('Error fetching matches:', error);
      }
    };

    fetchMatches();

    return () => {
      unsubscribeUser();
      unsubscribeTransactions();
    };
  }, [userId]);

  const handleToggleBan = async () => {
    if (!userData || !userId) return;
    const newBanStatus = !userData.isBanned;
    const ok = await confirmDialog({
      title: newBanStatus ? 'Ban Player?' : 'Unban Player?',
      message: `${newBanStatus ? 'Restrict' : 'Restore'} account access for ${userData.username}?`,
      confirmText: newBanStatus ? 'Ban Account' : 'Unban Account',
      destructive: newBanStatus,
    });
    if (!ok) return;

    try {
      await updateDoc(doc(db, 'users', userId), {
        isBanned: newBanStatus,
      });
      showToast(newBanStatus ? 'Player banned.' : 'Player unbanned.', 'info');
    } catch (error) {
      showToast('Permission denied or failed to update status.', 'error');
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleUpdateBalance = async () => {
    if (!userData || !userId || !balanceModal || !amount) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Enter a valid amount.', 'error');
      return;
    }

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', userId);
      const newBalance =
        balanceModal.type === 'add'
          ? (userData.wallet?.[balanceModal.walletType] || 0) + numAmount
          : Math.max(0, (userData.wallet?.[balanceModal.walletType] || 0) - numAmount);

      batch.update(userRef, {
        [`wallet.${balanceModal.walletType}`]: newBalance,
      });

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        userId,
        type: balanceModal.type === 'add' ? 'deposit' : 'withdraw',
        amount: numAmount,
        status: 'completed',
        title: reason || `Admin ${balanceModal.type} balance (${balanceModal.walletType})`,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setBalanceModal(null);
      setAmount('');
      setReason('');
      showToast('Wallet balance updated!', 'success');
    } catch (error) {
      showToast('Failed to adjust wallet balance.', 'error');
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] pt-24 px-4 text-center">
        <p className="text-slate-600 font-semibold">User not found.</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 px-5 py-2.5 bg-[#007AFF] text-white rounded-full text-xs font-bold"
        >
          Go Back
        </button>
      </div>
    );
  }

  const effectiveRole = getEffectiveRole(userData);
  const roleBadge = getRoleBadgeMeta(effectiveRole);

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28">
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900">Player Inspector</h1>
            <p className="text-[11px] font-medium text-slate-500">Account & Wallet Control</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* User Info Card */}
        <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 sm:p-6 shadow-xs">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-center text-[#007AFF] shrink-0">
                <UserIcon size={26} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-extrabold text-slate-900 truncate">
                    {userData.username}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${roleBadge.lightPillClass}`}
                  >
                    {roleBadge.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">ID: {userId}</p>
                {userData.isBanned && (
                  <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-bold uppercase tracking-wider rounded-full border border-rose-200">
                    Account Banned
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleBan}
              title={userData.isBanned ? 'Unban User' : 'Ban User'}
              className={`p-3 rounded-2xl border transition-all shrink-0 ${
                userData.isBanned
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                  : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
              }`}
            >
              {userData.isBanned ? <Shield size={20} /> : <ShieldAlert size={20} />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
              <Mail size={16} className="text-[#007AFF] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Email Address
                </p>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                  {userData.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
              <Phone size={16} className="text-[#007AFF] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Phone Number
                </p>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                  {userData.phone || 'Not provided'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Role & Panel Access */}
        {!isAdminIdentity(userData.email, userId) && (
          <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Crown size={14} className="text-[#007AFF]" /> Role & Panel Access
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign Staff, Co-Owner, or Admin permissions for this account.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['user', 'staff', 'co_owner', 'admin'] as UserRole[])
                .filter(
                  (r) => getEffectiveRole(currentUser) === 'admin' || r === 'user' || r === 'staff'
                )
                .map((roleOption) => {
                  const active = effectiveRole === roleOption;
                  return (
                    <button
                      key={roleOption}
                      type="button"
                      onClick={async () => {
                        if (!userId) return;
                        try {
                          await updateDoc(doc(db, 'users', userId), {
                            role: roleOption,
                            isAdmin: roleOption === 'admin',
                          });
                          if (roleOption === 'user') {
                            await deleteDoc(doc(db, 'admins', userId)).catch(() => {});
                            if (userData.email) {
                              await deleteDoc(
                                doc(db, 'roleAssignments', userData.email.trim().toLowerCase())
                              ).catch(() => {});
                            }
                          } else {
                            await setDoc(doc(db, 'admins', userId), {
                              role: roleOption,
                              email: (userData.email || '').trim().toLowerCase(),
                              updatedAt: serverTimestamp(),
                            });
                          }
                          showToast(
                            `Role set to ${roleOption.replace('_', '-').toUpperCase()}`,
                            'success'
                          );
                        } catch (err) {
                          showToast('Permission denied to assign this role.', 'error');
                          handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
                        }
                      }}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
                        active
                          ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      {roleOption === 'user' ? 'Player' : roleOption.replace('_', '-')}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Wallet Breakdown */}
        <section className="space-y-2.5">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-2">
            Wallet Breakdown
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['deposit', 'winnings', 'bonus'] as (keyof Wallet)[]).map((type) => (
              <div
                key={type}
                className="bg-white border border-slate-200/80 rounded-[22px] p-4 flex items-center justify-between shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl text-[#007AFF] flex items-center justify-center">
                    <WalletIcon size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                      {type}
                    </p>
                    <p className="text-base font-extrabold text-slate-900 tabular-nums">
                      ₹{(userData.wallet?.[type] || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBalanceModal({ open: true, type: 'deduct', walletType: type })}
                    className="w-8 h-8 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 flex items-center justify-center transition-colors"
                    title={`Deduct from ${type}`}
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalanceModal({ open: true, type: 'add', walletType: type })}
                    className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 flex items-center justify-center transition-colors"
                    title={`Add to ${type}`}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs">
            <Trophy size={20} className="text-amber-500 mb-2" />
            <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              Matches Played
            </p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
              {userData.stats?.matchesPlayed || 0}
            </p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs">
            <History size={20} className="text-[#007AFF] mb-2" />
            <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              Recent Entries
            </p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
              {joinedMatches.length}
            </p>
          </div>
        </div>

        {/* Joined Matches List */}
        <section className="space-y-2.5">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-2">
            Recent Joined Matches
          </h3>
          {joinedMatches.length > 0 ? (
            <div className="space-y-2.5">
              {joinedMatches.map((match) => (
                <div
                  key={match.id}
                  className="bg-white border border-slate-200/80 rounded-[20px] p-4 flex items-center justify-between shadow-xs"
                >
                  <div>
                    <p className="text-[11px] font-extrabold text-[#007AFF] uppercase">
                      {match.section}
                    </p>
                    <h4 className="text-sm font-bold text-slate-900">{match.title}</h4>
                    <p className="text-xs text-slate-500">{match.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-slate-900 tabular-nums">
                      ₹{match.entryFee}
                    </p>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        match.status === 'completed' ? 'text-emerald-600' : 'text-[#007AFF]'
                      }`}
                    >
                      {match.status || 'Active'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-[20px] p-8 text-center">
              <p className="text-xs font-medium text-slate-500">No matches joined yet.</p>
            </div>
          )}
        </section>

        {/* Transaction History */}
        <section className="space-y-2.5">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-2">
            Transaction History
          </h3>
          <div className="bg-white border border-slate-200/80 rounded-[24px] divide-y divide-slate-100 shadow-xs overflow-hidden">
            {transactions.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No transactions yet.</p>
            ) : (
              transactions.map((tx) => {
                const isCredit = tx.type === 'deposit' || tx.type === 'win' || tx.type === 'refund';
                return (
                  <div key={tx.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isCredit
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {isCredit ? <Plus size={15} /> : <Minus size={15} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate">
                          {tx.title || tx.type.toUpperCase()}
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Recent'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-extrabold tabular-nums ${
                          isCredit ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isCredit ? '+' : '-'}₹{tx.amount}
                      </p>
                      <p
                        className={`text-[10px] font-bold uppercase ${
                          tx.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        {tx.status}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Balance Modal */}
      {balanceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
            onClick={() => setBalanceModal(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl"
          >
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                balanceModal.type === 'add'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {balanceModal.type === 'add' ? <Plus size={24} /> : <Minus size={24} />}
            </div>

            <h2 className="text-lg font-extrabold text-slate-900">
              {balanceModal.type === 'add' ? 'Add' : 'Deduct'} Balance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-5">
              Adjusting <span className="font-bold uppercase">{balanceModal.walletType}</span> for{' '}
              {userData.username}
            </p>

            <div className="space-y-3.5 mb-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Amount (₹)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#007AFF] tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 ml-1 block">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Winning Prize"
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#007AFF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBalanceModal(null)}
                className="h-11 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateBalance}
                disabled={!amount}
                className={`h-11 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${
                  balanceModal.type === 'add'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
