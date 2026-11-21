import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Star, Sword, Target, Loader2, Check } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: string;
  onJoin: () => void;
  isJoined: boolean;
}

export default function RulesModal({ isOpen, onClose, section, onJoin, isJoined }: RulesModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeSectionKey = (secName: string) =>
    (secName || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');

  const getIcon = (sec: string) => {
    const s = (sec || '').toLowerCase();
    if (s.includes('clash') || s.includes('4v4')) return <Shield className="text-[#007AFF]" size={20} />;
    if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2'))
      return <Target className="text-sky-600" size={20} />;
    if (s.includes('sniper')) return <Target className="text-amber-600" size={20} />;
    if (s.includes('custom')) return <Star className="text-[#007AFF]" size={20} />;
    return <Sword className="text-emerald-600" size={20} />;
  };

  useEffect(() => {
    if (isOpen) {
      setAgreed(false);
      setLoading(true);
      const fetchRules = async () => {
        try {
          const s = (section || 'Battle Royale').toLowerCase().trim();
          const normKey = normalizeSectionKey(s);

          let docSnap = await getDoc(doc(db, 'gameRules', normKey));

          if (!docSnap.exists()) {
            if (s.includes('clash') || s.includes('cs') || s.includes('4v4')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
            } else if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
            } else if (s.includes('sniper')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
            } else if (s.includes('custom')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'custom_room'));
            } else {
              docSnap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
            }
          }

          if (docSnap.exists() && docSnap.data().rules && docSnap.data().rules.length > 0) {
            setRules(docSnap.data().rules);
          } else {
            setRules([
              'Fair Play: No hacking, scripts or third-party tools allowed.',
              'Device Requirements: Mobile and Tablet players only. Strictly no emulators.',
              'Verification: Screenshot of victory scorecard is mandatory in case of disputes.',
              'Late Entry: Room closes right before match starts. Late entry is not entertained.',
              'Admin Decision: Admin decision will be final and binding for all participants.',
            ]);
          }
        } catch (error) {
          console.error('Error fetching rules:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchRules();
    }
  }, [isOpen, section]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Match Rules</h3>
                <p className="text-xs text-slate-500">Read carefully before joining</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-2xl bg-blue-50 border border-blue-200/70 flex items-center gap-3">
              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-xs">
                {getIcon(section)}
              </div>
              <span className="text-xs font-extrabold text-[#007AFF] uppercase tracking-wider">
                {section || 'Battle Royale'}
              </span>
            </div>

            <div className="max-h-[38vh] overflow-y-auto no-scrollbar mb-5 space-y-3 pr-1">
              {loading ? (
                <div className="py-10 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="animate-spin text-[#007AFF] mb-2" size={24} />
                  <span className="text-xs font-semibold">Loading regulations...</span>
                </div>
              ) : rules.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-xs font-semibold text-slate-400">No rules set by admin</p>
                </div>
              ) : (
                rules.map((rule, idx) => (
                  <div key={idx} className="flex gap-2.5 items-start">
                    <span className="w-5 h-5 rounded-full bg-blue-50 text-[#007AFF] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                      {idx + 1}
                    </span>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed">{rule}</p>
                  </div>
                ))
              )}
            </div>

            {!isJoined && (
              <div className="mb-4">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl bg-[#F4F6FA] border border-slate-200/80">
                  <div className="relative flex items-center justify-center shrink-0">
                    <input
                      type="checkbox"
                      className="peer appearance-none w-5 h-5 border border-slate-300 bg-white rounded-lg checked:bg-[#007AFF] checked:border-[#007AFF] transition-all cursor-pointer"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <div className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700">I agree to all match rules</span>
                </label>
              </div>
            )}

            <button
              type="button"
              disabled={!isJoined && !agreed}
              onClick={() => {
                if (isJoined || agreed) {
                  onJoin();
                  onClose();
                }
              }}
              className={`w-full min-h-[46px] text-xs font-bold rounded-2xl active:scale-95 transition-all ${
                isJoined || agreed
                  ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/25 hover:bg-[#0066D6]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isJoined ? 'Open Match Details' : 'Join Match'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
