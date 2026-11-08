import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useSettings } from './lib/hooks'
import Home from './pages/Home'
import Words from './pages/Words'
import BookDetail from './pages/BookDetail'
import Learn from './pages/Learn'
import Review from './pages/Review'
import Quiz from './pages/Quiz'
import Papers from './pages/Papers'
import Sentences from './pages/Sentences'
import Essays from './pages/Essays'
import EssayDetail from './pages/EssayDetail'
import Stats from './pages/Stats'
import Favorites from './pages/Favorites'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

const ImportPage = lazy(() => import('./pages/Import'))
const EssayPractice = lazy(() => import('./pages/EssayPractice'))

function ThemeSync() {
  const { settings } = useSettings()
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#101412' : '#f7f3e9')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])
  return null
}

function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-forest" />
        正在打开…
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <ThemeSync />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="words" element={<Words />} />
            <Route path="words/books/:id" element={<BookDetail />} />
            <Route path="words/learn" element={<Learn />} />
            <Route path="words/review" element={<Review />} />
            <Route path="words/quiz" element={<Quiz />} />
            <Route path="papers" element={<Papers />} />
            <Route path="words/import" element={<ImportPage />} />
            <Route path="sentences" element={<Sentences />} />
            <Route path="essays" element={<Essays />} />
            <Route path="essays/practice" element={<EssayPractice />} />
            <Route path="essays/:id" element={<EssayDetail />} />
            <Route path="stats" element={<Stats />} />
            <Route path="favorites" element={<Favorites />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}
