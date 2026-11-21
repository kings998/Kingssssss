import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Page, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Gamepad2, Sparkles, Loader2, ChevronRight } from 'lucide-react';
import SafeImage from './SafeImage';
import { getModeArt } from '../assets/media';

export interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface EsportsGamesGridProps {
  matches: Tournament[];
  onPageChange: (page: Page, param?: string) => void;
}

export default function EsportsGamesGrid({ matches, onPageChange }: EsportsGamesGridProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'tournament' | 'solo'>('all');
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedModes = snapshot.docs.map((docSnap) => ({ ...docSnap.data() } as GameMode));
        setModes(fetchedModes);
        setLoading(false);
      },
      (error) => {
        console.warn('Error listening to game modes on Home:', error);
        handleFirestoreError(error, OperationType.LIST, 'gameModes');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredModes = modes.filter((mode) => {
    if (activeTab === 'all') return true;
    const titleUpper = (mode.title || '').toUpperCase();
    const subUpper = (mode.subtitle || '').toUpperCase();
    const isSolo =
      titleUpper.includes('SOLO') ||
      titleUpper.includes('1V1') ||
      subUpper.includes('SOLO') ||
      subUpper.includes('1V1');
    if (activeTab === 'solo') return isSolo;
    if (activeTab === 'tournament') return !isSolo;
    return true;
  });

  return (
    <section className="px-4 sm:px-6 mt-6 mb-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
            Esports Arenas & Modes
          </h3>
          <p className="text-[11px] font-medium text-slate-500">Select a format to view live rooms</p>
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Page.GAME_MODES, 'freefire')}
          className="text-xs font-bold text-[#007AFF] hover:text-[#0066D6] inline-flex items-center gap-0.5 min-h-[44px]"
        >
          <span>View All</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* iOS Segmented Control */}
      {modes.length > 0 && (
        <div className="w-full max-w-md bg-slate-200/75 p-1 rounded-2xl flex items-center mb-4 select-none">
          {[
            { id: 'all', label: 'All Modes' },
            { id: 'tournament', label: 'Squad / Duo' },
            { id: 'solo', label: 'Solo / 1v1' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-[#007AFF] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[1/1.05] rounded-[22px] bg-white border border-slate-200/80 flex items-center justify-center"
            >
              <Loader2 size={18} className="animate-spin text-[#007AFF]" />
            </div>
          ))}
        </div>
      ) : modes.length === 0 ? (
        <div className="ios-card text-center py-10 p-6">
          <Gamepad2 size={32} className="mx-auto mb-2.5 text-[#007AFF]" />
          <p className="text-sm font-bold text-slate-900">No Game Modes Added Yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Modes configured in the Admin or Co-Owner Panel will appear here.
          </p>
          <button
            type="button"
            onClick={() => onPageChange(Page.TOURNAMENTS, 'freefire')}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#007AFF] text-white rounded-full text-xs font-bold shadow-sm active:scale-95 transition-transform"
          >
            <Sparkles size={14} /> Explore Tournaments
          </button>
        </div>
      ) : filteredModes.length === 0 ? (
        <div className="ios-card text-center py-8 p-5">
          <p className="text-xs font-bold text-slate-600">No modes found in this category</p>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className="mt-2 text-xs text-[#007AFF] font-bold hover:underline"
          >
            Show All Modes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredModes.map((mode, idx) => {
            const activeMatchesCount = matches.filter(
              (m) =>
                (m.status === 'upcoming' || m.status === 'ongoing') &&
                (m.modeId === mode.id ||
                  m.mode?.toLowerCase() === mode.title.toLowerCase() ||
                  m.section?.toLowerCase() === (mode.category || mode.subtitle || '').toLowerCase())
            ).length;

            const fallbackArt = getModeArt(mode.category || mode.subtitle || mode.title);
            const resolvedImage =
              mode.image && !mode.image.includes('ibb.co') && !mode.image.includes('unsplash.com')
                ? mode.image
                : fallbackArt;

            return (
              <motion.div
                key={mode.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.2), duration: 0.2 }}
                onClick={() =>
                  onPageChange(Page.TOURNAMENTS, `${mode.gameId || 'freefire'}?mode=${mode.id}`)
                }
                className="group ios-card-interactive overflow-hidden flex flex-col cursor-pointer select-none"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <SafeImage
                    src={resolvedImage}
                    fallbackSrc={fallbackArt}
                    alt={mode.title}
                    className="w-full h-full"
                    imgClassName="group-hover:scale-105 transition-transform duration-300 object-cover"
                  />
                  {activeMatchesCount > 0 && (
                    <div className="absolute top-2.5 left-2.5 z-20 px-2.5 py-0.5 bg-[#007AFF] text-white rounded-full text-[10px] font-bold shadow-sm tabular-nums">
                      {activeMatchesCount} Live
                    </div>
                  )}
                </div>

                <div className="p-3 sm:p-3.5 bg-white flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                      {mode.title}
                    </h4>
                    <p className="text-[10px] font-medium text-slate-500 truncate">
                      {mode.category || mode.subtitle || 'Custom Room'}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0 group-hover:bg-[#007AFF] group-hover:text-white transition-colors">
                    <ChevronRight size={14} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
