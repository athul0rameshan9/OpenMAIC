'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  ImagePlus,
  Pencil,
  Trash2,
  Search,
  Settings,
  Sun,
  Moon,
  Monitor,
  ChevronUp,
  Upload,
  Sparkles,
  Atom,
  X,
  Presentation,
} from 'lucide-react';
import {
  IconSearch,
  IconSun,
  IconWorld,
  IconSettings,
  IconUpload,
  IconMicrophone,
  IconDoorEnter,
  IconBolt,
  IconLayoutGrid,
  IconPaperclip,
  IconPlayerPlayFilled,
  IconSparkles,
  IconX,
  IconMoon,
  IconDeviceDesktop,
} from '@tabler/icons-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { AgentBar } from '@/components/agent/agent-bar';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { hasUsableLLMProvider } from '@/lib/store/settings-validation';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  renameStage,
  getFirstSlideByStages,
  revokeThumbnailSlideMediaUrls,
} from '@/lib/utils/stage-storage';
import { SlideThumbnail } from '@/components/slide-renderer/SlideThumbnail';
import type { Slide } from '@openmaic/dsl';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { useImportClassroom } from '@/lib/import/use-import-classroom';
import { shouldShowVocationalTestUi } from '@/lib/config/feature-flags';
import { useImportPptx } from '@/lib/import/use-import-pptx';
import { TextbookBrowser } from '@/components/textbook-browser';
import { ChunkPreview } from '@/components/textbook-browser/chunk-preview';
import { useTextbookSearch } from '@/lib/hooks/use-textbook-search';
import type { Textbook } from '@/lib/types/textbook';

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const INTERACTIVE_MODE_STORAGE_KEY = 'interactiveModeEnabled';

// PPTX import is still scaffolding: `useImportPptx` has no `onImported` consumer
// yet, so the flow only logs the parsed slides. Hide the entry point behind a
// flag until it's wired end-to-end, so the UI doesn't expose a no-op button.
// Enable with NEXT_PUBLIC_ENABLE_PPTX_IMPORT=true.
const PPTX_IMPORT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PPTX_IMPORT === 'true';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  webSearch: boolean;
  interactiveMode: boolean;
  vocationalTestMode: boolean;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  webSearch: false,
  interactiveMode: false,
  vocationalTestMode: false,
};

function HomePage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const showVocationalTestUi = shouldShowVocationalTestUi();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // ═══ Textbook-grounded tab state ═══
  const [activeTab, setActiveTab] = useState<'textbook' | 'free'>('textbook');
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [textbookPrompt, setTextbookPrompt] = useState('');
  const [showChunkPreview, setShowChunkPreview] = useState(false);
  const { chunks, loading: chunksLoading, error: chunksError, search: searchChunks, reset: resetChunks } = useTextbookSearch();

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // A usable LLM provider exists ⇒ a concrete model is always selected (#580
  // invariant). Gate generation on this single condition (state A vs B)
  // instead of inspecting modelId directly.
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const hasUsableProvider = hasUsableLLMProvider(providersConfig);
  const [recentOpen, setRecentOpen] = useState(true);
  const persistRecentOpen = (next: boolean) => {
    setRecentOpen(next);
    try {
      localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  // Hydrate client-only state after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedInteractiveMode = localStorage.getItem(INTERACTIVE_MODE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedInteractiveMode === 'true') updates.interactiveMode = true;
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore requirement draft from localStorage on mount. The previous derived-state
  // pattern initialised `prev` from the cached value itself, so on the first client
  // render the comparison was always equal and the restore never fired. Use an effect
  // so the cache is hydrated into the form once we know the live requirement is empty.
  const draftRestoredRef = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!cachedRequirement) return;
    draftRestoredRef.current = true;
    setForm((prev) => (prev.requirement ? prev : { ...prev, requirement: cachedRequirement }));
  }, [cachedRequirement]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [themeOpen, setThemeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thumbnailsRef = useRef<Record<string, Slide>>({});

  const replaceThumbnails = (slides: Record<string, Slide>) => {
    const previous = thumbnailsRef.current;
    thumbnailsRef.current = slides;
    setThumbnails(slides);
    window.setTimeout(() => revokeThumbnailSlideMediaUrls(previous), 0);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!themeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  const loadClassrooms = async () => {
    try {
      const list = await listStages();
      setClassrooms(list);
      // Load first slide thumbnails
      if (list.length > 0) {
        const slides = await getFirstSlideByStages(list.map((c) => c.id));
        replaceThumbnails(slides);
      } else {
        replaceThumbnails({});
      }
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  const { importing, fileInputRef, triggerFileSelect, handleFileChange } = useImportClassroom(
    () => {
      loadClassrooms();
    },
  );

  const {
    importing: pptxImporting,
    fileInputRef: pptxFileInputRef,
    triggerFileSelect: triggerPptxFileSelect,
    handleFileChange: handlePptxFileChange,
  } = useImportPptx();

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Store hydration on mount
    loadClassrooms();

    return () => {
      revokeThumbnailSlideMediaUrls(thumbnailsRef.current);
      thumbnailsRef.current = {};
    };
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      await deleteStageData(id);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameStage(id, newName);
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredClassrooms = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter((c) => {
      const name = c.name?.toLowerCase() ?? '';
      const desc = c.description?.toLowerCase() ?? '';
      return name.includes(q) || desc.includes(q);
    });
  }, [classrooms, deferredSearchQuery]);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'interactiveMode')
        localStorage.setItem(INTERACTIVE_MODE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const handleGenerate = async () => {
    // No model/provider guard here: generation is gated by `canGenerate`
    // (requires a usable provider), and under the #580 invariant a usable
    // provider always has a concrete model. State A (no usable provider)
    // surfaces through the toolbar's single Configure-Provider affordance.
    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        interactiveMode: form.vocationalTestMode ? true : form.interactiveMode,
        ...(form.vocationalTestMode ? { taskEngineMode: true } : {}),
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (form.pdfFile) {
        pdfStorageKey = await storePdfBlob(form.pdfFile);
        pdfFileName = form.pdfFile.name;

        const settings = useSettingsStore.getState();
        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
          };
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate = !!form.requirement.trim() && hasUsableProvider;

  // ═══ Textbook-grounded generation ═══
  const canGenerateFromTextbook = !!selectedTextbook && !!textbookPrompt.trim() && hasUsableProvider;

  const handleSearchTextbook = async () => {
    if (!selectedTextbook || !textbookPrompt.trim()) return;
    setShowChunkPreview(true);
    await searchChunks(selectedTextbook.textbook_id, textbookPrompt.trim());
  };

  const handleGenerateFromTextbook = async () => {
    if (!selectedTextbook || !textbookPrompt.trim()) return;
    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const ragContext = chunks.map((c) => c.text).join('\n\n---\n\n');

      const requirements: UserRequirements = {
        requirement: textbookPrompt,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
      };

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        sceneOutlines: null,
        currentStep: 'generating' as const,
        textbookId: selectedTextbook.textbook_id,
        textbookTitle: selectedTextbook.title,
        ragChunks: chunks,
        ragContext,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing textbook generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (activeTab === 'textbook' && canGenerateFromTextbook) {
        if (showChunkPreview && chunks.length > 0) handleGenerateFromTextbook();
        else handleSearchTextbook();
      } else if (activeTab === 'free' && canGenerate) {
        handleGenerate();
      }
    }
  };

  return (
    <div className="v1-page flex flex-col" style={{ width: '100%', height: '100dvh', background: '#ffffff', overflow: 'hidden', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
      />
      {PPTX_IMPORT_ENABLED && (
        <input
          ref={pptxFileInputRef}
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={handlePptxFileChange}
          className="hidden"
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══ Top Bar ═══ */}
      <nav className="flex items-center shrink-0" style={{ height: '64px', background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', gap: '16px' }}>
        <div className="flex items-center gap-2" style={{ overflow: 'hidden', height: '44px' }}>
          <img src="/logo-horizontal.png" alt="Katalyst" style={{ height: '150px', objectFit: 'contain' }} />
        </div>
        <div className="flex-1 flex justify-center">
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500, letterSpacing: '0.2px' }}>
            {t('home.slogan')}
          </span>
        </div>
        <div ref={toolbarRef} className="flex items-center" style={{ gap: '6px' }}>
          {/* Search */}
          <AnimatePresence initial={false}>
            {!searchOpen ? (
              <button
                ref={searchButtonRef}
                onClick={() => {
                  setSearchOpen(true);
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }}
                className="v1-nav-icon-btn flex items-center justify-center"
                style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', transition: 'color 0.15s, background 0.15s' }}
              >
                <IconSearch size={16} />
              </button>
            ) : (
              <motion.div
                key="search-input"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 180 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <InputGroup className="h-7 text-[12px] rounded-md bg-muted/40 border-transparent shadow-none">
                  <InputGroupInput
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        if (searchQuery) setSearchQuery('');
                        else {
                          setSearchOpen(false);
                          requestAnimationFrame(() => searchButtonRef.current?.focus());
                        }
                      }
                    }}
                    onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                    placeholder={t('classroom.searchPlaceholder')}
                    className="h-7 pl-2 placeholder:text-muted-foreground/50"
                  />
                  {searchQuery && (
                    <InputGroupButton
                      size="icon-xs"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                    >
                      <IconX size={12} />
                    </InputGroupButton>
                  )}
                </InputGroup>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Theme toggle */}
          <div className="relative">
            <button
              onClick={() => setThemeOpen(!themeOpen)}
              className="v1-nav-icon-btn flex items-center justify-center"
              style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', transition: 'color 0.15s, background 0.15s' }}
            >
              {theme === 'light' && <IconSun size={16} />}
              {theme === 'dark' && <IconMoon size={16} />}
              {theme === 'system' && <IconDeviceDesktop size={16} />}
            </button>
            {themeOpen && (
              <div className="absolute top-full mt-2 right-0 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
                <button onClick={() => { setTheme('light'); setThemeOpen(false); }} className={cn('w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors flex items-center gap-2', theme === 'light' && 'text-primary bg-primary/5')}>
                  <IconSun size={14} /> {t('settings.themeOptions.light')}
                </button>
                <button onClick={() => { setTheme('dark'); setThemeOpen(false); }} className={cn('w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors flex items-center gap-2', theme === 'dark' && 'text-primary bg-primary/5')}>
                  <IconMoon size={14} /> {t('settings.themeOptions.dark')}
                </button>
                <button onClick={() => { setTheme('system'); setThemeOpen(false); }} className={cn('w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors flex items-center gap-2', theme === 'system' && 'text-primary bg-primary/5')}>
                  <IconDeviceDesktop size={14} /> {t('settings.themeOptions.system')}
                </button>
              </div>
            )}
          </div>

          {/* Language */}
          <LanguageSwitcher onOpen={() => setThemeOpen(false)} />

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="v1-nav-icon-btn flex items-center justify-center"
            style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', transition: 'color 0.15s, background 0.15s' }}
          >
            <IconSettings size={16} />
          </button>
        </div>
      </nav>

      {/* ═══ Main: Left Sidebar + Right Content ═══ */}
      <div className="flex flex-1" style={{ overflow: 'hidden' }}>
        {/* ── Left Sidebar ── */}
        <aside className="flex flex-col shrink-0" style={{ width: '260px', background: '#fff', borderRight: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {/* Tab row */}
          <div className="flex shrink-0" style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', gap: '4px' }}>
            <button
              onClick={() => setActiveTab('textbook')}
              style={{
                background: activeTab === 'textbook' ? '#722ed1' : 'transparent',
                color: activeTab === 'textbook' ? '#fff' : '#6b7280',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: activeTab === 'textbook' ? 600 : 400,
                padding: '6px 12px',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                cursor: 'pointer',
              }}
            >
              Classroom
            </button>
            <button
              onClick={() => setActiveTab('free')}
              style={{
                background: activeTab === 'free' ? '#722ed1' : 'transparent',
                color: activeTab === 'free' ? '#fff' : '#6b7280',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: activeTab === 'free' ? 600 : 400,
                padding: '6px 12px',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                cursor: 'pointer',
              }}
            >
              Free Prompt
            </button>
          </div>

          {/* Sidebar content */}
          <div className="flex-1" style={{ overflowY: 'auto', padding: '12px' }}>
            {activeTab === 'textbook' ? (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.09em', padding: '0 4px', marginBottom: '8px' }}>Your textbooks</div>
                <TextbookBrowser
                  selectedTextbook={selectedTextbook}
                  onSelectTextbook={(tb) => {
                    setSelectedTextbook(tb);
                    setShowChunkPreview(false);
                    resetChunks();
                  }}
                />
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.09em', padding: '0 4px', marginBottom: '8px' }}>Recent Sessions</div>
                <div>
                  {filteredClassrooms.map((classroom) => (
                    <div
                      key={classroom.id}
                      onClick={() => router.push(`/classroom/${classroom.id}`)}
                      className="v1-sidebar-item"
                      style={{ borderRadius: '10px', padding: '10px', cursor: 'pointer', border: '1px solid transparent', marginBottom: '4px', transition: 'background 0.15s, border-color 0.15s' }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center shrink-0" style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg,#8b47ea,#3b82f6)' }}>
                          <span style={{ fontSize: '13px' }}>📄</span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '13px', color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{classroom.name}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>
                            {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {classrooms.length === 0 && (
                    <p style={{ fontSize: '12px', color: '#9ca3af', padding: '16px 4px' }}>No classrooms yet</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom import button */}
          <div className="shrink-0" style={{ padding: '12px', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={triggerFileSelect}
              disabled={importing}
              className="v1-import-btn flex items-center gap-2"
              style={{ width: '100%', background: 'transparent', border: '1.5px dashed #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: '#6b7280', fontSize: '11px', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'border-color 0.15s, color 0.15s' }}
            >
              <IconUpload size={13} />
              {t('import.classroom')}
            </button>
          </div>
        </aside>

        {/* ── Right Content ── */}
        <main className="flex-1 flex flex-col" style={{ background: '#fafafa', overflow: 'hidden', position: 'relative' }}>
          {/* Decorative radial gradient */}
          <div style={{ position: 'absolute', top: 0, right: 0, width: '400px', height: '400px', background: 'radial-gradient(circle at 100% 0%, rgba(114,46,209,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

          {/* Right header */}
          <div className="shrink-0" style={{ padding: '14px 24px 12px', borderBottom: '1px solid #e5e7eb', background: '#fff', position: 'relative', zIndex: 1 }}>
            {activeTab === 'textbook' && selectedTextbook ? (
              <>
                <div className="flex items-center gap-1" style={{ fontSize: '11px', color: '#6b7280' }}>
                  <span>{selectedTextbook.title}</span>
                  <span style={{ fontSize: '10px', opacity: 0.5, margin: '0 1px' }}>/</span>
                  <span style={{ color: '#722ed1', fontWeight: 500 }}>Ask</span>
                </div>
                <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e', margin: '3px 0 0', letterSpacing: '-0.2px' }}>{selectedTextbook.title}</h1>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1" style={{ fontSize: '11px', color: '#6b7280' }}>
                  <span>Katalyst</span>
                  <span style={{ fontSize: '10px', opacity: 0.5, margin: '0 1px' }}>/</span>
                  <span style={{ color: '#722ed1', fontWeight: 500 }}>{activeTab === 'textbook' ? 'Textbook' : 'Free Prompt'}</span>
                </div>
                <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e', margin: '3px 0 0', letterSpacing: '-0.2px' }}>
                  {activeTab === 'textbook' ? 'Select a textbook to get started' : 'Create a new classroom'}
                </h1>
              </>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1" style={{ overflowY: 'auto', padding: '20px 24px 32px', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Mode toggle buttons */}
              {activeTab === 'free' && (
                <div className="flex" style={{ gap: '8px' }}>
                  <button
                    onClick={() => updateForm('interactiveMode', false)}
                    style={{
                      background: !form.interactiveMode ? 'rgba(114,46,209,0.1)' : '#fff',
                      color: !form.interactiveMode ? '#722ed1' : '#6b7280',
                      border: !form.interactiveMode ? '1px solid rgba(114,46,209,0.3)' : '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      padding: '7px 16px',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <IconLayoutGrid size={13} />Generate Slides
                  </button>
                  <button
                    onClick={() => updateForm('interactiveMode', true)}
                    style={{
                      background: form.interactiveMode ? 'rgba(114,46,209,0.1)' : '#fff',
                      color: form.interactiveMode ? '#722ed1' : '#6b7280',
                      border: form.interactiveMode ? '1px solid rgba(114,46,209,0.3)' : '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      padding: '7px 16px',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <IconBolt size={13} />{t('toolbar.interactiveModeLabel')}
                  </button>
                  {showVocationalTestUi && (
                    <button
                      onClick={() => updateForm('vocationalTestMode', !form.vocationalTestMode)}
                      style={{
                        background: form.vocationalTestMode ? 'rgba(114,46,209,0.1)' : '#fff',
                        color: form.vocationalTestMode ? '#722ed1' : '#6b7280',
                        border: form.vocationalTestMode ? '1px solid rgba(114,46,209,0.3)' : '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        padding: '7px 16px',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      职教任务
                    </button>
                  )}
                </div>
              )}

              {/* ═══ Prompt Area ═══ */}
              {activeTab === 'textbook' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Selected textbook pill */}
                  {selectedTextbook && (
                    <div className="flex items-center gap-2" style={{ borderRadius: '8px', border: '1px solid rgba(114,46,209,0.3)', background: 'rgba(114,46,209,0.05)', padding: '8px 12px' }}>
                      <BookOpen className="h-4 w-4 shrink-0" style={{ color: '#722ed1' }} />
                      <span style={{ fontSize: '12px', fontWeight: 500 }} className="truncate">{selectedTextbook.title}</span>
                      <button
                        onClick={() => { setSelectedTextbook(null); setShowChunkPreview(false); resetChunks(); }}
                        className="ml-auto shrink-0"
                      >
                        <IconX size={14} style={{ color: '#6b7280' }} />
                      </button>
                    </div>
                  )}

                  {/* Prompt box */}
                  <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e5e7eb', padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                    <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', lineHeight: 1.65 }}>
                      {selectedTextbook
                        ? `What would you like to learn from "${selectedTextbook.title}"?`
                        : 'Select a textbook from the sidebar to get started.'}
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        placeholder="e.g. Explain sample space with an example…"
                        style={{ flex: 1, height: '36px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fafafa', padding: '0 12px', fontSize: '13px', color: '#1a1a2e', outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        value={textbookPrompt}
                        onChange={(e) => { setTextbookPrompt(e.target.value); setShowChunkPreview(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!showChunkPreview) handleSearchTextbook(); else if (chunks.length > 0) handleGenerateFromTextbook(); } }}
                        disabled={!selectedTextbook}
                      />
                      {!showChunkPreview ? (
                        <button
                          onClick={handleSearchTextbook}
                          disabled={!canGenerateFromTextbook}
                          className="v1-enter-btn flex items-center"
                          style={{
                            gap: '6px',
                            background: canGenerateFromTextbook ? '#722ed1' : '#e5e7eb',
                            color: canGenerateFromTextbook ? '#fff' : '#9ca3af',
                            border: 'none',
                            borderRadius: '9px',
                            padding: '0 18px',
                            height: '36px',
                            fontSize: '12px',
                            fontWeight: 600,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            cursor: canGenerateFromTextbook ? 'pointer' : 'not-allowed',
                            transition: 'background 0.15s',
                            boxShadow: canGenerateFromTextbook ? '0 4px 14px rgba(114,46,209,0.28)' : 'none',
                          }}
                        >
                          <IconSearch size={14} /> Search
                        </button>
                      ) : (
                        <button
                          onClick={handleGenerateFromTextbook}
                          disabled={!canGenerateFromTextbook || chunks.length === 0}
                          className="v1-enter-btn flex items-center"
                          style={{
                            gap: '6px',
                            background: canGenerateFromTextbook && chunks.length > 0 ? '#722ed1' : '#e5e7eb',
                            color: canGenerateFromTextbook && chunks.length > 0 ? '#fff' : '#9ca3af',
                            border: 'none',
                            borderRadius: '9px',
                            padding: '0 18px',
                            height: '36px',
                            fontSize: '12px',
                            fontWeight: 600,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            cursor: canGenerateFromTextbook && chunks.length > 0 ? 'pointer' : 'not-allowed',
                            transition: 'background 0.15s',
                            boxShadow: canGenerateFromTextbook && chunks.length > 0 ? '0 4px 14px rgba(114,46,209,0.28)' : 'none',
                          }}
                        >
                          <ArrowUp className="size-3.5" /> Generate
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chunk preview */}
                  {showChunkPreview && (
                    <div style={{ borderRadius: '16px', border: '1px solid #e5e7eb', background: '#fff', padding: '12px', maxHeight: '250px', overflowY: 'auto' }}>
                      <ChunkPreview chunks={chunks} loading={chunksLoading} error={chunksError} />
                    </div>
                  )}
                </div>
              ) : (
                /* Free prompt mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Prompt box */}
                  <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e5e7eb', padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                    <div className="flex items-center justify-between">
                      <GreetingBar />
                      <div className="shrink-0">
                        <AgentBar />
                      </div>
                    </div>
                    <textarea
                      ref={textareaRef}
                      placeholder={t('upload.requirementPlaceholder')}
                      style={{ width: '100%', resize: 'none', border: 'none', background: 'transparent', fontSize: '13px', color: '#1a1a2e', outline: 'none', minHeight: '72px', marginTop: '10px', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.65, boxSizing: 'border-box' }}
                      value={form.requirement}
                      onChange={(e) => updateForm('requirement', e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={3}
                    />

                    {/* Toolbar row */}
                    <div className="flex items-center justify-between" style={{ marginTop: '4px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                      <div className="flex items-center" style={{ gap: '6px' }}>
                        <GenerationToolbar
                          webSearch={form.webSearch}
                          onWebSearchChange={(v) => updateForm('webSearch', v)}
                          onSettingsOpen={(section) => {
                            setSettingsSection(section);
                            setSettingsOpen(true);
                          }}
                          pdfFile={form.pdfFile}
                          onPdfFileChange={(f) => updateForm('pdfFile', f)}
                          onPdfError={setError}
                        />
                      </div>
                      <div className="flex items-center" style={{ gap: '8px' }}>
                        <SpeechButton
                          size="md"
                          onTranscription={(text) => {
                            setForm((prev) => {
                              const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                              updateRequirementCache(next);
                              return { ...prev, requirement: next };
                            });
                          }}
                        />
                        <button
                          onClick={handleGenerate}
                          disabled={!canGenerate}
                          className="v1-enter-btn flex items-center"
                          style={{
                            gap: '6px',
                            background: canGenerate ? '#722ed1' : '#e5e7eb',
                            color: canGenerate ? '#fff' : '#9ca3af',
                            border: 'none',
                            borderRadius: '9px',
                            padding: '0 18px',
                            height: '36px',
                            fontSize: '12px',
                            fontWeight: 600,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            cursor: canGenerate ? 'pointer' : 'not-allowed',
                            letterSpacing: '0.01em',
                            transition: 'background 0.15s',
                            boxShadow: canGenerate ? '0 4px 14px rgba(114,46,209,0.28)' : 'none',
                          }}
                        >
                          <IconDoorEnter size={14} /> {t('toolbar.enterClassroom')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick chips */}
              {activeTab === 'free' && (
                <div className="flex flex-wrap items-center" style={{ gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '4px', fontWeight: 500 }}>Try asking:</span>
                  {['Teach me Python', 'Explain black holes', 'Game Theory', 'Neural Networks 101'].map((chip) => (
                    <span
                      key={chip}
                      className="v1-quick-chip"
                      style={{ borderRadius: '20px', border: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280', padding: '5px 13px', background: '#fff', cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
                      onClick={() => updateForm('requirement', chip)}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ padding: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px' }}
                  >
                    <p style={{ fontSize: '13px', color: '#ef4444' }}>{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ═══ Recent Sessions ═══ */}
              {classrooms.length > 0 && (
                <>
                  <div className="flex items-center" style={{ gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.09em' }}>Recent Sessions</span>
                    <span style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280', padding: '2px 9px', borderRadius: '20px', fontWeight: 500 }}>{classrooms.length}</span>
                    <div className="flex-1" style={{ height: '1px', background: '#e5e7eb' }} />
                    <span
                      onClick={triggerFileSelect}
                      style={{ fontSize: '11px', color: '#722ed1', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.01em' }}
                    >
                      Import ↗
                    </span>
                  </div>

                  {/* Sessions grid */}
                  {searchQuery.trim() && filteredClassrooms.length === 0 ? (
                    <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
                      {t('classroom.searchEmpty')}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                      {filteredClassrooms.map((classroom, i) => (
                        <motion.div
                          key={classroom.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.3 }}
                        >
                          <ClassroomCard
                            classroom={classroom}
                            slide={thumbnails[classroom.id]}
                            formatDate={formatDate}
                            onDelete={handleDelete}
                            onRename={handleRename}
                            confirmingDelete={pendingDeleteId === classroom.id}
                            onConfirmDelete={() => confirmDelete(classroom.id)}
                            onCancelDelete={() => setPendingDeleteId(null)}
                            onClick={() => router.push(`/classroom/${classroom.id}`)}
                          />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Empty state import buttons */}
              {classrooms.length === 0 && activeTab === 'free' && (
                <div className="flex items-center" style={{ gap: '16px', marginTop: '4px' }}>
                  <button
                    onClick={triggerFileSelect}
                    disabled={importing}
                    className="v1-import-btn flex items-center"
                    style={{ gap: '6px', background: 'transparent', border: '1.5px dashed #e5e7eb', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: '#6b7280', fontSize: '11px', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'border-color 0.15s, color 0.15s' }}
                  >
                    <IconUpload size={13} />
                    <span>{t('import.classroom')}</span>
                  </button>
                  {PPTX_IMPORT_ENABLED && (
                    <button
                      onClick={triggerPptxFileSelect}
                      disabled={pptxImporting}
                      className="v1-import-btn flex items-center"
                      style={{ gap: '6px', background: 'transparent', border: '1.5px dashed #e5e7eb', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: '#6b7280', fontSize: '11px', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'border-color 0.15s, color 0.15s' }}
                    >
                      <Presentation className="size-3" />
                      <span>{t('import.pptx')}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Feature badges */}
              {activeTab === 'free' && (
                <div className="flex flex-wrap" style={{ gap: '10px', paddingBottom: '12px' }}>
                  {['⚡ One-click generation', '🤖 Multi-agent classroom', '🎮 Interactive simulations', '📤 Export to PPTX & HTML'].map((badge) => (
                    <span
                      key={badge}
                      className="v1-feature-badge"
                      style={{ borderRadius: '20px', background: '#fff', border: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280', padding: '6px 14px', transition: 'border-color 0.15s, color 0.15s', cursor: 'default', fontWeight: 500 }}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Greeting Bar — avatar + "Hi, Name", click to edit in-place ────
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || t('profile.defaultNickname');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 'auto' }}>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Collapsed pill (always in flow) ── */}
      {!open && (
        <div
          className="flex items-center"
          style={{ gap: '9px', cursor: 'pointer' }}
          onClick={() => setOpen(true)}
        >
          <img src={avatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a2e' }}>
            {t('home.greetingWithName', { name: displayName })}
          </span>
        </div>
      )}

      {/* ── Expanded panel (absolute, floating) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* ── Row: avatar + name ── */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-violet-300/70 dark:ring-violet-500/40 transition-all duration-300">
                    <img src={avatar} alt="" className="size-full object-cover" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* ── Expandable content ── */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const isTaskEngineMode = classroom.taskEngineMode === true;
  const showModeBadge = classroom.interactiveMode || isTaskEngineMode;
  const ModeBadgeIcon = isTaskEngineMode ? Sparkles : Atom;
  const modeBadgeLabel = isTaskEngineMode ? 'Vocational Mode' : t('toolbar.interactiveModeLabel');

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="v1-session-card" style={{ cursor: 'pointer', background: '#fff', borderRadius: '18px', border: '1px solid #f0ebff', padding: '10px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }} onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail — gradient with decorative elements */}
      <div
        ref={thumbRef}
        style={{ aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg,#8b47ea 0%,#5b8af7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {slide && thumbWidth > 0 ? (
          <SlideThumbnail
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>📄</div>
            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.2px' }}>{classroom.name}</div>
          </div>
        ) : null}

        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-15px', left: '-15px', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        {/* Hover overlay with play button */}
        <div className="v1-card-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s', borderRadius: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconPlayerPlayFilled size={16} style={{ color: '#722ed1' }} />
          </div>
        </div>

        {showModeBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={modeBadgeLabel}
                onClick={(e) => e.stopPropagation()}
                style={{ position: 'absolute', bottom: '8px', left: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', zIndex: 10 }}
              >
                <ModeBadgeIcon className="size-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={-4} collisionPadding={0} className="text-xs">
              {modeBadgeLabel}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Delete — top-right, only on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-11 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={startRename}
              >
                <Pencil className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  style={{ padding: '4px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer' }}
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  style={{ padding: '4px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info — outside the thumbnail */}
      <div className="flex items-center" style={{ marginTop: '8px', gap: '6px' }}>
        <span style={{ background: '#f0ebff', color: '#722ed1', fontSize: '11px', padding: '2px 9px', borderRadius: '20px', fontWeight: 500 }}>
          {classroom.sceneCount} {t('classroom.slides')}
        </span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatDate(classroom.updatedAt)}</span>
      </div>
      {editing ? (
        <div style={{ marginTop: '3px' }} onClick={(e) => e.stopPropagation()}>
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={commitRename}
            maxLength={100}
            placeholder={t('classroom.renamePlaceholder')}
            style={{ width: '100%', background: 'transparent', borderBottom: '1px solid rgba(114,46,209,0.4)', fontSize: '14px', fontWeight: 600, color: '#1a1a2e', outline: 'none', border: 'none', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgba(114,46,209,0.4)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          />
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <p
              style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a2e', marginTop: '3px', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
              onDoubleClick={startRename}
            >
              {classroom.name}
            </p>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={4}
            className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
          >
            <div className="flex items-center gap-1.5">
              <span className="break-all">{classroom.name}</span>
              <button
                className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(classroom.name);
                  toast.success(t('classroom.nameCopied'));
                }}
              >
                <Copy className="size-3 opacity-60" />
              </button>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
