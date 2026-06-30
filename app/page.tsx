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
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-background">
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
      <header className="flex items-center justify-between px-5 h-[52px] border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo-horizontal.png" alt="Katalyst" className="h-35" />
        </div>
        <span className="text-xs text-muted-foreground hidden md:block">
          {t('home.slogan')}
        </span>
        <div ref={toolbarRef} className="flex items-center gap-2">
          {/* Search */}
          <AnimatePresence initial={false}>
            {!searchOpen ? (
              <button
                ref={searchButtonRef}
                onClick={() => {
                  setSearchOpen(true);
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Search className="size-4" />
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
                      <X />
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
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {theme === 'light' && <Sun className="size-4" />}
              {theme === 'dark' && <Moon className="size-4" />}
              {theme === 'system' && <Monitor className="size-4" />}
            </button>
            {themeOpen && (
              <div className="absolute top-full mt-2 right-0 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
                <button onClick={() => { setTheme('light'); setThemeOpen(false); }} className={cn('w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors flex items-center gap-2', theme === 'light' && 'text-primary bg-primary/5')}>
                  <Sun className="size-3.5" /> {t('settings.themeOptions.light')}
                </button>
                <button onClick={() => { setTheme('dark'); setThemeOpen(false); }} className={cn('w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors flex items-center gap-2', theme === 'dark' && 'text-primary bg-primary/5')}>
                  <Moon className="size-3.5" /> {t('settings.themeOptions.dark')}
                </button>
                <button onClick={() => { setTheme('system'); setThemeOpen(false); }} className={cn('w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors flex items-center gap-2', theme === 'system' && 'text-primary bg-primary/5')}>
                  <Monitor className="size-3.5" /> {t('settings.themeOptions.system')}
                </button>
              </div>
            )}
          </div>

          {/* Language */}
          <LanguageSwitcher onOpen={() => setThemeOpen(false)} />

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </header>

      {/* ═══ Main: Left Sidebar + Right Content ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="w-[260px] shrink-0 border-r border-border flex flex-col bg-muted/20">
          {/* Tab row */}
          <div className="flex gap-1 p-2 border-b border-border">
            <button
              onClick={() => setActiveTab('textbook')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs transition-all',
                activeTab === 'textbook'
                  ? 'bg-background text-foreground border border-border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              From textbook
            </button>
            <button
              onClick={() => setActiveTab('free')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs transition-all',
                activeTab === 'free'
                  ? 'bg-background text-foreground border border-border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Free prompt
            </button>
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'textbook' ? (
              <div className="p-2">
                <p className="px-2 pt-2 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Your textbooks
                </p>
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
              <div className="p-2">
                <p className="px-2 pt-2 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Recent classrooms
                </p>
                <div className="space-y-0.5">
                  {filteredClassrooms.map((classroom) => (
                    <div
                      key={classroom.id}
                      onClick={() => router.push(`/classroom/${classroom.id}`)}
                      className="rounded-lg p-2.5 cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <p className="text-[13px] font-medium text-foreground truncate">{classroom.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
                      </p>
                    </div>
                  ))}
                  {classrooms.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 px-2 py-4">No classrooms yet</p>
                  )}
                </div>
                {/* Import buttons */}
                <div className="mt-3 flex items-center gap-2 px-2">
                  <button
                    onClick={triggerFileSelect}
                    disabled={importing}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Upload className="size-3" />
                    {t('import.classroom')}
                  </button>
                  {PPTX_IMPORT_ENABLED && (
                    <button
                      onClick={triggerPptxFileSelect}
                      disabled={pptxImporting}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Presentation className="size-3" />
                      {t('import.pptx')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right Content ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-muted/10">
          {/* Right header */}
          <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
            {activeTab === 'textbook' && selectedTextbook ? (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <span>{selectedTextbook.title}</span>
                  <ChevronDown className="size-3 rotate-[-90deg]" />
                  <span>Ask</span>
                </div>
                <h1 className="text-[17px] font-medium text-foreground">{selectedTextbook.title}</h1>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <span>Katalyst</span>
                  <ChevronDown className="size-3 rotate-[-90deg]" />
                  <span>{activeTab === 'textbook' ? 'Textbook' : 'Free prompt'}</span>
                </div>
                <h1 className="text-[17px] font-medium text-foreground">
                  {activeTab === 'textbook' ? 'Select a textbook to get started' : 'Create a new classroom'}
                </h1>
              </>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-5">
              {/* Mode toggle buttons */}
              {activeTab === 'free' && (
                <div className="flex gap-1.5 mb-4">
                  <button
                    onClick={() => updateForm('interactiveMode', false)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs border transition-all',
                      !form.interactiveMode
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-background text-muted-foreground border-border hover:border-border/80',
                    )}
                  >
                    Generate slides
                  </button>
                  <button
                    onClick={() => updateForm('interactiveMode', true)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs border transition-all',
                      form.interactiveMode
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-background text-muted-foreground border-border hover:border-border/80',
                    )}
                  >
                    {t('toolbar.interactiveModeLabel')}
                  </button>
                  {showVocationalTestUi && (
                    <button
                      onClick={() => updateForm('vocationalTestMode', !form.vocationalTestMode)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs border transition-all',
                        form.vocationalTestMode
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-background text-muted-foreground border-border hover:border-border/80',
                      )}
                    >
                      职教任务
                    </button>
                  )}
                </div>
              )}

              {/* ═══ Prompt Area ═══ */}
              {activeTab === 'textbook' ? (
                <div className="space-y-3">
                  {/* Selected textbook pill */}
                  {selectedTextbook && (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                      <BookOpen className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-medium truncate">{selectedTextbook.title}</span>
                      <button
                        onClick={() => { setSelectedTextbook(null); setShowChunkPreview(false); resetChunks(); }}
                        className="ml-auto shrink-0"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  )}

                  {/* Prompt box */}
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-[13px] text-muted-foreground mb-2 leading-relaxed">
                      {selectedTextbook
                        ? `What would you like to learn from "${selectedTextbook.title}"?`
                        : 'Select a textbook from the sidebar to get started.'}
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        placeholder="e.g. Explain sample space with an example…"
                        className="flex-1 h-9 rounded-md border border-border bg-muted/30 px-3 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                        value={textbookPrompt}
                        onChange={(e) => { setTextbookPrompt(e.target.value); setShowChunkPreview(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!showChunkPreview) handleSearchTextbook(); else if (chunks.length > 0) handleGenerateFromTextbook(); } }}
                        disabled={!selectedTextbook}
                      />
                      {!showChunkPreview ? (
                        <button
                          onClick={handleSearchTextbook}
                          disabled={!canGenerateFromTextbook}
                          className={cn(
                            'h-9 rounded-md flex items-center gap-1.5 px-3 text-xs font-medium border transition-all whitespace-nowrap',
                            canGenerateFromTextbook
                              ? 'bg-primary text-primary-foreground border-primary hover:opacity-90 cursor-pointer'
                              : 'bg-muted text-muted-foreground/40 border-border cursor-not-allowed',
                          )}
                        >
                          <Search className="size-3.5" />
                          Search
                        </button>
                      ) : (
                        <button
                          onClick={handleGenerateFromTextbook}
                          disabled={!canGenerateFromTextbook || chunks.length === 0}
                          className={cn(
                            'h-9 rounded-md flex items-center gap-1.5 px-3 text-xs font-medium border transition-all whitespace-nowrap',
                            canGenerateFromTextbook && chunks.length > 0
                              ? 'bg-primary text-primary-foreground border-primary hover:opacity-90 cursor-pointer'
                              : 'bg-muted text-muted-foreground/40 border-border cursor-not-allowed',
                          )}
                        >
                          <ArrowUp className="size-3.5" />
                          Generate
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chunk preview */}
                  {showChunkPreview && (
                    <div className="rounded-xl border border-border bg-background p-3 max-h-[250px] overflow-y-auto">
                      <ChunkPreview chunks={chunks} loading={chunksLoading} error={chunksError} />
                    </div>
                  )}
                </div>
              ) : (
                /* Free prompt mode */
                <div className="space-y-3">
                  {/* Prompt box */}
                  <div className="rounded-xl border border-border bg-background p-3 min-h-[72px]">
                    <div className="relative z-20 flex items-start justify-between mb-2">
                      <GreetingBar />
                      <div className="shrink-0">
                        <AgentBar />
                      </div>
                    </div>
                    <textarea
                      ref={textareaRef}
                      placeholder={t('upload.requirementPlaceholder')}
                      className="w-full resize-none border-0 bg-transparent text-[13px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none min-h-[80px] max-h-[200px]"
                      value={form.requirement}
                      onChange={(e) => updateForm('requirement', e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={3}
                    />
                  </div>

                  {/* Action row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
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
                      className={cn(
                        'shrink-0 h-9 rounded-md flex items-center justify-center gap-1.5 transition-all px-3 border',
                        canGenerate
                          ? 'bg-primary text-primary-foreground border-primary hover:opacity-90 cursor-pointer'
                          : 'bg-muted text-muted-foreground/40 border-border cursor-not-allowed',
                      )}
                    >
                      <ArrowUp className="size-3.5" />
                      <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
                  >
                    <p className="text-sm text-destructive">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ═══ Divider ═══ */}
              {classrooms.length > 0 && (
                <>
                  <div className="h-px bg-border my-5" />

                  {/* Section label */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Recent sessions
                    </span>
                    <span className="text-[11px] font-medium bg-muted border border-border px-2 py-0.5 rounded-full text-muted-foreground">
                      {classrooms.length}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={triggerFileSelect}
                        disabled={importing}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <Upload className="size-3" />
                        {t('import.classroom')}
                      </button>
                      {PPTX_IMPORT_ENABLED && (
                        <button
                          onClick={triggerPptxFileSelect}
                          disabled={pptxImporting}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                          <Presentation className="size-3" />
                          {t('import.pptx')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sessions grid */}
                  {searchQuery.trim() && filteredClassrooms.length === 0 ? (
                    <div className="py-8 text-center text-[13px] text-muted-foreground/60">
                      {t('classroom.searchEmpty')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
                <div className="mt-4 flex items-center gap-4">
                  <button
                    onClick={triggerFileSelect}
                    disabled={importing}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Upload className="size-3.5" />
                    <span>{t('import.classroom')}</span>
                  </button>
                  {PPTX_IMPORT_ENABLED && (
                    <button
                      onClick={triggerPptxFileSelect}
                      disabled={pptxImporting}
                      className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Presentation className="size-3.5" />
                      <span>{t('import.pptx')}</span>
                    </button>
                  )}
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
    <div ref={containerRef} className="relative pl-4 pr-2 pt-3.5 pb-1 w-auto">
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
          className="flex items-center gap-2.5 cursor-pointer transition-all duration-200 group rounded-full px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]"
          onClick={() => setOpen(true)}
        >
          <div className="shrink-0 relative">
            <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-border/30 group-hover:ring-violet-400/60 dark:group-hover:ring-violet-400/40 transition-all duration-300">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-[7px] text-muted-foreground/70" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="leading-none select-none flex items-center gap-1">
                  <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors">
                    {t('home.greetingWithName', { name: displayName })}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {t('profile.editTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
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
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail — large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {slide && thumbWidth > 0 ? (
          <SlideThumbnail
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {showModeBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={modeBadgeLabel}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute bottom-2 left-2 inline-flex items-center justify-center size-5 rounded-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm z-10',
                  isTaskEngineMode
                    ? 'text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/35'
                    : 'text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/30',
                )}
              >
                <ModeBadgeIcon className="size-3" />
              </span>
            </TooltipTrigger>
            {/* Negative sideOffset compensates for the global Tooltip Arrow's
                rotate-45 bounding box, which Radix reserves as spacing. */}
            <TooltipContent
              side="top"
              align="start"
              sideOffset={-4}
              collisionPadding={0}
              className="text-xs"
            >
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
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
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
      <div className="mt-2.5 px-1 flex items-center gap-2">
        <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
        </span>
        {editing ? (
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
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
              className="w-full bg-transparent border-b border-violet-400/60 text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="font-medium text-[15px] truncate text-foreground/90 min-w-0 cursor-text"
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
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
