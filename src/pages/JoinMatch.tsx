import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import {
  ChevronLeft,
  User as UserIcon,
  Check,
  Loader2,
  X,
  AlertCircle,
  Wallet as WalletIcon,
  CheckCircle2,
} from 'lucide-react';
import { Page, User as UserType, Tournament } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  doc,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  increment,
  updateDoc,
  runTransaction,
} from 'firebase/firestore';
import { useIosFeedback } from '../components/IosFeedback';

interface JoinMatchProps {
  user: UserType;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
  onJoinSuccess: (matchId: string) => void;
}

export default function JoinMatch({
  user,
  onPageChange,
  joinedMatchIds,
  onJoinSuccess,
}: JoinMatchProps) {
  const { id: matchId } = useParams();
  const { showToast } = useIosFeedback();
  const isJoined = matchId ? joinedMatchIds.includes(matchId) : false;

  const [currentStep, setCurrentStep] = useState<'select_position' | 'summary' | 'success'>(
    'select_position'
  );

  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [inGameName, setInGameName] = useState('');
  const [ignModalOpen, setIgnModalOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [tempIgn, setTempIgn] = useState('');
  const [activeEditingSlotIndex, setActiveEditingSlotIndex] = useState<number>(0);
  const [teammateIGNs, setTeammateIGNs] = useState<string[]>(['', '', '']);

  const [loading, setLoading] = useState(false);
  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [takenSlots, setTakenSlots] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getGameKey = (gameId?: string, section?: string) => {
    const g = (gameId || '').toLowerCase();
    const s = (section || '').toLowerCase();
    if (
      g.includes('freefire') ||
      s.includes('battle royale') ||
      s.includes('clash squad') ||
      s.includes('lone wolf')
    ) {
      return 'freefire';
    }
    if (g.includes('cod') || g.includes('call of duty')) return 'codm';
    if (g.includes('bgmi') || g.includes('pubg')) return 'bgmi';
    return g || 'freefire';
  };

  useEffect(() => {
    if (!matchId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'matches', matchId),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as Tournament;
          setMatchData({ id: doc.id, ...data });
          if (data.players) {
            setTakenSlots((data.players as any[]).map((p: any) => p.slot));
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `matches/${matchId}`);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  useEffect(() => {
    if (matchData && user) {
      const gameKey = getGameKey(matchData.gameId, matchData.section);
      const savedGameIGN =
        user.gameIGNs?.[gameKey] ||
        user.gameIGNs?.[matchData.gameId] ||
        user.ign ||
        (user as any)[`${gameKey}IGN`];

      if (savedGameIGN && !inGameName) {
        setInGameName(savedGameIGN);
      }
    }
  }, [matchData, user]);

  const isUserJoined =
    (matchData?.players as any[])?.some((p: any) => p.userId === auth.currentUser?.uid) || isJoined;

  const totalSlots = matchData?.totalSlots || matchData?.maxPlayers || 48;
  const maxTeamSlots = matchData?.mode === 'Duo' ? 2 : matchData?.mode === 'Squad' ? 4 : 1;

  const toggleSlot = (slotId: number) => {
    if (takenSlots.includes(slotId) || isUserJoined) return;

    if (maxTeamSlots > 1) {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots(selectedSlots.filter((id) => id !== slotId));
      } else if (selectedSlots.length < maxTeamSlots) {
        setSelectedSlots([...selectedSlots, slotId].sort((a, b) => a - b));
      } else {
        setSelectedSlots([slotId]);
      }
    } else {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots([]);
      } else {
        setSelectedSlots([slotId]);
      }
    }
  };

  const handleProceedToSummary = () => {
    if (selectedSlots.length === 0) return;
    setCurrentStep('summary');
  };

  const openIgnModal = (slotIndex: number = 0) => {
    setActiveEditingSlotIndex(slotIndex);
    if (slotIndex === 0) {
      setTempIgn(inGameName || '');
    } else {
      setTempIgn(teammateIGNs[slotIndex - 1] || '');
    }
    setIgnModalOpen(true);
  };

  const handleSaveIgnModal = async () => {
    const trimmed = tempIgn.trim();
    if (!trimmed) {
      showToast('Please enter a valid in-game name.', 'error');
      return;
    }

    if (activeEditingSlotIndex === 0) {
      setInGameName(trimmed);
      if (auth.currentUser) {
        try {
          const gameKey = getGameKey(matchData?.gameId, matchData?.section);
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            [`gameIGNs.${gameKey}`]: trimmed,
            ign: trimmed,
          });
        } catch (e) {
          console.warn('Could not auto-save IGN to profile:', e);
        }
      }
    } else {
      const updated = [...teammateIGNs];
      updated[activeEditingSlotIndex - 1] = trimmed;
      setTeammateIGNs(updated);
    }

    setIgnModalOpen(false);
  };

  const handleFinalJoin = async () => {
    if (selectedSlots.length === 0 || !matchId || !auth.currentUser) return;

    if (!inGameName) {
      openIgnModal(0);
      return;
    }

    if (selectedSlots.length > 1) {
      for (let i = 0; i < selectedSlots.length - 1; i++) {
        if (!teammateIGNs[i]) {
          openIgnModal(i + 1);
          return;
        }
      }
    }

    if (isUserJoined) {
      showToast('You have already joined this match!', 'info');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const matchRef = doc(db, 'matches', matchId);
      const regId = `${matchId}_${auth.currentUser.uid}`;
      const regRef = doc(db, 'registrations', regId);

      const entryFeePerSlot = matchData?.entryFee || 0;
      const totalFee = entryFeePerSlot * selectedSlots.length;

      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const matchDoc = await transaction.get(matchRef);

        if (!userDoc.exists()) throw new Error('User profile not found. Please log in again.');
        if (!matchDoc.exists()) throw new Error('Match not found.');

        const userData = userDoc.data() as UserType;
        const tournamentData = matchDoc.data() as Tournament;

        if ((tournamentData.players as any[])?.some((p: any) => p.userId === auth.currentUser?.uid)) {
          throw new Error('You have already joined this match.');
        }

        const deposit = userData.wallet?.deposit || 0;
        const winnings = userData.wallet?.winnings || 0;
        const bonus = userData.wallet?.bonus || 0;
        const totalPayable = deposit + winnings + bonus;

        if (totalPayable < totalFee) {
          throw new Error('NOT_ENOUGH_BALANCE');
        }

        const updatedPlayers = (tournamentData.players as any[]) || [];
        for (const slotId of selectedSlots) {
          if (updatedPlayers.some((p: any) => p.slot === slotId)) {
            throw new Error(`Position ${slotId} was just taken. Please choose another.`);
          }
        }

        if (
          updatedPlayers.length + selectedSlots.length >
          (tournamentData.totalSlots || tournamentData.maxPlayers || 48)
        ) {
          throw new Error('Match does not have enough slots left.');
        }

        let remaining = totalFee;
        let newBonus = bonus;
        let newDeposit = deposit;
        let newWinnings = winnings;

        if (newBonus >= remaining) {
          newBonus -= remaining;
          remaining = 0;
        } else {
          remaining -= newBonus;
          newBonus = 0;
        }

        if (remaining > 0) {
          if (newDeposit >= remaining) {
            newDeposit -= remaining;
            remaining = 0;
          } else {
            remaining -= newDeposit;
            newDeposit = 0;
          }
        }

        if (remaining > 0) {
          newWinnings = Math.max(0, newWinnings - remaining);
          remaining = 0;
        }

        transaction.update(userRef, {
          'wallet.deposit': newDeposit,
          'wallet.winnings': newWinnings,
          'wallet.bonus': newBonus,
        });

        const teamMembers = [{ name: inGameName, isOwner: true }];
        for (let i = 0; i < selectedSlots.length - 1; i++) {
          teamMembers.push({ name: teammateIGNs[i], isOwner: false } as any);
        }

        const playersToAdd = selectedSlots.map((slot, index) => ({
          userId: auth.currentUser!.uid,
          username: user.username,
          ign: index === 0 ? inGameName : teammateIGNs[index - 1],
          slot,
        }));

        transaction.update(matchRef, {
          players: arrayUnion(...playersToAdd),
          playersCount: increment(selectedSlots.length),
        });

        transaction.set(regRef, {
          tournamentId: matchId,
          userId: auth.currentUser!.uid,
          ign: inGameName,
          slots: selectedSlots,
          teamMembers,
          totalSlotsBooked: selectedSlots.length,
          joinedAt: serverTimestamp(),
          gameId: tournamentData.gameId || 'freefire',
          status: 'active',
        });

        if (totalFee > 0) {
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: auth.currentUser!.uid,
            type: 'entry',
            amount: totalFee,
            matchId,
            status: 'completed',
            title: `JOINED MATCH: ${tournamentData.title || tournamentData.displayId || '#000'} (${selectedSlots.length} Slots)`,
            createdAt: serverTimestamp(),
          });
        }
      });

      onJoinSuccess(matchId);
      setShowSuccessModal(true);
      setCurrentStep('summary');
    } catch (error: any) {
      const errorMsg = error.message || '';
      if (
        errorMsg === 'NOT_ENOUGH_BALANCE' ||
        errorMsg.includes('Insufficient') ||
        errorMsg.includes('balance')
      ) {
        setErrorMessage('Insufficient wallet balance. Redirecting to Wallet...');
        showToast('Insufficient wallet balance', 'error');
        setTimeout(() => {
          onPageChange(Page.WALLET);
        }, 1500);
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to join match');
        showToast(error instanceof Error ? error.message : 'Failed to join match', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!matchData) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex flex-col items-center justify-center">
        <Loader2 size={28} className="text-[#007AFF] animate-spin mb-3" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Loading Match Slots...
        </p>
      </div>
    );
  }

  const entryFeePerSlot =
    matchData.entryFee !== undefined && matchData.entryFee !== null ? matchData.entryFee : 5;
  const totalAmount = entryFeePerSlot * Math.max(1, selectedSlots.length);
  const userBalance =
    (user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0);
  const teamLabel = matchData.mode ? `${matchData.mode} Match` : 'Solo Match';

  // Summary Step
  if (currentStep === 'summary') {
    return (
      <div className="min-h-screen bg-[#F2F4F8] text-slate-900 flex flex-col justify-between select-none">
        <header className="sticky top-0 z-40 ios-glass border-b border-slate-200/80">
          <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep('select_position')}
              className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-base font-extrabold text-slate-900">Confirm Entry</h1>
            <div className="w-10" />
          </div>
        </header>

        <div className="max-w-xl w-full mx-auto p-4 sm:p-6 flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Wallet & Cost Breakdown Card */}
            <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 shadow-xs flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                <WalletIcon size={26} />
              </div>
              <div className="flex-1 space-y-1.5 text-xs">
                <div className="flex justify-between font-medium text-slate-500">
                  <span>Current Balance</span>
                  <span className="font-extrabold text-slate-900 tabular-nums">
                    ₹{userBalance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-slate-500">
                  <span>Entry Fee ({selectedSlots.length} slot)</span>
                  <span className="font-bold text-slate-900 tabular-nums">₹{entryFeePerSlot}</span>
                </div>
                <div className="flex justify-between font-extrabold pt-2 border-t border-slate-100 text-sm">
                  <span className="text-slate-900">Total Payable</span>
                  <span className="text-[#007AFF] tabular-nums">₹{totalAmount}</span>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Selected Positions & IGN Table */}
            <div className="bg-white border border-slate-200/80 rounded-[26px] overflow-hidden shadow-xs">
              <div className="bg-[#007AFF] text-white px-5 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                <span>Selected Slots</span>
                <span>{selectedSlots.length} Booked</span>
              </div>

              <div className="grid grid-cols-3 text-center py-2.5 px-4 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div>Format</div>
                <div>Slot #</div>
                <div>In-Game Name</div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[36vh] overflow-y-auto">
                {selectedSlots.map((slotNum, idx) => {
                  const currentSlotIgn = idx === 0 ? inGameName : teammateIGNs[idx - 1];
                  return (
                    <div key={slotNum} className="grid grid-cols-3 items-center text-center py-3.5 px-4">
                      <span className="text-xs font-semibold text-slate-600">{teamLabel}</span>
                      <span className="text-sm font-extrabold text-[#007AFF] tabular-nums">
                        #{slotNum}
                      </span>
                      <div className="flex justify-center">
                        {currentSlotIgn ? (
                          <button
                            type="button"
                            onClick={() => openIgnModal(idx)}
                            className="text-xs font-extrabold text-slate-900 hover:text-[#007AFF] truncate max-w-[115px] underline decoration-blue-200"
                          >
                            {currentSlotIgn}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openIgnModal(idx)}
                            className="bg-blue-50 text-[#007AFF] border border-blue-200 text-[11px] font-bold px-3 py-1 rounded-full"
                          >
                            Add IGN
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-6 space-y-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep('select_position')}
                disabled={loading}
                className="flex-1 min-h-[48px] bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinalJoin}
                disabled={loading}
                className="flex-1 min-h-[48px] bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Joining...</span>
                  </>
                ) : (
                  <span>Confirm & Join</span>
                )}
              </button>
            </div>
            <p className="text-[11px] text-center text-slate-500">
              Ensure your Free Fire IGN matches exactly to receive prizes.
            </p>
          </div>
        </div>

        {/* IGN Entry Modal */}
        <AnimatePresence>
          {ignModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIgnModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.94, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.94, y: 16 }}
                className="w-full max-w-xs bg-white rounded-[28px] overflow-hidden shadow-2xl border border-slate-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 text-slate-900">
                  <h3 className="text-base font-extrabold text-slate-900 mb-1">
                    Enter In-Game Name
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    {activeEditingSlotIndex > 0
                      ? `Teammate #${activeEditingSlotIndex + 1} Free Fire IGN`
                      : 'Your case-sensitive Free Fire IGN'}
                  </p>

                  <div className="relative mb-5">
                    <UserIcon
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={tempIgn}
                      onChange={(e) => setTempIgn(e.target.value)}
                      placeholder="e.g. KING_PRO"
                      autoFocus
                      className="ios-input pl-10 pr-3 py-3 text-sm font-bold"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveIgnModal();
                      }}
                    />
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIgnModalOpen(false)}
                      className="flex-1 min-h-[44px] bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveIgnModal}
                      className="flex-1 min-h-[44px] bg-[#007AFF] text-white rounded-2xl text-xs font-bold"
                    >
                      Save IGN
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Receipt Modal */}
        <AnimatePresence>
          {showSuccessModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => onPageChange(Page.HOME)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 18 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 18 }}
                className="w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 text-slate-900 shadow-2xl text-center relative"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onPageChange(Page.HOME)}
                  className="absolute top-4 right-4 w-8 h-8 text-slate-500 bg-slate-100 rounded-full flex items-center justify-center"
                >
                  <X size={16} />
                </button>

                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>

                <h2 className="text-lg font-extrabold text-slate-900 mb-1">
                  Match Joined Successfully!
                </h2>
                <p className="text-xs text-slate-500 mb-5">
                  You are booked for {matchData.title || 'Free Fire Battle'}.
                </p>

                <div className="bg-[#F4F6FA] border border-slate-200/80 rounded-2xl p-4 text-left space-y-2.5 mb-6 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Booked Slots</span>
                    <span className="font-extrabold text-[#007AFF] tabular-nums">
                      #{selectedSlots.join(', #')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">IGN</span>
                    <span className="font-bold text-slate-900 truncate max-w-[160px]">
                      {inGameName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Paid</span>
                    <span className="font-extrabold text-emerald-600 tabular-nums">₹{totalAmount}</span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => onPageChange(Page.HOME)}
                    className="w-full min-h-[46px] bg-[#007AFF] text-white rounded-2xl font-bold text-xs shadow-sm"
                  >
                    Go to Home
                  </button>
                  <button
                    type="button"
                    onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
                    className="w-full min-h-[46px] bg-slate-100 text-slate-700 rounded-2xl font-bold text-xs"
                  >
                    View Contests
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Step 1: Select Position Screen
  const positions = Array.from({ length: totalSlots }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 flex flex-col justify-between select-none">
      <header className="sticky top-0 z-40 ios-glass border-b border-slate-200/80">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center"
            aria-label="Back to tournaments"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center truncate px-2">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
              {matchData.title || 'Select Slot'}
            </h1>
            <p className="text-[11px] font-medium text-slate-500">
              {maxTeamSlots > 1 ? `Pick up to ${maxTeamSlots} slots` : 'Pick 1 open position'}
            </p>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl w-full mx-auto p-4 sm:p-6 flex-1 flex flex-col">
        <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs flex-1 flex flex-col">
          <div className="bg-[#007AFF] text-white px-5 py-3.5 flex items-center justify-between text-xs font-bold">
            <span>Select Match Position</span>
            <span className="tabular-nums">
              {takenSlots.length}/{totalSlots} Taken
            </span>
          </div>

          <div className="p-4 sm:p-5 flex-1 overflow-y-auto max-h-[65vh]">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
              {positions.map((pos) => {
                const isOccupied = takenSlots.includes(pos);
                const isSelected = selectedSlots.includes(pos);

                return (
                  <button
                    key={pos}
                    type="button"
                    disabled={isOccupied || isUserJoined}
                    onClick={() => toggleSlot(pos)}
                    className={`min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all tabular-nums ${
                      isOccupied
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : isSelected
                        ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-sm'
                        : 'bg-white border-slate-200 hover:border-[#007AFF] text-slate-800 active:scale-95'
                    }`}
                  >
                    <span>#{pos}</span>
                    {isSelected && <Check size={14} className="stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 ios-glass border-t border-slate-200/80">
        <div className="max-w-2xl mx-auto p-4">
          <button
            type="button"
            onClick={handleProceedToSummary}
            disabled={selectedSlots.length === 0}
            className={`w-full min-h-[50px] rounded-2xl text-sm font-bold transition-all ${
              selectedSlots.length > 0
                ? 'bg-[#007AFF] hover:bg-[#0066D6] text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {selectedSlots.length > 0
              ? `Continue with Slot #${selectedSlots.join(', #')}`
              : 'Select a Position to Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
