import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Flame,
  Home,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Quote,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  Star,
  Sun,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings, useUpdateSettings } from '@/lib/hooks'
import { initSpeech, stopSpeaking } from '@/lib/tts'
import { shortcutMatches } from '@/lib/shortcuts'
import { migrateLegacyEssayDrafts, migrateLegacyPaperStorage } from '@/lib/draftMigration'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { LevelSwitch } from './LevelSwitch'
import { SearchDialog } from './SearchDialog'
import { ToastHost } from './ToastHost'
import { AITranslate } from './AITranslate'

const NAV = [
  {
    label: '学习',
    items: [
      { to: '/', label: '首页', icon: Home },
      { to: '/words', label: '单词本', icon: BookOpen },
      { to: '/words/quiz', label: '小测', icon: ClipboardList },
      { to: '/papers', label: '真题', icon: ScrollText },
      { to: '/sentences', label: '句子库', icon: Quote },
      { to: '/essays', label: '作文', icon: PenLine },
    ],
  },
  {
    label: '记录',
    items: [
      { to: '/stats', label: '学习统计', icon: BarChart3 },
      { to: '/favorites', label: '收藏夹', icon: Star },
    ],
  },
]

const TITLES: Record<string, string> = {
  '': '学习台',
  words: '单词本',
  papers: '真题',
  sentences: '句子库',
  essays: '作文',
  stats: '学习统计',
  favorites: '收藏夹',
  settings: '设置',
}

export function Layout() {
  const location = useLocation()
  const segment = location.pathname.split('/')[1] || ''
  const queryClient = useQueryClient()
  const pageTitle = location.pathname.startsWith('/words/quiz')
    ? '小测'
    : location.pathname.startsWith('/words/learn')
      ? '新学'
      : location.pathname.startsWith('/words/review')
        ? '复习'
        : location.pathname.startsWith('/words/import')
          ? '导入单词'
          : TITLES[segment] || '拾词'
  const { settings } = useSettings()
  const update = useUpdateSettings()
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  const aiPanelOpen = useUIStore((s) => s.aiPanelOpen)
  const focusMode = useUIStore((s) => s.focusMode)
  const setFocusMode = useUIStore((s) => s.setFocusMode)
  const stats = useQuery({ queryKey: ['stats', 'overview'], queryFn: api.stats, staleTime: 30_000 })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('inkling-sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem('inkling-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      /* localStorage 不可用时只保留当前会话状态 */
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    document.title = `${pageTitle} · VerbaGather`
  }, [pageTitle])

  useEffect(() => {
    initSpeech()
  }, [])

  useEffect(() => {
    void Promise.all([migrateLegacyEssayDrafts(), migrateLegacyPaperStorage()]).then(
      ([drafts, papers]) => {
        if (drafts > 0) queryClient.invalidateQueries({ queryKey: ['essay-draft'] })
        if (papers > 0) queryClient.invalidateQueries({ queryKey: ['papers'] })
      },
    )
  }, [queryClient])

  useEffect(() => {
    window.scrollTo({ top: 0 })
    stopSpeaking()
  }, [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false)
        return
      }
      if (e.repeat) return
      const target = e.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (!typing && shortcutMatches(e, settings.shortcutFocus)) {
        e.preventDefault()
        setFocusMode(!focusMode)
        return
      }
      if (focusMode) return
      const searchShortcut = shortcutMatches(e, settings.shortcutSearch)
      const searchHasModifier = settings.shortcutSearch.includes('+')
      if (searchShortcut && (!typing || searchHasModifier)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    setSearchOpen,
    focusMode,
    setFocusMode,
    settings.shortcutSearch,
    settings.shortcutFocus,
  ])

  const effectiveDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const due = stats.data?.due ?? 0
  const newToday = stats.data?.today?.newWords ?? 0
  const goal = stats.data?.goals?.dailyNew ?? 20

  return (
    <div className="relative min-h-screen bg-paper text-ink">
      {settings.bgImage && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url("${settings.bgImage}")`,
              opacity: settings.bgOpacity ?? 0.22,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-0"
            style={{ backgroundColor: 'var(--c-paper)', opacity: effectiveDark ? 0.68 : 0.16 }}
          />
        </>
      )}
      {!focusMode && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden flex-col overflow-y-auto border-r border-line bg-paper/80 py-5 backdrop-blur transition-[width,padding] duration-200 lg:flex',
            sidebarCollapsed ? 'w-[76px] px-2.5' : 'w-[232px] px-4',
          )}
        >
        <div
          className={cn(
            'flex',
            sidebarCollapsed ? 'flex-col items-center gap-2.5' : 'items-center justify-between',
          )}
        >
          <Logo compact={sidebarCollapsed} className={sidebarCollapsed ? '' : 'px-2'} />
          <button
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
        <nav className={cn('flex-1', sidebarCollapsed ? 'mt-6 space-y-4' : 'mt-8 space-y-6')}>
          {NAV.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted/80">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const path = location.pathname
                  const active =
                    item.to === '/'
                      ? path === '/'
                      : item.to === '/words'
                        ? path.startsWith('/words') && !path.startsWith('/words/quiz')
                        : path === item.to || path.startsWith(`${item.to}/`)
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      aria-current={active ? 'page' : undefined}
                      aria-label={item.label}
                      title={item.label}
                      className={cn(
                        'group relative flex items-center rounded-xl py-2.5 text-[13.5px] transition-colors',
                        sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
                        active
                          ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                          : 'text-muted hover:bg-surface-2/70 hover:text-ink',
                      )}
                    >
                      <Icon
                        size={17}
                        className={cn('shrink-0', active ? 'text-forest' : 'text-muted/80')}
                      />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                      {!sidebarCollapsed && active && (
                        <span className="ml-auto h-1 w-1 rounded-full bg-forest" />
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {!sidebarCollapsed && (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">今日节奏</p>
              <Flame size={14} className={cn(stats.data?.streak ? 'text-amber' : 'text-muted/50')} />
            </div>
            <div className="mt-3 flex items-end gap-4">
              <div>
                <div className="serif text-[22px] leading-none">{newToday}</div>
                <div className="mt-1 text-[10px] text-muted">新词 / {goal}</div>
              </div>
              <div className="h-8 w-px bg-line" />
              <div>
                <div className="serif text-[22px] leading-none text-amber">{due}</div>
                <div className="mt-1 text-[10px] text-muted">待复习</div>
              </div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-forest transition-all"
                style={{ width: `${Math.min(100, goal ? (newToday / goal) * 100 : 0)}%` }}
              />
            </div>
            <Link
              to={due > 0 ? '/words/review' : '/words/learn'}
              className="mt-3 flex items-center justify-between text-[11px] font-medium text-forest hover:underline"
            >
              {due > 0 ? `开始今天的复习 · ${due} 个` : '去学新词'}
              <ChevronRight size={13} />
            </Link>
          </div>
        )}

        <Link
          to="/settings"
          aria-label="设置"
          title="设置"
          className={cn(
            'mt-3 flex items-center rounded-xl py-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2/70 hover:text-ink',
            sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
            location.pathname.startsWith('/settings') && 'bg-surface text-ink',
          )}
        >
          <SettingsIcon size={17} className="shrink-0" />
          {!sidebarCollapsed && '设置'}
        </Link>
        </aside>
      )}

      <div
        className={cn(
          'relative z-10 transition-[padding] duration-200',
          focusMode ? '' : sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[232px]',
          aiPanelOpen && !focusMode && 'xl:pr-[360px]',
        )}
      >
        {!focusMode && (
          <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-2 px-3 sm:px-6">
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <div className="ml-1 hidden text-sm font-medium text-ink-soft lg:block">{pageTitle}</div>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-ink sm:flex"
              >
                <Search size={15} />
                <span>搜索</span>
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink sm:hidden"
                aria-label="搜索"
              >
                <Search size={17} />
              </button>

              <LevelSwitch className="scale-[0.94] sm:scale-100" />

              <Link
                to="/stats"
                className="hidden items-center gap-1 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-ink sm:flex"
                title="连续打卡"
              >
                <Flame size={15} className={stats.data?.streak ? 'text-amber' : 'text-muted/50'} />
                <span className="tabular-nums">{stats.data?.streak ?? 0}</span>
              </Link>

              <button
                type="button"
                onClick={() => setFocusMode(true)}
                className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-[10px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="开启专注模式"
                title="专注模式"
              >
                <Maximize2 size={16} />
                <span className="hidden lg:inline">专注</span>
              </button>
              <button
                type="button"
                onClick={() => update.mutate({ theme: effectiveDark ? 'light' : 'dark' })}
                className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="切换深浅色"
              >
                {effectiveDark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <Link
                to="/settings"
                className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="设置"
              >
                <SettingsIcon size={17} />
              </Link>
            </div>
          </div>
          </header>
        )}

        <main
          className={cn(
            'mx-auto max-w-[1280px] px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:pb-14',
            focusMode && 'pb-10 pt-16 sm:pt-16',
          )}
        >
          <Outlet />
        </main>
      </div>

      {focusMode && (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          className="fixed right-4 top-4 z-[60] inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-2 text-[11px] font-medium text-ink-soft shadow-[var(--shadow-float)] backdrop-blur-md hover:text-ink sm:right-6 sm:top-6"
        >
          <Minimize2 size={14} />
          退出专注
        </button>
      )}

      {!focusMode && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-stretch justify-between px-2">
          {[
            { to: '/', label: '首页', icon: Home },
            { to: '/words', label: '单词', icon: BookOpen },
            { to: '/papers', label: '真题', icon: ScrollText },
            { to: '/sentences', label: '句子', icon: Quote },
            { to: '/essays', label: '作文', icon: PenLine },
            { to: '/stats', label: '统计', icon: BarChart3 },
          ].map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                    isActive ? 'text-forest' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>
      )}

      {!focusMode && <SearchDialog />}
      {!focusMode && <AITranslate />}
      <ToastHost />
    </div>
  )
}
