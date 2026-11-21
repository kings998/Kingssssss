import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Loader2,
  Layers,
  ChevronDown,
  Image as ImageIcon,
  Upload,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Page, Tournament } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  runTransaction,
  query,
  orderBy,
} from 'firebase/firestore';
import { isAdminIdentity } from '../constants';
import { GameMode } from './AdminModes';
import { uploadOriginalImage } from '../utils/imageCompressor';
import { APP_MEDIA } from '../assets/media';
import { useIosFeedback } from '../components/IosFeedback';

interface AdminCreateMatchProps {
  onPageChange: (page: Page) => void;
}

const DEFAULT_MODES_FALLBACK: GameMode[] = [
  { id: 'br_solo', gameId: 'freefire', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: APP_MEDIA.modeBattleRoyale, order: 1 },
  { id: 'br_duo', gameId: 'freefire', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: APP_MEDIA.modeBattleRoyale, order: 2 },
  { id: 'br_squad', gameId: 'freefire', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: APP_MEDIA.modeBattleRoyale, order: 3 },
  { id: 'cs_solo', gameId: 'freefire', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: APP_MEDIA.modeClashSquad, order: 4 },
  { id: 'cs_duo', gameId: 'freefire', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: APP_MEDIA.modeClashSquad, order: 5 },
  { id: 'cs_squad', gameId: 'freefire', title: 'CS SQUAD', subtitle: 'Clash Squad', category: 'Clash Squad', image: APP_MEDIA.modeClashSquad, order: 6 },
  { id: 'lone_wolf_solo', gameId: 'freefire', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: APP_MEDIA.modeLoneWolf, order: 7 },
  { id: 'lone_wolf_duo', gameId: 'freefire', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: APP_MEDIA.modeLoneWolf, order: 8 },
  { id: 'custom_room', gameId: 'freefire', title: 'CUSTOM ROOM', subtitle: 'Special Tournament', category: 'Custom Room', image: APP_MEDIA.heroArena, order: 9 },
];

const PRESET_MATCH_THUMBNAILS = [
  { name: 'Battle Royale Arena', url: APP_MEDIA.modeBattleRoyale },
  { name: 'Clash Squad 4v4', url: APP_MEDIA.modeClashSquad },
  { name: 'Lone Wolf 1v1', url: APP_MEDIA.modeLoneWolf },
  { name: 'Championship Stage', url: APP_MEDIA.heroArena },
  { name: 'Promo Spotlight', url: APP_MEDIA.bannerPromo },
  { name: 'Kings Crest Emblem', url: APP_MEDIA.emblem },
];

export default function AdminCreateMatch({ onPageChange }: AdminCreateMatchProps) {
  const { duplicateId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useIosFeedback();
  const [loading, setLoading] = useState(Boolean(duplicateId));
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableModes, setAvailableModes] = useState<GameMode[]>(DEFAULT_MODES_FALLBACK);
  const [loadingModes, setLoadingModes] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matchForm, setMatchForm] = useState({
    title: '',
    gameId: 'freefire',
    selectedModeDocId: 'br_solo',
    modeId: 'br_solo',
    mode: 'Solo',
    section: 'Battle Royale',
    image: '',
    map: 'Bermuda',
    entryFee: 10,
    prize: '₹300',
    prizePool: 300,
    maxPlayers: 48,
    totalSlots: 48,
    time: '',
    prizeType: 'perKill' as 'perKill' | 'survival',
    perKillAmount: 5,
    winnersCount: 1,
    prizeDistribution: {} as Record<number, number>,
    positionWinnersCount: 0,
    positionPrizeDistribution: {} as Record<number, number>,
  });

  const GAME_MAPS = {
    freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NeXTerra', 'Bermuda Remastered'],
  };

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      onPageChange(Page.ADMIN);
    }
  };

  useEffect(() => {
    const fetchGameModes = async () => {
      setLoadingModes(true);
      try {
        const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ ...d.data() }) as GameMode);
          const filtered = list.filter((m) => !matchForm.gameId || m.gameId === matchForm.gameId);
          if (filtered.length > 0) {
            setAvailableModes(filtered);
          }
        }
      } catch (err) {
        console.warn('Could not fetch custom game modes, using presets:', err);
      } finally {
        setLoadingModes(false);
      }
    };

    fetchGameModes();
  }, [matchForm.gameId]);

  useEffect(() => {
    if (duplicateId) {
      const fetchMatch = async () => {
        try {
          const matchDoc = await getDoc(doc(db, 'matches', duplicateId));
          if (matchDoc.exists()) {
            const data = matchDoc.data() as Tournament;
            setMatchForm({
              title: `${data.title} (Copy)`,
              gameId: data.gameId || 'freefire',
              selectedModeDocId: data.modeId || 'br_solo',
              modeId: data.modeId || 'br_solo',
              image: data.image || '',
              entryFee: data.entryFee || 0,
              prize: data.prize || '',
              prizePool: data.prizePool || 0,
              maxPlayers: data.maxPlayers || 48,
              totalSlots: data.totalSlots || 48,
              time: data.time || '',
              map: data.map || 'Bermuda',
              mode: data.mode || 'Solo',
              section: data.section || 'Battle Royale',
              prizeType: data.prizeType || 'perKill',
              perKillAmount: data.perKillAmount || 0,
              winnersCount: data.winnersCount || 1,
              prizeDistribution: data.prizeDistribution || {},
              positionWinnersCount: data.positionWinnersCount || 0,
              positionPrizeDistribution: data.positionPrizeDistribution || {},
            });
          } else {
            showToast('Original match not found for duplication.', 'error');
          }
        } catch (e) {
          console.error('Error fetching match for duplication:', e);
          handleFirestoreError(e, OperationType.GET, `matches/${duplicateId}`);
        } finally {
          setLoading(false);
        }
      };
      fetchMatch();
    }
  }, [duplicateId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadProgress(10);

    try {
      const uploadedUrl = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setMatchForm((prev) => ({ ...prev, image: uploadedUrl }));
      showToast('Thumbnail uploaded successfully.', 'success');
    } catch (err) {
      console.error('Image upload failed:', err);
      showToast('Image upload failed. Please try again.', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSelectGameMode = (modeSlugOrId: string) => {
    const found = availableModes.find(
      (m) => m.id === modeSlugOrId || `${m.gameId}_${m.id}` === modeSlugOrId
    );

    if (found) {
      const titleUpper = found.title.toUpperCase();
      let derivedSection = found.category || found.subtitle || 'Battle Royale';
      let derivedMode = 'Solo';
      let derivedSlots = 48;

      if (titleUpper.includes('SOLO') || titleUpper.includes('1V1')) {
        derivedMode = 'Solo';
      } else if (titleUpper.includes('DUO') || titleUpper.includes('2V2')) {
        derivedMode = 'Duo';
      } else if (titleUpper.includes('SQUAD') || titleUpper.includes('4V4')) {
        derivedMode = 'Squad';
      } else {
        derivedMode = found.title;
      }

      if (titleUpper.includes('HEADSHOT')) {
        derivedSection = 'Headshot';
      } else if (titleUpper.includes('CS 1V1') || titleUpper.includes('1V1 DUEL')) {
        derivedSection = 'CS 1v1';
        derivedSlots = 2;
      } else if (titleUpper.includes('CS 2V2')) {
        derivedSection = 'CS 2v2';
        derivedSlots = 4;
      } else if (titleUpper.includes('CS') || titleUpper.includes('CLASH') || titleUpper.includes('4V4')) {
        derivedSection = 'Clash Squad';
        derivedSlots = 8;
      } else if (titleUpper.includes('LONE') || titleUpper.includes('WOLF')) {
        derivedSection = 'Lone Wolf';
        derivedSlots = derivedMode === 'Duo' ? 4 : 2;
      } else if (titleUpper.includes('CUSTOM')) {
        derivedSection = 'Custom Room';
        derivedSlots = 48;
      } else if (titleUpper.includes('FULL MAP') || titleUpper.includes('BR')) {
        derivedSection = 'Battle Royale';
        derivedSlots = 48;
      } else if (found.category || found.subtitle) {
        derivedSection = found.category || found.subtitle || 'Battle Royale';
      } else {
        derivedSection = found.title || 'Battle Royale';
      }

      setMatchForm((prev) => ({
        ...prev,
        selectedModeDocId: found.id,
        modeId: found.id,
        section: derivedSection,
        mode: derivedMode,
        totalSlots: derivedSlots,
        title: prev.title || `${found.title} MATCH`,
        image: prev.image || found.image || '',
      }));
    } else {
      setMatchForm((prev) => ({
        ...prev,
        selectedModeDocId: modeSlugOrId,
        modeId: modeSlugOrId,
      }));
    }
  };

  const handlePrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm((prev) => ({
      ...prev,
      prizeDistribution: { ...prev.prizeDistribution, [rank]: amount },
    }));
  };

  const handleWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.prizeDistribution };
    Object.keys(newDist).forEach((rank) => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm((prev) => ({
      ...prev,
      winnersCount: count,
      prizeDistribution: newDist,
    }));
  };

  const handlePositionPrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm((prev) => ({
      ...prev,
      positionPrizeDistribution: { ...prev.positionPrizeDistribution, [rank]: amount },
    }));
  };

  const handlePositionWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.positionPrizeDistribution };
    Object.keys(newDist).forEach((rank) => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm((prev) => ({
      ...prev,
      positionWinnersCount: count,
      positionPrizeDistribution: newDist,
    }));
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!matchForm.gameId || !matchForm.map) {
      showToast('Please select game and map.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      let finalImage = matchForm.image ? matchForm.image.trim() : '';
      if (finalImage && finalImage.startsWith('data:')) {
        try {
          finalImage = await uploadOriginalImage(finalImage);
        } catch (imgErr) {
          console.warn('Image upload warning:', imgErr);
        }
      }

      const buildMatchData = (matchNumber: number) => {
        const displayId = `#${matchNumber.toString().padStart(3, '0')}`;
        const baseData = {
          title: matchForm.title,
          gameId: matchForm.gameId,
          modeId: matchForm.modeId || matchForm.selectedModeDocId || 'br_solo',
          image: finalImage,
          entryFee: Number(matchForm.entryFee),
          maxPlayers: Number(matchForm.totalSlots || 0),
          totalSlots: Number(matchForm.totalSlots || 0),
          time: matchForm.time,
          map: matchForm.map,
          mode: matchForm.mode,
          section: matchForm.section,
          matchNumber,
          displayId,
          playersCount: 0,
          players: [],
          status: 'upcoming',
          createdAt: serverTimestamp(),
        };

        const matchData: any = { ...baseData, prizeType: matchForm.prizeType };

        if (matchForm.prizeType === 'survival') {
          const sumOfDistribution = (
            Object.values(matchForm.prizeDistribution || {}) as number[]
          ).reduce((sum: number, v: number) => sum + (Number(v) || 0), 0);
          const finalPrizePool =
            sumOfDistribution > 0 ? sumOfDistribution : Number(matchForm.prizePool) || 0;

          matchData.perKillAmount = 0;
          matchData.winnersCount = Number(matchForm.winnersCount) || 1;
          matchData.prizeDistribution = matchForm.prizeDistribution || {};
          matchData.prizePool = finalPrizePool;
          matchData.prize = matchForm.prize
            ? String(matchForm.prize).startsWith('₹')
              ? String(matchForm.prize)
              : `₹${matchForm.prize}`
            : `₹${finalPrizePool}`;
          matchData.positionWinnersCount = 0;
          matchData.positionPrizeDistribution = {};
        } else {
          matchData.perKillAmount = Number(matchForm.perKillAmount) || 0;
          matchData.prizePool = Number(matchForm.prizePool) || 0;
          matchData.prize = `₹${matchForm.prizePool || 0}`;
          matchData.positionWinnersCount = Number(matchForm.positionWinnersCount) || 0;
          matchData.positionPrizeDistribution = matchForm.positionPrizeDistribution || {};
          matchData.winnersCount = 0;
          matchData.prizeDistribution = {};
        }

        return matchData;
      };

      const canWriteCounter = isAdminIdentity(
        auth.currentUser?.email,
        auth.currentUser?.uid
      );

      if (canWriteCounter) {
        await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, 'meta', 'counters');
          const counterSnap = await transaction.get(counterRef);

          let newMatchNumber = 1;
          if (counterSnap.exists()) {
            newMatchNumber = (counterSnap.data().matchCount || 0) + 1;
          }

          const newMatchRef = doc(collection(db, 'matches'));
          transaction.set(newMatchRef, buildMatchData(newMatchNumber));
          transaction.set(counterRef, { matchCount: newMatchNumber }, { merge: true });
        });
      } else {
        // Co-Owner / Staff path: derive next match number from matches collection without writing admin-only meta/counters
        const existingMatches = await getDocs(collection(db, 'matches'));
        const highestNum = existingMatches.docs.reduce((max, d) => {
          const num = Number(d.data().matchNumber || 0);
          return num > max ? num : max;
        }, existingMatches.size);
        await addDoc(collection(db, 'matches'), buildMatchData(highestNum + 1));
      }

      showToast('Match published successfully!', 'success');
      goBack();
    } catch (e) {
      console.error('Error creating match:', e);
      showToast('Could not publish match. Please check permissions.', 'error');
      handleFirestoreError(e, OperationType.CREATE, 'matches');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex flex-col items-center justify-center">
        <Loader2 className="text-[#007AFF] animate-spin mb-3" size={30} />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Loading Match Template...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-24">
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">
              {duplicateId ? 'Duplicate Match' : 'Create New Match'}
            </h1>
            <p className="text-[11px] font-medium text-slate-500">
              {duplicateId ? `Cloning template ${duplicateId}` : 'Publish a Free Fire tournament'}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5">
        <form onSubmit={handleCreateMatch} className="space-y-5">
          {/* Core Identity Card */}
          <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 ml-1 block">Match Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Daily Battle Room #1"
                value={matchForm.title}
                onChange={(e) => setMatchForm({ ...matchForm, title: e.target.value })}
                className="w-full h-12 bg-slate-50 border border-slate-200 rounded-2xl px-4 text-sm font-semibold outline-none focus:border-[#007AFF] focus:bg-white transition-all text-slate-900"
              />
            </div>

            <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-[#007AFF] flex items-center gap-1.5">
                  <Layers size={14} /> Select Game Mode *
                </label>
                {loadingModes && <Loader2 size={14} className="animate-spin text-[#007AFF]" />}
              </div>

              <select
                value={matchForm.selectedModeDocId}
                onChange={(e) => handleSelectGameMode(e.target.value)}
                className="w-full h-11 bg-white border border-blue-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900"
              >
                {availableModes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} — {m.subtitle || m.category || 'Mode'}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-1.5">
                {availableModes.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectGameMode(m.id)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                      matchForm.selectedModeDocId === m.id
                        ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {m.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Thumbnail Cover Card */}
          <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <ImageIcon size={15} className="text-[#007AFF]" /> Match Cover Image
              </label>
              {matchForm.image && (
                <button
                  type="button"
                  onClick={() => setMatchForm((prev) => ({ ...prev, image: '' }))}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {matchForm.image ? (
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-slate-200 shadow-xs">
                <img
                  src={matchForm.image}
                  alt="Match Thumbnail Preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-transparent to-transparent flex flex-col justify-between p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-bold bg-emerald-600 text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={12} /> Active Cover
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold bg-white/95 hover:bg-white text-slate-900 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm"
                    >
                      <Upload size={12} /> Change File
                    </button>
                  </div>
                  <div className="text-white">
                    <p className="text-sm font-extrabold line-clamp-1">
                      {matchForm.title || 'Tournament Card Preview'}
                    </p>
                    <p className="text-[11px] font-semibold text-sky-300">
                      {matchForm.section} • {matchForm.mode}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 hover:border-[#007AFF] rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50 hover:bg-blue-50/40"
              >
                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#007AFF] flex items-center justify-center mb-2">
                  <Upload size={20} />
                </div>
                <p className="text-xs font-bold text-slate-800">Tap to Upload Match Thumbnail</p>
                <p className="text-[11px] text-slate-500 mt-0.5">PNG, JPG, WebP supported</p>
              </button>
            )}

            {isUploadingImage && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-[#007AFF]">
                  <span>Uploading Image...</span>
                  <span className="tabular-nums">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#007AFF] transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500">Or Enter Image URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://..."
                  value={matchForm.image}
                  onChange={(e) => setMatchForm((prev) => ({ ...prev, image: e.target.value }))}
                  className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold outline-none focus:border-[#007AFF] focus:bg-white text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 h-11 bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <Upload size={14} /> Browse
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 block">
                Quick Esports Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PRESET_MATCH_THUMBNAILS.map((preset, idx) => {
                  const isSelected = matchForm.image === preset.url;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setMatchForm((prev) => ({ ...prev, image: preset.url }))}
                      className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all text-left group ${
                        isSelected
                          ? 'border-[#007AFF] ring-2 ring-[#007AFF]/25'
                          : 'border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent p-2 flex flex-col justify-end">
                        <span className="text-[10px] font-bold text-white line-clamp-1">
                          {preset.name}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 bg-[#007AFF] text-white rounded-full p-0.5">
                          <CheckCircle2 size={12} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Arena & Timing Details */}
          <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Game</label>
                <select
                  value={matchForm.gameId}
                  onChange={(e) => setMatchForm({ ...matchForm, gameId: e.target.value })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                >
                  <option value="freefire">Free Fire</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Map</label>
                <select
                  value={matchForm.map}
                  onChange={(e) => setMatchForm({ ...matchForm, map: e.target.value })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                >
                  {(GAME_MAPS.freefire).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Section / Category</label>
                <input
                  type="text"
                  value={matchForm.section}
                  onChange={(e) => setMatchForm({ ...matchForm, section: e.target.value })}
                  placeholder="e.g. Battle Royale, Clash Squad"
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Mode Type</label>
                <input
                  type="text"
                  value={matchForm.mode}
                  onChange={(e) => setMatchForm({ ...matchForm, mode: e.target.value })}
                  placeholder="e.g. Solo, Duo, Squad"
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Schedule Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={matchForm.time}
                  onChange={(e) => setMatchForm({ ...matchForm, time: e.target.value })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Total Slots *</label>
                <input
                  type="number"
                  required
                  placeholder="48"
                  value={matchForm.totalSlots}
                  onChange={(e) => setMatchForm({ ...matchForm, totalSlots: Number(e.target.value) })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900 tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Entry Fee (₹) *</label>
                <input
                  type="number"
                  required
                  value={matchForm.entryFee}
                  onChange={(e) => setMatchForm({ ...matchForm, entryFee: Number(e.target.value) })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900 tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1 block">Prize Pool (₹)</label>
                <input
                  type="number"
                  value={matchForm.prizePool}
                  onChange={(e) => setMatchForm({ ...matchForm, prizePool: Number(e.target.value) })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900 tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Prize Distribution Card */}
          <div className="bg-white border border-slate-200/80 rounded-[24px] p-5 shadow-xs space-y-5">
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setMatchForm({ ...matchForm, prizeType: 'perKill' })}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  matchForm.prizeType === 'perKill'
                    ? 'bg-white text-[#007AFF] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Per Kill + Rewards
              </button>
              <button
                type="button"
                onClick={() => setMatchForm({ ...matchForm, prizeType: 'survival' })}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  matchForm.prizeType === 'survival'
                    ? 'bg-white text-[#007AFF] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Survival / Ranks
              </button>
            </div>

            {matchForm.prizeType === 'perKill' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1 block">Per Kill (₹)</label>
                    <input
                      type="number"
                      value={matchForm.perKillAmount}
                      onChange={(e) =>
                        setMatchForm({ ...matchForm, perKillAmount: Number(e.target.value) })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900 tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1 block">Total Pool (₹)</label>
                    <input
                      type="number"
                      value={matchForm.prizePool}
                      onChange={(e) =>
                        setMatchForm({ ...matchForm, prizePool: Number(e.target.value) })
                      }
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900 tabular-nums"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-xs font-bold text-[#007AFF]">
                      Position Rewards (Optional)
                    </label>
                    <div className="relative min-w-[160px]">
                      <select
                        value={matchForm.positionWinnersCount}
                        onChange={(e) => handlePositionWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF] appearance-none pr-8"
                      >
                        <option value={0}>No Position Reward</option>
                        {[1, 2, 3, 5, 10].map((n) => (
                          <option key={n} value={n}>
                            Top {n} Winners
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[0, 1, 2, 3, 5, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handlePositionWinnersCountChange(n)}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                          matchForm.positionWinnersCount === n
                            ? 'bg-[#007AFF] border-[#007AFF] text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        {n === 0 ? 'None' : `Top ${n}`}
                      </button>
                    ))}
                  </div>

                  {matchForm.positionWinnersCount > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {Array.from({ length: matchForm.positionWinnersCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-16 h-10 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center text-[11px] font-extrabold text-[#007AFF]">
                            Rank {i + 1}
                          </div>
                          <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                              ₹
                            </span>
                            <input
                              type="number"
                              placeholder="0"
                              value={matchForm.positionPrizeDistribution[i + 1] || ''}
                              onChange={(e) =>
                                handlePositionPrizeDistributionChange(i + 1, Number(e.target.value))
                              }
                              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-3 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF] tabular-nums"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 ml-1 block">
                    Prize Title (e.g. ₹500)
                  </label>
                  <input
                    type="text"
                    value={matchForm.prize}
                    onChange={(e) => setMatchForm({ ...matchForm, prize: e.target.value })}
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold outline-none focus:border-[#007AFF] text-slate-900"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-xs font-bold text-[#007AFF]">Winning Distribution</label>
                    <div className="relative min-w-[160px]">
                      <select
                        value={matchForm.winnersCount}
                        onChange={(e) => handleWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF] appearance-none pr-8"
                      >
                        {[1, 2, 3, 5, 10, 20].map((n) => (
                          <option key={n} value={n}>
                            Top {n} Winners
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[1, 2, 3, 5, 10, 20].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleWinnersCountChange(n)}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                          matchForm.winnersCount === n
                            ? 'bg-[#007AFF] border-[#007AFF] text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        Top {n}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {Array.from({ length: matchForm.winnersCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-16 h-10 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center text-[11px] font-extrabold text-[#007AFF]">
                          Rank {i + 1}
                        </div>
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                            ₹
                          </span>
                          <input
                            type="number"
                            placeholder="0"
                            value={matchForm.prizeDistribution[i + 1] || ''}
                            onChange={(e) =>
                              handlePrizeDistributionChange(i + 1, Number(e.target.value))
                            }
                            className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-3 text-xs font-bold text-slate-900 outline-none focus:border-[#007AFF] tabular-nums"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full h-13 bg-[#007AFF] hover:bg-[#0066D6] rounded-2xl text-sm font-extrabold text-white shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Publishing Match...</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span>Confirm & Publish Match</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
