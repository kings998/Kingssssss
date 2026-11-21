import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Search,
  Loader2,
  Gamepad2,
  ArrowLeft,
  Upload,
  Sparkles,
  Check,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, deleteDoc, onSnapshot, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { Page } from '../types';
import { GAMES } from '../constants';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';
import { APP_MEDIA } from '../assets/media';
import { useIosFeedback } from '../components/IosFeedback';

export interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface AdminModesProps {
  onPageChange: (page: Page) => void;
}

const PRESET_COVERS = [
  { name: 'Battle Royale Arena', url: APP_MEDIA.modeBattleRoyale },
  { name: 'Clash Squad / 4v4', url: APP_MEDIA.modeClashSquad },
  { name: 'Lone Wolf / 1v1', url: APP_MEDIA.modeLoneWolf },
  { name: 'Championship Stage', url: APP_MEDIA.heroArena },
  { name: 'Promo Spotlight', url: APP_MEDIA.bannerPromo },
  { name: 'Kings Crest Emblem', url: APP_MEDIA.emblem },
];

const DEFAULT_PRESET_MODES: GameMode[] = [
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

const SUGGESTED_TITLES = [
  'BR SOLO',
  'BR DUO',
  'BR SQUAD',
  'CS SOLO',
  'CS DUO',
  'CS SQUAD',
  'LONE WOLF SOLO',
  'LONE WOLF DUO',
  'CUSTOM ROOM',
  'SNIPER ONLY',
  '4V4 CLASH',
  '1V1 DUEL',
];

const SUGGESTED_SUBTITLES = [
  'Battle Royale',
  'Clash Squad',
  'Lone Wolf',
  'Custom Room',
  'Survival Arena',
  'Ranked Esports',
  'Special Event',
];

export default function AdminModes({ onPageChange }: AdminModesProps) {
  const navigate = useNavigate();
  const { showToast, confirmDialog } = useIosFeedback();
  const [selectedGameId, setSelectedGameId] = useState<string>(GAMES[0].id);
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMode, setEditingMode] = useState<Partial<GameMode> | null>(null);
  const [modeToDelete, setModeToDelete] = useState<GameMode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      onPageChange(Page.ADMIN);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadOriginalImage(file);
      setEditingMode((prev) => (prev ? { ...prev, image: url } : null));
      showToast('Mode cover uploaded.', 'success');
    } catch (err) {
      console.error('Mode image upload failed:', err);
      showToast('Failed to upload image.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allModes = snapshot.docs.map((docSnap) => ({ ...docSnap.data() } as GameMode));
        const filtered = allModes.filter((m) => m.gameId === selectedGameId);
        setModes(filtered);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'gameModes');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedGameId]);

  const handleSeedDefaults = async () => {
    const confirmed = await confirmDialog({
      title: 'Load Preset Game Modes?',
      message: `Initialize standard preset modes for ${selectedGameId.toUpperCase()}?`,
      confirmText: 'Load Presets',
    });
    if (!confirmed) return;

    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      DEFAULT_PRESET_MODES.forEach((mode, i) => {
        const modeDocId = `${selectedGameId}_${mode.id}`;
        const ref = doc(db, 'gameModes', modeDocId);
        batch.set(
          ref,
          {
            ...mode,
            gameId: selectedGameId,
            order: i + 1,
          },
          { merge: true }
        );
      });
      await batch.commit();
      showToast('Preset game modes loaded!', 'success');
    } catch (err) {
      console.error('Error seeding modes:', err);
      showToast('Could not load preset modes.', 'error');
      handleFirestoreError(err, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSeeding(false);
    }
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleTitleChange = (title: string) => {
    const slug = generateSlug(title);
    let subtitle = editingMode?.subtitle || '';
    let category = editingMode?.category || '';

    if (
      !subtitle ||
      subtitle === 'Battle Royale' ||
      subtitle === 'Clash Squad' ||
      subtitle === 'Lone Wolf'
    ) {
      const upper = title.toUpperCase();
      if (upper.includes('BR') || upper.includes('ROYALE') || upper.includes('MAP')) {
        subtitle = 'Battle Royale';
        category = 'Battle Royale';
      } else if (upper.includes('CS') || upper.includes('CLASH') || upper.includes('4V4')) {
        subtitle = 'Clash Squad';
        category = 'Clash Squad';
      } else if (upper.includes('LONE') || upper.includes('WOLF') || upper.includes('1V1')) {
        subtitle = 'Lone Wolf';
        category = 'Lone Wolf';
      } else if (upper.includes('CUSTOM') || upper.includes('ROOM')) {
        subtitle = 'Custom Room';
        category = 'Custom Room';
      }
    }

    setEditingMode((prev) => ({
      ...prev,
      title,
      id: prev?.id && prev.id !== '' ? prev.id : slug,
      subtitle: subtitle || 'Battleground',
      category: category || subtitle || 'Arena',
      image: prev?.image || PRESET_COVERS[0].url,
    }));
  };

  const handleSave = async () => {
    if (!editingMode?.title?.trim()) {
      showToast('Please enter a Mode Title.', 'error');
      return;
    }

    const rawId = (editingMode.id || generateSlug(editingMode.title)).trim();
    if (!rawId) {
      showToast('Please enter a valid Mode ID.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const modeId = `${selectedGameId}_${rawId}`;
      let defaultImage =
        editingMode.image && editingMode.image.trim() !== ''
          ? editingMode.image.trim()
          : PRESET_COVERS[0].url;

      if (defaultImage && defaultImage.startsWith('data:')) {
        try {
          defaultImage = await uploadOriginalImage(defaultImage);
        } catch (imgErr) {
          console.warn('Mode image upload warning:', imgErr);
        }
      }

      const modeData: GameMode = {
        id: rawId,
        gameId: selectedGameId,
        title: editingMode.title.trim(),
        subtitle: (editingMode.subtitle || 'Battleground').trim(),
        category: (editingMode.category || editingMode.subtitle || 'Arena').trim(),
        image: defaultImage,
        order: Number(editingMode.order) || modes.length + 1,
      };

      await setDoc(doc(db, 'gameModes', modeId), modeData, { merge: true });
      setEditingMode(null);
      showToast('Game mode saved!', 'success');
    } catch (error) {
      console.error('Error saving mode:', error);
      showToast('Failed to save mode.', 'error');
      handleFirestoreError(error, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!modeToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'gameModes', `${selectedGameId}_${modeToDelete.id}`));
      setModeToDelete(null);
      showToast('Game mode deleted.', 'info');
    } catch (error) {
      showToast('Could not delete mode.', 'error');
      handleFirestoreError(error, OperationType.DELETE, 'gameModes');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredModes = modes.filter(
    (m) =>
      m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28">
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">
                Game Modes
              </h1>
              <p className="text-[11px] font-medium text-slate-500">Configure Arena Categories</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={isSeeding}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 border border-blue-200 text-[#007AFF] hover:bg-[#007AFF] hover:text-white rounded-full text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
          >
            {isSeeding ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>Preset Modes</span>
          </button>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Game Selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => setSelectedGameId(game.id)}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                selectedGameId === game.id
                  ? 'bg-[#007AFF] text-white shadow-sm shadow-blue-500/25'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
              }`}
            >
              {game.title}
            </button>
          ))}
        </div>

        {/* Search & Add Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search modes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-11 bg-white border border-slate-200 rounded-2xl pl-10 pr-4 text-sm font-medium outline-none focus:border-[#007AFF] text-slate-900 shadow-xs"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setEditingMode({
                id: '',
                title: '',
                subtitle: 'Battle Royale',
                image: PRESET_COVERS[0].url,
                category: 'Battle Royale',
                order: modes.length + 1,
              })
            }
            className="flex items-center gap-1.5 bg-[#007AFF] hover:bg-[#0066D6] text-white px-4 h-11 rounded-2xl text-xs font-bold transition-all shadow-sm shadow-blue-500/25 active:scale-95 shrink-0"
          >
            <Plus size={16} /> Add Mode
          </button>
        </div>

        {/* Modes Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 size={28} className="animate-spin mb-3 text-[#007AFF]" />
            <p className="text-xs font-bold uppercase tracking-widest">Loading Modes...</p>
          </div>
        ) : filteredModes.length === 0 ? (
          <div className="text-center py-14 bg-white border border-dashed border-slate-300 rounded-[24px] p-6">
            <Gamepad2 size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-800">No modes found</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Click "Add Mode" or load standard Free Fire presets.
            </p>
            <button
              type="button"
              onClick={handleSeedDefaults}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] text-white rounded-full text-xs font-bold hover:bg-[#0066D6] transition-all"
            >
              <Sparkles size={14} /> Load Default Modes
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredModes.map((mode, index) => (
              <div
                key={mode.id}
                className="bg-white border border-slate-200/80 rounded-[22px] p-3.5 flex items-center justify-between shadow-xs hover:border-blue-300 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 relative">
                    <SafeImage
                      src={mode.image || PRESET_COVERS[0].url}
                      alt={mode.title}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1 left-1 bg-white/90 text-[#007AFF] px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shadow-xs tabular-nums">
                      #{mode.order || index + 1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-slate-900 truncate">{mode.title}</h4>
                    <p className="text-xs font-medium text-slate-500 truncate">
                      {mode.subtitle || 'Battleground'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[10px] font-bold text-slate-600 font-mono">
                        {mode.id}
                      </span>
                      {mode.category && (
                        <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-md text-[10px] font-bold text-[#007AFF]">
                          {mode.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => setEditingMode({ ...mode })}
                    className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-[#007AFF] hover:text-white flex items-center justify-center transition-all"
                    title="Edit Mode"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeToDelete(mode)}
                    className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white flex items-center justify-center transition-all"
                    title="Delete Mode"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit / Add Modal */}
      <AnimatePresence>
        {editingMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white border border-slate-200 rounded-[28px] p-6 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingMode.id ? 'Edit Game Mode' : 'Add Game Mode'}
                  </h3>
                  <p className="text-[11px] font-medium text-slate-500">
                    Available for {selectedGameId.toUpperCase()} tournaments
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingMode(null)}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Mode Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter mode title..."
                    value={editingMode.title || ''}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold focus:outline-none focus:border-[#007AFF] text-slate-900"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_TITLES.map((title) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => handleTitleChange(title)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                          editingMode.title?.toUpperCase() === title
                            ? 'bg-[#007AFF] border-[#007AFF] text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Mode Slug ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. br_solo"
                    value={editingMode.id || ''}
                    onChange={(e) =>
                      setEditingMode({ ...editingMode, id: generateSlug(e.target.value) })
                    }
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-mono font-semibold focus:outline-none focus:border-[#007AFF] text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Subtitle / Section
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Battle Royale"
                    value={editingMode.subtitle || ''}
                    onChange={(e) =>
                      setEditingMode({
                        ...editingMode,
                        subtitle: e.target.value,
                        category: e.target.value,
                      })
                    }
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold focus:outline-none focus:border-[#007AFF] text-slate-900"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_SUBTITLES.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() =>
                          setEditingMode({ ...editingMode, subtitle: sub, category: sub })
                        }
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                          editingMode.subtitle === sub
                            ? 'bg-[#007AFF] border-[#007AFF] text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={editingMode.order || 1}
                    onChange={(e) =>
                      setEditingMode({ ...editingMode, order: parseInt(e.target.value, 10) || 1 })
                    }
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-semibold focus:outline-none focus:border-[#007AFF] text-slate-900 tabular-nums"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Mode Cover Artwork
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {PRESET_COVERS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditingMode({ ...editingMode, image: preset.url })}
                        className={`relative aspect-[16/10] rounded-xl overflow-hidden border-2 transition-all ${
                          editingMode.image === preset.url
                            ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20'
                            : 'border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <SafeImage
                          src={preset.url}
                          alt={preset.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-slate-900/45 flex items-center justify-center p-1 text-center">
                          <span className="text-[9px] font-bold text-white leading-tight">
                            {preset.name}
                          </span>
                        </div>
                        {editingMode.image === preset.url && (
                          <div className="absolute top-1 right-1 bg-[#007AFF] rounded-full p-0.5">
                            <Check size={10} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editingMode.image || ''}
                      onChange={(e) => setEditingMode({ ...editingMode, image: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-medium focus:outline-none focus:border-[#007AFF] text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-3.5 h-10 bg-blue-50 border border-blue-200 text-[#007AFF] rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      <span>Upload</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingMode(null)}
                  className="h-11 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !editingMode.title?.trim()}
                  className="h-11 bg-[#007AFF] hover:bg-[#0066D6] rounded-xl text-white font-bold text-xs shadow-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  <span>{editingMode.id ? 'Update Mode' : 'Save Mode'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {modeToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xs bg-white border border-slate-200 rounded-[26px] p-6 shadow-2xl text-center"
            >
              <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-rose-600">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Delete Mode?</h3>
              <p className="text-xs text-slate-500 mt-1 mb-5">
                Are you sure you want to remove{' '}
                <span className="font-bold text-slate-900">{modeToDelete.title}</span>?
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setModeToDelete(null)}
                  className="h-11 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold text-xs transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="h-11 bg-rose-600 hover:bg-rose-700 rounded-xl text-white font-bold text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
