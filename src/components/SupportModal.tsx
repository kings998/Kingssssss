import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, Mail, X, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const fetchSettings = async () => {
        try {
          const snap = await getDoc(doc(db, 'appSettings', 'referral_support'));
          if (snap.exists()) {
            setSettings(snap.data().support);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchSettings();
    }
  }, [isOpen]);

  const supportOptions = [
    {
      label: 'WhatsApp',
      icon: MessageSquare,
      color: 'bg-[#25D366]',
      link: settings?.whatsapp || 'https://wa.me/',
      desc: 'Instant replies (9 AM - 9 PM)',
    },
    {
      label: 'Telegram',
      icon: Send,
      color: 'bg-[#0088cc]',
      link: settings?.telegram || 'https://t.me/',
      desc: 'Join our community channel',
    },
    {
      label: 'Email',
      icon: Mail,
      color: 'bg-[#007AFF]',
      link: `mailto:${settings?.email || 'support@kingsreload.com'}`,
      desc: 'For business & technical queries',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative w-full max-w-lg bg-white rounded-t-[30px] sm:rounded-[30px] p-6 pb-8 border border-slate-200 flex flex-col max-h-[82vh] overflow-hidden shadow-2xl"
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Customer <span className="text-[#007AFF]">Support</span>
                </h3>
                <p className="text-xs font-medium text-slate-500">We&apos;re here to help you</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto no-scrollbar space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-emerald-700">Support Desk Online</span>
                </div>
                <ShieldCheck size={16} className="text-emerald-600" />
              </div>

              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <Loader2 className="text-[#007AFF] animate-spin mb-3" size={28} />
                  <p className="text-xs font-semibold text-slate-500">Syncing communication channels...</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {supportOptions.map((opt) => (
                    <a
                      key={opt.label}
                      href={opt.link}
                      target="_blank"
                      rel="noreferrer"
                      className="p-4 bg-[#F8FAFC] hover:bg-blue-50/60 border border-slate-200/80 hover:border-[#007AFF]/40 rounded-2xl flex items-center justify-between group active:scale-[0.985] transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl ${opt.color} flex items-center justify-center text-white shadow-sm`}>
                          <opt.icon size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{opt.label}</h4>
                          <p className="text-xs font-medium text-slate-500">{opt.desc}</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-400 group-hover:text-[#007AFF]" />
                    </a>
                  ))}
                </div>
              )}

              <div className="p-4 bg-[#F4F6FA] rounded-2xl border border-slate-200/70">
                <p className="text-[11px] font-medium text-slate-500 leading-relaxed text-center">
                  Our support team typically responds within 30–60 minutes. For payment queries, share your Transaction ID.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
