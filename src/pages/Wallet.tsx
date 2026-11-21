import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet as WalletIcon,
  Plus,
  ArrowRightFromLine,
  ChevronRight,
  ArrowDown,
  Loader2,
  History,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';
import { Page, User, Transaction } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { APP_MEDIA } from '../assets/media';

interface WalletPageProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function WalletPage({ user, onPageChange }: WalletPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingOrder, setVerifyingOrder] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'timeout' | null>(null);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementFilter, setStatementFilter] = useState<'all' | 'deposit' | 'withdraw' | 'match'>('all');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment') as any;
    const orderId = params.get('order_id');

    if (status) {
      setPaymentStatus(status);
      setTimeout(() => setPaymentStatus(null), 10000);
    }

    if (orderId) {
      setVerifyingOrder(orderId);
      setTimeout(() => setVerifyingOrder(null), 15000);
    }

    if (status || orderId) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const txs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(txs);
        setLoading(false);

        if (verifyingOrder) {
          const found = txs.find((t) => t.id === verifyingOrder && t.status === 'completed');
          if (found) {
            setVerifyingOrder(null);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [verifyingOrder]);

  const totalBalance =
    (user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0);

  const formatTransactionDate = (createdAt: any) => {
    if (!createdAt) return 'Recent';
    try {
      let date: Date;
      if (typeof createdAt?.toDate === 'function') {
        date = createdAt.toDate();
      } else if (createdAt?.seconds) {
        date = new Date(createdAt.seconds * 1000);
      } else {
        date = new Date(createdAt);
      }
      if (!date || isNaN(date.getTime())) return 'Recent';

      const month = date.toLocaleString('en-US', { month: 'short' });
      const day = date.getDate();
      const time = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${month} ${day} • ${time}`;
    } catch {
      return 'Recent';
    }
  };

  const isCredit = (tx: Transaction) => {
    return (
      tx.type === 'deposit' ||
      tx.type === 'win' ||
      tx.type === 'refund' ||
      (tx.type as any) === 'bonus' ||
      (tx.type as any) === 'referral'
    );
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (statementFilter === 'all') return true;
    if (statementFilter === 'deposit') return tx.type === 'deposit';
    if (statementFilter === 'withdraw') return tx.type === 'withdraw';
    if (statementFilter === 'match') return tx.type === 'entry' || tx.type === 'win';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 space-y-5">
        {/* Top White iOS Header Card */}
        <header className="bg-white border border-slate-200/80 rounded-[24px] p-3.5 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-slate-200 shrink-0">
              <img
                src={APP_MEDIA.emblem}
                alt="KINGS RELOAD"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
                Wallet Vault
              </span>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 leading-none mt-0.5">
                KINGS <span className="text-[#007AFF]">RELOAD</span>
              </h1>
            </div>
          </div>

          <div className="bg-[#F4F6FA] border border-slate-200 rounded-2xl px-3.5 py-2 flex items-center gap-2">
            <WalletIcon size={16} className="text-[#007AFF]" />
            <span className="text-sm font-extrabold text-slate-900 tabular-nums">
              ₹{totalBalance.toLocaleString()}
            </span>
          </div>
        </header>

        {/* Payment Alerts */}
        <AnimatePresence>
          {paymentStatus && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-xs ${
                paymentStatus === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  paymentStatus === 'success'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-rose-100 text-rose-600'
                }`}
              >
                {paymentStatus === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold">
                  {paymentStatus === 'success'
                    ? 'Payment Successful'
                    : paymentStatus === 'failed'
                    ? 'Payment Failed'
                    : 'Payment Timed Out'}
                </p>
                <p className="text-[11px] opacity-80">
                  {paymentStatus === 'success'
                    ? 'Your wallet balance has been credited.'
                    : 'There was an issue processing your payment.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentStatus(null)}
                className="text-xs font-bold px-2.5 py-1 bg-white/80 rounded-lg"
              >
                Dismiss
              </button>
            </motion.div>
          )}

          {verifyingOrder && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3"
            >
              <Loader2 size={16} className="text-[#007AFF] animate-spin shrink-0" />
              <p className="text-xs font-bold text-[#007AFF]">Verifying payment status...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Total Balance Hero Card */}
        <div className="bg-white border border-slate-200/80 rounded-[28px] p-6 text-center shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Total Balance
          </p>
          <h3 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 my-2 tabular-nums">
            ₹{totalBalance.toLocaleString()}
          </h3>

          <div className="border-b border-slate-100 my-5" />

          <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
            <div className="px-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Deposit
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[#007AFF] tabular-nums">
                ₹{(user.wallet?.deposit || 0).toLocaleString()}
              </span>
            </div>
            <div className="px-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Winnings
              </span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-600 tabular-nums">
                ₹{(user.wallet?.winnings || 0).toLocaleString()}
              </span>
            </div>
            <div className="px-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Bonus
              </span>
              <span className="text-sm sm:text-base font-extrabold text-sky-600 tabular-nums">
                ₹{(user.wallet?.bonus || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onPageChange(Page.ADD_MONEY)}
            className="min-h-[52px] bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
          >
            <Plus size={18} />
            <span>Add Money</span>
          </button>

          <button
            type="button"
            onClick={() => onPageChange(Page.WITHDRAW)}
            className="min-h-[52px] bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition-all shadow-xs"
          >
            <ArrowRightFromLine size={18} className="text-[#007AFF]" />
            <span>Withdraw Winnings</span>
          </button>
        </div>

        {/* Recent History */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h4 className="text-sm font-extrabold text-slate-900">Recent Transactions</h4>
            <button
              type="button"
              onClick={() => setShowStatementModal(true)}
              className="text-xs font-bold text-[#007AFF] flex items-center gap-1"
            >
              <span>Statement</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-2.5">
            {loading ? (
              <div className="py-12 bg-white border border-slate-200/80 rounded-[24px] flex flex-col items-center justify-center">
                <Loader2 size={24} className="text-[#007AFF] animate-spin mb-2" />
                <p className="text-xs font-semibold text-slate-500">Loading history...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-12 bg-white border border-slate-200/80 rounded-[24px] text-center p-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <History size={22} />
                </div>
                <p className="text-sm font-bold text-slate-800">No Transactions Yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Deposits, withdrawals, and entry fees will appear here.
                </p>
              </div>
            ) : (
              transactions.map((tx) => {
                const credit = isCredit(tx);
                const isPending = tx.status === 'pending';
                const isCompleted = tx.status === 'completed';

                return (
                  <div
                    key={tx.id}
                    className="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-2">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${
                          credit
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {credit ? '₹' : <ArrowDown size={17} />}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {tx.title || tx.type.replace('_', ' ')}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                          {formatTransactionDate(tx.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-extrabold tabular-nums ${
                          credit ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {credit ? '+' : '-'}₹{tx.amount}
                      </p>
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          isPending
                            ? 'text-amber-600'
                            : isCompleted
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {tx.status || 'completed'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Statement Modal */}
      <AnimatePresence>
        {showStatementModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowStatementModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white rounded-t-[30px] sm:rounded-[30px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Account Statement</h3>
                    <p className="text-[11px] font-medium text-slate-500">
                      {transactions.length} transactions
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStatementModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'deposit', label: 'Deposits' },
                  { id: 'withdraw', label: 'Withdrawals' },
                  { id: 'match', label: 'Tournaments' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatementFilter(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      statementFilter === tab.id
                        ? 'bg-[#007AFF] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-4 overflow-y-auto space-y-2 flex-1 max-h-[50vh]">
                {filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center text-xs font-semibold text-slate-400">
                    No matching transactions.
                  </div>
                ) : (
                  filteredTransactions.map((tx) => {
                    const credit = isCredit(tx);
                    return (
                      <div
                        key={tx.id}
                        className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-900 truncate">{tx.title || tx.type}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {formatTransactionDate(tx.createdAt)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`font-extrabold tabular-nums ${
                              credit ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {credit ? '+' : '-'}₹{tx.amount}
                          </p>
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            {tx.status}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowStatementModal(false)}
                  className="w-full min-h-[46px] bg-[#007AFF] text-white rounded-2xl font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
