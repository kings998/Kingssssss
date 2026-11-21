import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, Gamepad2, Star, ChevronRight, ShieldCheck } from 'lucide-react';
import { GAMES } from '../constants';
import { Page } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';
import { getModeArt } from '../assets/media';

interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface GameModesProps {
  onPageChange: (page: Page, id?: string) => void;
}

export default function GameModes({ onPageChange }: GameModesProps) {
  const { gameId } = useParams<{ gameId: string }>();
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);

  const game = GAMES.find((g) => g.id === gameId);

  useEffect(() => {
    if (!gameId) return;

    setLoading(true);
    const q = query(
      collection(db, 'gameModes'),
      where('gameId', '==', gameId),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedModes = snapshot.docs.map((doc) => ({ ...doc.data() } as GameMode));
        setModes(fetchedModes);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'gameModes');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [gameId]);

  if (!game) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-[28px] p-8 text-center shadow-sm max-w-sm w-full">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center mx-auto mb-4">
            <Gamepad2 size={28} />
          </div>
          <h2 className="text-base font-extrabold text-slate-900 mb-1">Arena Not Found</h2>
          <p className="text-xs text-slate-500 mb-5">This game category is unavailable.</p>
          <button
            type="button"
            onClick={() => onPageChange(Page.HOME)}
            className="w-full min-h-[44px] bg-[#007AFF] text-white rounded-2xl font-bold text-xs shadow-sm"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      {/* Frosted iOS Top Header */}
      <header className="sticky top-0 z-40 ios-glass border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPageChange(Page.HOME)}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
            aria-label="Back to home"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">
              {game.title} Modes
            </h1>
            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-600">
              <ShieldCheck size={12} />
              <span>Servers Optimal</span>
            </div>
          </div>

          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-5">
        <div className="bg-white border border-slate-200/80 rounded-[24px] p-4 sm:p-5 mb-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#007AFF]">
              Free Fire Arena
            </p>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Choose Your Contest Mode
            </h2>
          </div>
          <p className="text-xs font-medium text-slate-500">
            Select a category to browse upcoming rooms and prize pools
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4 pb-8">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] bg-white border border-slate-200 rounded-[22px] opacity-60"
              />
            ))
          ) : modes.length === 0 ? (
            <div className="col-span-full py-16 bg-white border border-slate-200 rounded-[24px] text-center">
              <Star size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No Active Categories</p>
              <p className="text-xs text-slate-500 mt-1">New game modes will appear here soon.</p>
            </div>
          ) : (
            modes.map((mode, index) => {
              const modeArt =
                mode.image && !mode.image.includes('unsplash') && !mode.image.includes('ibb.co')
                  ? mode.image
                  : getModeArt(`${mode.category} ${mode.title}`);

              return (
                <motion.button
                  key={mode.id}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onPageChange(Page.TOURNAMENTS, `${game.id}?mode=${mode.id}`)}
                  className="group text-left bg-white border border-slate-200/90 hover:border-[#007AFF]/50 rounded-[22px] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
                >
                  <div className="relative w-full aspect-[4/3] bg-slate-100 overflow-hidden">
                    <SafeImage
                      src={modeArt}
                      fallbackSrc={getModeArt(mode.title)}
                      alt={mode.title}
                      className="w-full h-full"
                      imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      showLoader={false}
                    />
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-white/95 backdrop-blur-xs text-[10px] font-bold text-[#007AFF] shadow-xs">
                      {mode.subtitle || mode.category || 'Arena'}
                    </span>
                  </div>

                  <div className="p-3.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate group-hover:text-[#007AFF] transition-colors">
                        {mode.title}
                      </h3>
                      <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                        View Contests
                      </p>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
