import heroArenaImg from './images/ff_ios_hero_arena_1795189967947.jpg';
import bannerPromoImg from './images/ff_ios_banner_promo_1795189967595.jpg';
import modeBattleRoyaleImg from './images/ff_mode_battle_royale_1795189967533.jpg';
import modeClashSquadImg from './images/ff_mode_clash_squad_1795189967931.jpg';
import modeLoneWolfImg from './images/ff_mode_lone_wolf_1795189967544.jpg';
import emblemProImg from './images/kr_emblem_pro_1795007184047.jpg';

export const APP_MEDIA = {
  heroArena: heroArenaImg,
  bannerPromo: bannerPromoImg,
  modeBattleRoyale: modeBattleRoyaleImg,
  modeClashSquad: modeClashSquadImg,
  modeLoneWolf: modeLoneWolfImg,
  emblem: emblemProImg,
} as const;

export function getModeArt(hint?: string | null): string {
  const val = (hint || '').toLowerCase();
  if (val.includes('clash') || val.includes('cs') || val.includes('4v4')) {
    return APP_MEDIA.modeClashSquad;
  }
  if (val.includes('lone') || val.includes('wolf') || val.includes('1v1') || val.includes('sniper')) {
    return APP_MEDIA.modeLoneWolf;
  }
  if (val.includes('battle') || val.includes('br') || val.includes('royale') || val.includes('freefire')) {
    return APP_MEDIA.modeBattleRoyale;
  }
  return APP_MEDIA.heroArena;
}
