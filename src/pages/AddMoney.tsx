import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Zap, Loader2, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import { Page, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, increment, runTransaction, collection, serverTimestamp } from 'firebase/firestore';
import { paymentService } from '../services/paymentService';
import { useIosFeedback } from '../components/IosFeedback';

interface AddMoneyProps {
  onPageChange: (page: Page) => void;
}

export default function AddMoney({ onPageChange }: AddMoneyProps) {
  const { showToast } = useIosFeedback();
  const [amount, setAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);
  const [pollingOrderId, setPollingOrderId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const presetAmounts = ['50', '100', '200', '500', '1000'];

  const numericAmount = parseInt(amount, 10);
  const isAmountValid = !isNaN(numericAmount) && numericAmount >= 10 && numericAmount <= 10000;
  const isBelowMin = !isNaN(numericAmount) && numericAmount > 0 && numericAmount < 10;
  const isAboveMax = !isNaN(numericAmount) && numericAmount > 10000;

  useEffect(() => {
    let interval: any;
    let timeout: any;

    if (pollingActive && pollingOrderId) {
      setPollingTimedOut(false);

      timeout = setTimeout(() => {
        setPollingActive(false);
        setPollingTimedOut(true);
      }, 5 * 60 * 1000);

      const checkStatus = async () => {
        try {
          const res = await fetch('/api/zapupi/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: pollingOrderId }),
          });

          if (res.ok) {
            const data = await res.json();
            const detailSt = String(data.detail?.status || data.detail?.order_status || '').toLowerCase();
            const isFinished =
              data.status === 'success' ||
              detailSt === 'success' ||
              detailSt === 'paid' ||
              detailSt === 'completed';

            if (isFinished) {
              clearInterval(interval);
              clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              setTimeout(() => {
                window.location.href = '/wallet?payment=success';
              }, 500);
            } else if (data.status === 'failed' || detailSt === 'failed' || detailSt === 'failure') {
              clearInterval(interval);
              clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              window.location.href = '/wallet?payment=failed';
            }
          }
        } catch (err) {
          console.error('[AddMoney] Polling error:', err);
        }
      };

      checkStatus();
      interval = setInterval(checkStatus, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [pollingActive, pollingOrderId]);

  useEffect(() => {
    const fetchGateway = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      setActiveGateway(g);
    };
    fetchGateway();
  }, []);

  const handleDeposit = async () => {
    if (!auth.currentUser || !amount) return;
    const value = parseInt(amount, 10);
    if (isNaN(value) || value < 10 || value > 10000) return;

    setLoading(true);
    try {
      const result: any = await paymentService.initiateDeposit(value, auth.currentUser.uid);

      if (activeGateway?.id === 'zapupi' || result?.order_id) {
        setPollingOrderId(result.order_id);
        setPollingActive(true);
        if (result.payment_url) {
          setCheckoutUrl(result.payment_url);
          window.open(result.payment_url, '_blank');
        }
      }

      const isManualGateway = activeGateway?.id !== 'cashfree' && activeGateway?.id !== 'zapupi';

      if (isManualGateway) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await runTransaction(db, async (transaction) => {
          transaction.update(userRef, {
            'wallet.deposit': increment(value),
          });

          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: auth.currentUser!.uid,
            type: 'deposit',
            amount: value,
            status: 'completed',
            title: `Deposit via ${activeGateway?.name || 'UPI'}`,
            createdAt: serverTimestamp(),
          });
        });
        showToast(`₹${value} added to wallet!`, 'success');
        onPageChange(Page.WALLET);
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Payment initiation failed';
      showToast(errorMessage, 'error');

      if (error?.code?.startsWith('permission-denied') || error?.code?.startsWith('unavailable')) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-20 select-none">
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

          <h1 className="text-base font-extrabold text-slate-900">Add Coins</h1>

          <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700">
            <ShieldCheck size={13} />
            <span>Secure</span>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Active Gateway Banner */}
        <div className="bg-white border border-blue-200/80 rounded-[22px] p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
            <Zap size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900">
              Instant Deposit via {activeGateway?.name || 'ZapUPI'}
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Fast checkout • UPI, Cards & NetBanking
            </p>
          </div>
        </div>

        {/* Amount Entry Card */}
        <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Enter Amount</span>
            <span className="text-[11px] font-semibold text-slate-400">Min ₹10 • Max ₹10,000</span>
          </div>

          <div className="bg-[#F4F6FA] border border-slate-200 focus-within:border-[#007AFF] focus-within:bg-white rounded-2xl px-4 py-3 flex items-center justify-between transition-all">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-2xl font-extrabold text-[#007AFF]">₹</span>
              <input
                type="number"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-2xl font-extrabold text-slate-900 placeholder:text-slate-300 outline-none tabular-nums"
              />
            </div>
            {amount && (
              <button
                type="button"
                onClick={() => setAmount('')}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2.5 py-1 bg-white border border-slate-200 rounded-xl"
              >
                Clear
              </button>
            )}
          </div>

          {isBelowMin && (
            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5">
              <AlertCircle size={14} /> Minimum deposit is ₹10
            </p>
          )}
          {isAboveMax && (
            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5">
              <AlertCircle size={14} /> Maximum deposit is ₹10,000
            </p>
          )}

          {/* Quick Amount Pills */}
          <div className="grid grid-cols-3 gap-2.5">
            {presetAmounts.map((preset) => {
              const isSelected = amount === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`min-h-[44px] rounded-2xl text-xs font-bold border transition-all tabular-nums ${
                    isSelected
                      ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-sm'
                      : 'bg-[#F8FAFC] border-slate-200 text-slate-800 hover:border-[#007AFF]/50'
                  }`}
                >
                  ₹{preset}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setAmount('')}
              className="min-h-[44px] rounded-2xl text-xs font-bold bg-[#F8FAFC] border border-slate-200 text-slate-600"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={handleDeposit}
          disabled={loading || !isAmountValid}
          className="w-full min-h-[52px] bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              <span>Processing...</span>
            </>
          ) : (
            <span>Proceed to Pay ₹{isAmountValid ? numericAmount : 0}</span>
          )}
        </button>

        {/* Safety Information Card */}
        <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-2.5">
          {[
            'Do not press back while payment confirmation is running.',
            '100% encrypted UPI and gateway verification.',
            'Balance credits automatically upon confirmation.',
            'Zero hidden processing fees.',
          ].map((text, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] mt-1.5 shrink-0" />
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Polling Verification Modal */}
      <AnimatePresence>
        {pollingActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-[28px] p-6 text-slate-900 shadow-2xl text-center border border-slate-200"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center mx-auto mb-4">
                <Loader2 className="animate-spin" size={26} />
              </div>

              <h3 className="text-base font-extrabold text-slate-900 mb-1">
                {pollingTimedOut ? 'Verification Timed Out' : 'Verifying Payment'}
              </h3>

              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                {pollingTimedOut
                  ? 'If funds were deducted, contact support with your Order ID.'
                  : 'Confirming your payment with the gateway. Keep this window open.'}
              </p>

              {checkoutUrl && !pollingTimedOut && (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-4 w-full min-h-[42px] bg-blue-50 text-[#007AFF] border border-blue-200 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <ExternalLink size={14} />
                  <span>Open Payment Page</span>
                </a>
              )}

              {pollingOrderId && (
                <div className="bg-[#F4F6FA] border border-slate-200 rounded-xl p-2.5 mb-5 text-[11px] font-mono text-slate-600">
                  Order ID: <span className="font-bold text-slate-900 select-all">{pollingOrderId}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setPollingActive(false);
                  setPollingOrderId(null);
                  setPollingTimedOut(false);
                }}
                className="w-full min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs"
              >
                {pollingTimedOut ? 'Close' : 'Cancel & Return'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
