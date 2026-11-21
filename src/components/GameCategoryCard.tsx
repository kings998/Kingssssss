import React from 'react';
import { motion } from 'motion/react';
import { Users } from 'lucide-react';
import SafeImage from './SafeImage';
import { APP_MEDIA } from '../assets/media';

interface GameCategoryCardProps {
  id?: string;
  title: string;
  centerTitle?: string;
  bottomLabel?: string;
  badgeTitle?: string;
  image: string;
  playerCount: number;
  onClick: () => void;
}

export default function GameCategoryCard({
  title,
  centerTitle,
  bottomLabel,
  badgeTitle = 'FREE FIRE MAX',
  image,
  playerCount,
  onClick,
}: GameCategoryCardProps) {
  const displayCenter = centerTitle || title;
  const displayBottom = bottomLabel || title;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative w-full aspect-[2/1] rounded-[20px] overflow-hidden border border-slate-200/90 hover:border-[#007AFF]/50 shadow-sm hover:shadow-[0_12px_28px_rgba(0,122,255,0.12)] cursor-pointer bg-white flex flex-col justify-between group select-none transition-all duration-150"
    >
      <SafeImage
        src={image || APP_MEDIA.heroArena}
        fallbackSrc={APP_MEDIA.heroArena}
        alt={title}
        className="absolute inset-0 w-full h-full"
        imgClassName="group-hover:scale-105 transition-transform duration-300 object-cover w-full h-full"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/25 to-transparent" />

      <div className="relative z-10 px-3 pt-3 flex flex-col items-start">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[#007AFF] bg-white/95 px-2 py-0.5 rounded-full shadow-xs">
          {badgeTitle}
        </span>
      </div>

      <div className="relative z-10 bg-white/95 backdrop-blur-md px-3.5 py-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-900 truncate">{displayBottom}</p>
          <p className="text-[10px] font-semibold text-slate-500 truncate">{displayCenter}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0 bg-blue-50 text-[#007AFF] px-2.5 py-1 rounded-full border border-blue-100">
          <Users size={11} />
          <span className="text-[10px] font-bold tabular-nums">
            {playerCount > 0 ? playerCount : 'LIVE'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
