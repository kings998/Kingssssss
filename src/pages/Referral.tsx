import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  Users,
  Gift,
  Share2,
  Copy,
  CheckCircle2,
  Award,
  Trophy,
} from 'lucide-react';
import { Page, User } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useIosFeedback } from '../components/IosFeedback';

interface ReferralPageProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function ReferralPage({ user, onPageChange }: ReferralPageProps) {
  const { showToast } = useIosFeedback();
  const [copied, setCopied] = useState(false);
  const [appSettings, setAppSettings] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'appSettings', 'referral_support'),
      (snap) => {
        if (snap.exists()) {
          setAppSettings(snap.data());
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'appSettings/referral_support');
      }
    );
    return () => unsub();
  }, []);

  const referralCode = user.username;
  const baseUrl = appSettings?.referral?.baseUrl?.replace(/\/$/, '') || window.location.origin;
  const referralLink = `${baseUrl}/signup?ref=${referralCode}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'KINGS RELOAD Referral',
          text: `Join KINGS RELOAD using my code ${referralCode} and claim ₹${appSettings?.referral?.newUserReward || 10} bonus!`,
          url: referralLink,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopy(referralLink);
        }
      }
    } else {
      handleCopy(referralLink);
    }
  };

  const refReward = appSettings?.referral?.perReferralReward || 0;
  const rewardType = appSettings?.referral?.rewardType || 'bonus';
  const newUserReward = appSettings?.referral?.newUserReward || 0;

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      {/* Frosted Top Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-extrabold text-slate-900">Refer & Earn</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Blue iOS Gradient Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden p-6 sm:p-8 rounded-[28px] ios-blue-gradient text-white shadow-xl shadow-blue-500/20"
        >
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <Gift size={24} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mb-2">
            Invite Friends, Earn ₹{refReward}
          </h2>
          <p className="text-xs sm:text-sm text-blue-100 leading-relaxed mb-5 max-w-md">
            Share your invite link with your Free Fire squad and receive ₹{refReward}{' '}
            {rewardType === 'both' ? 'split bonus' : rewardType} for every new player.
          </p>

          <div className="flex items-center gap-2.5">
            <div className="px-4 py-2.5 bg-white/15 border border-white/25 rounded-2xl backdrop-blur-md">
              <span className="text-sm font-extrabold tracking-wide">{referralCode}</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(referralCode)}
              className="px-4 py-2.5 bg-white text-[#007AFF] rounded-2xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
            >
              {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>
        </motion.div>

        {/* How It Works Steps */}
        <section className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 pl-1">
            How It Works
          </h3>
          <div className="bg-white border border-slate-200/80 rounded-[26px] divide-y divide-slate-100 shadow-xs">
            {[
              {
                num: '01',
                title: 'Share Your Invite Link',
                desc: 'Send your code or direct link to friends and squadmates.',
                icon: Share2,
              },
              {
                num: '02',
                title: 'Friend Creates Account',
                desc: `They receive ₹${newUserReward} instant joining bonus upon signup.`,
                icon: Users,
              },
              {
                num: '03',
                title: 'Claim Instant Reward',
                desc: `You earn ₹${refReward} credited directly into your wallet.`,
                icon: Award,
              },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.num} className="p-4 sm:p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#007AFF] font-extrabold text-xs flex items-center justify-center shrink-0">
                    {step.num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-extrabold text-slate-900">{step.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                  </div>
                  <Icon size={18} className="text-slate-300 shrink-0" />
                </div>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={handleShare}
          className="w-full min-h-[52px] bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all"
        >
          <Share2 size={18} />
          <span>Share Referral Link</span>
        </button>

        {/* Program Rules */}
        <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} className="text-[#007AFF]" />
            <h4 className="text-sm font-extrabold text-slate-900">Program Guidelines</h4>
          </div>
          <ul className="space-y-2">
            {[
              'One account & device allowed per referral reward.',
              'Referee must register as a new user via your link or code.',
              'Rewards credit automatically with no limit on total invites.',
            ].map((rule, idx) => (
              <li key={idx} className="flex items-center gap-2.5 text-xs text-slate-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF]" />
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
