import { useState, useEffect } from 'react';
import { ChevronLeft, Landmark, Banknote, ShieldAlert, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Page, User, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, increment, runTransaction, collection, serverTimestamp } from 'firebase/firestore';
import { paymentService } from '../services/paymentService';
import { useIosFeedback } from '../components/IosFeedback';

interface WithdrawProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function Withdraw({ user, onPageChange }: WithdrawProps) {
  const { showToast } = useIosFeedback();
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      setActiveGateway(g);
    };
    fetch();
  }, []);

  const handleWithdraw = async () => {
    if (!auth.currentUser || !amount) return;
    const value = parseInt(amount, 10);
    if (isNaN(value) || value < 100 || value > (user.wallet?.winnings || 0)) return;

    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await runTransaction(db, async (transaction) => {
        const uSnap = await transaction.get(userRef);
        if (!uSnap.exists()) throw new Error('User not found');

        const userData = uSnap.data() as User;
        const currentWinnings = userData.wallet?.winnings || 0;

        if (currentWinnings < value) throw new Error('Insufficient winnings balance');

        transaction.update(userRef, {
          'wallet.winnings': increment(-value),
        });

        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: auth.currentUser!.uid,
          type: 'withdraw',
          amount: value,
          status: 'pending',
          title: `Withdrawal via ${activeGateway?.name || 'Bank Transfer'}`,
          createdAt: serverTimestamp(),
        });
      });
      showToast('Withdrawal request submitted!', 'success');
      onPageChange(Page.WALLET);
    } catch (error: any) {
      showToast(error.message || 'Withdrawal failed', 'error');
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const winningsBalance = user.wallet?.winnings || 0;
  const numericAmount = parseInt(amount, 10);
  const canSubmit = !loading && !isNaN(numericAmount) && numericAmount >= 100 && numericAmount <= winningsBalance;

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-24 select-none">
      {/* Frosted iOS Top Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPageChange(Page.WALLET)}
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
            aria-label="Back to Wallet"
          >
            <ChevronLeft size={20} />
          </button>

          <h1 className="text-base font-extrabold text-slate-900">Withdraw Winnings</h1>

          <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700">
            <ShieldCheck size={13} />
            <span>Verified</span>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Balance & Input Card */}
        <section className="bg-white border border-slate-200/80 rounded-[28px] p-6 text-center shadow-xs">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-[#007AFF] mx-auto mb-4">
            <Banknote size={28} />
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Available for Withdrawal
          </p>
          <h3 className="text-4xl font-extrabold tracking-tight text-slate-900 mt-1 mb-6 tabular-nums">
            ₹{winningsBalance.toLocaleString()}
          </h3>

          <div className="text-left space-y-2">
            <label className="text-xs font-bold text-slate-500 pl-1 block">Amount to Transfer</label>
            <div className="bg-[#F4F6FA] border border-slate-200 focus-within:border-[#007AFF] focus-within:bg-white rounded-2xl px-4 py-3 flex items-center gap-2 transition-all">
              <span className="text-2xl font-extrabold text-[#007AFF]">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-2xl font-extrabold text-slate-900 outline-none tabular-nums"
                placeholder="500"
              />
            </div>
            <div className="flex justify-between px-1 text-[11px] font-semibold text-slate-400">
              <span>Minimum: ₹100</span>
              <span>Maximum: ₹50,000</span>
            </div>
          </div>
        </section>

        {/* Destination Account Card */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 pl-1">
            Payout Account
          </h4>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#007AFF]">
                <Landmark size={20} />
              </div>
              <div>
                <h5 className="text-sm font-bold text-slate-900">Verified Bank / UPI</h5>
                <p className="text-xs text-slate-500">
                  {activeGateway?.name || 'Instant Bank Transfer'}
                </p>
              </div>
            </div>
            <div className="p-1.5 bg-emerald-50 rounded-full text-emerald-600">
              <CheckCircle2 size={18} />
            </div>
          </div>
        </div>

        {/* Processing Advisory */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex gap-3 shadow-2xs">
          <ShieldAlert className="text-[#007AFF] shrink-0 mt-0.5" size={18} />
          <div className="space-y-0.5">
            <h5 className="text-xs font-bold text-slate-800">Processing Window</h5>
            <p className="text-xs text-slate-500 leading-relaxed">
              Winnings transfers are usually settled within 2–4 business days after security check.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleWithdraw}
          disabled={!canSubmit}
          className={`w-full min-h-[52px] rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            canSubmit
              ? 'bg-[#007AFF] hover:bg-[#0066D6] text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : 'Transfer Funds'}
        </button>
      </div>
    </div>
  );
}
