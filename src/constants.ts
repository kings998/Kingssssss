import { Game, UserRole } from './types';
import { APP_MEDIA } from './assets/media';

export interface GameMode {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
}

export const GAME_MODES_DATA: Record<string, GameMode[]> = {
  freefire: [
    { id: 'br_solo', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: APP_MEDIA.modeBattleRoyale },
    { id: 'br_duo', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: APP_MEDIA.modeBattleRoyale },
    { id: 'br_squad', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: APP_MEDIA.modeBattleRoyale },
    { id: 'cs_solo', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: APP_MEDIA.modeClashSquad },
    { id: 'cs_duo', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: APP_MEDIA.modeClashSquad },
    { id: 'cs_squad', title: 'CS SQUAD', subtitle: 'Clash Squad', category: 'Clash Squad', image: APP_MEDIA.modeClashSquad },
    { id: 'lone_wolf_solo', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: APP_MEDIA.modeLoneWolf },
    { id: 'lone_wolf_duo', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: APP_MEDIA.modeLoneWolf },
  ]
};

export const GAMES: Game[] = [
  {
    id: 'freefire',
    title: 'Free Fire',
    image: APP_MEDIA.heroArena,
    players: 850,
  }
];

export const ADMIN_EMAILS = [
  'rajenderpatel251@gmail.com',
];

export const ADMIN_UIDS: string[] = [];

export function isAdminIdentity(email?: string | null, uid?: string | null): boolean {
  const normalizedEmail = (email || '').trim().toLowerCase();
  return (
    (normalizedEmail !== '' && ADMIN_EMAILS.includes(normalizedEmail)) ||
    (!!uid && ADMIN_UIDS.includes(uid))
  );
}

export function getEffectiveRole(
  user?: { role?: UserRole; isAdmin?: boolean; email?: string | null; id?: string | null } | null
): UserRole {
  if (!user) return 'user';
  if (isAdminIdentity(user.email, user.id) || user.role === 'admin' || user.isAdmin) {
    return 'admin';
  }
  if (user.role === 'co_owner') return 'co_owner';
  if (user.role === 'staff') return 'staff';
  return 'user';
}

export function hasPanelAccess(
  user?: { role?: UserRole; isAdmin?: boolean; email?: string | null; id?: string | null } | null
): boolean {
  return getEffectiveRole(user) !== 'user';
}

export function getRoleBadgeMeta(role: UserRole): {
  label: string;
  pillClass: string;
  lightPillClass: string;
} {
  switch (role) {
    case 'admin':
      return {
        label: 'ADMIN',
        pillClass: 'bg-gradient-to-r from-[#007AFF] to-[#1D4ED8] text-white border border-blue-400/40 shadow-sm shadow-blue-500/20',
        lightPillClass: 'bg-blue-50 text-[#007AFF] border border-blue-200',
      };
    case 'co_owner':
      return {
        label: 'CO-OWNER',
        pillClass: 'bg-gradient-to-r from-sky-500 to-cyan-600 text-white border border-sky-400/40 shadow-sm shadow-sky-500/20',
        lightPillClass: 'bg-sky-50 text-sky-700 border border-sky-200',
      };
    case 'staff':
      return {
        label: 'STAFF',
        pillClass: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border border-emerald-400/40 shadow-sm shadow-emerald-500/20',
        lightPillClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      };
    default:
      return {
        label: 'PLAYER',
        pillClass: 'bg-slate-100 text-slate-700 border border-slate-200',
        lightPillClass: 'bg-slate-100 text-slate-700 border border-slate-200',
      };
  }
}
