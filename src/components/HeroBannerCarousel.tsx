import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Trophy, Sparkles } from 'lucide-react';
import { Banner, Page } from '../types';
import { APP_MEDIA } from '../assets/media';
import SafeImage from './SafeImage';

interface HeroBannerCarouselProps {
  banners: Banner[];
  onPageChange: (page: Page, id?: string) => void;
}

const FALLBACK_BANNERS: Banner[] = [
  {
    id: 'ff-arena-banner',
    imageUrl: APP_MEDIA.heroArena,
    redirectUrl: '',
    type: 'main',
    order: 1,
    isActive: true,
  },
  {
    id: 'ff-trophy-banner',
    imageUrl: APP_MEDIA.bannerPromo,
    redirectUrl: '',
    type: 'main',
    order: 2,
    isActive: true,
  },
];

export default function HeroBannerCarousel({ banners, onPageChange }: HeroBannerCarouselProps) {
  const activeBanners = banners && banners.length > 0 ? banners : FALLBACK_BANNERS;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (activeBanners.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [activeBanners.length, isPaused]);

  const currentBanner = activeBanners[currentIndex] || activeBanners[0];

  const handleBannerClick = (banner: Banner) => {
    if (banner.redirectUrl) {
      const url = banner.redirectUrl.trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
        return;
      }
    }
    onPageChange(Page.TOURNAMENTS, 'freefire');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diffX) > 48) {
      if (diffX > 0) {
        setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
      }
    }
    touchStartX.current = null;
  };

  return (
    <section className="px-4 sm:px-6 mt-4 max-w-6xl mx-auto">
      <div
        className="relative w-full aspect-[16/8.2] sm:aspect-[2.4/1] rounded-[24px] overflow-hidden border border-slate-200/80 shadow-[0_14px_34px_rgba(0,122,255,0.1)] bg-white select-none"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBanner.id || currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => handleBannerClick(currentBanner)}
            className="w-full h-full relative cursor-pointer group"
          >
            <SafeImage
              src={currentBanner.imageUrl || APP_MEDIA.heroArena}
              alt="Esports Championship"
              fallbackSrc={APP_MEDIA.heroArena}
              className="w-full h-full"
              imgClassName="group-hover:scale-105 transition-transform duration-500 object-cover"
            />

            {/* Crisp Frosted White & Royal Blue Overlay Scrim */}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/75 via-blue-950/40 to-transparent" />

            <div className="absolute inset-y-0 left-0 p-5 sm:p-8 flex flex-col justify-center max-w-[78%] sm:max-w-[60%] z-10">
              <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-white/90 text-[#007AFF] text-[10px] font-bold uppercase tracking-wider mb-2.5 shadow-sm">
                {currentBanner.id === 'ff-trophy-banner' ? (
                  <>
                    <Trophy size={11} /> Championship Series
                  </>
                ) : (
                  <>
                    <Sparkles size={11} /> Daily Custom Rooms
                  </>
                )}
              </div>

              <h2 className="text-lg sm:text-3xl font-extrabold tracking-tight text-white leading-tight drop-shadow-sm">
                {currentBanner.id === 'ff-trophy-banner'
                  ? 'Instant Cash Prize Pools'
                  : 'Play & Win Free Fire Arenas'}
              </h2>
              <p className="text-xs sm:text-sm text-blue-100 font-medium mt-1 line-clamp-2">
                Battle Royale, Clash Squad & Lone Wolf tournaments with automated payouts.
              </p>

              <div className="mt-3 sm:mt-4 inline-flex items-center gap-1.5 self-start bg-[#007AFF] text-white px-4 py-2 rounded-full text-xs font-bold shadow-md shadow-blue-600/30 group-hover:bg-[#0066D6] transition-colors">
                <span>Join Arena</span>
                <ChevronRight size={14} />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {activeBanners.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {activeBanners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                idx === currentIndex ? 'w-5 bg-[#007AFF]' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
