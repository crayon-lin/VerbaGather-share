import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Quote, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/Modal'
import { SpeakButton } from '@/components/SpeakButton'
import { EmptyState } from '@/components/EmptyState'
import { StateBadge } from '@/components/Badge'
import { toast } from '@/store/ui'
import { categoryLabel } from '@/lib/utils'
import type { Word } from '@shared/types'

type Tab = 'words' | 'sentences' | 'essays'

export default function Favorites() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('words')
  const [word, setWord] = useState<Word | null>(null)
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.favorites })
  const remove = useMutation({
    mutationFn: (input: { type: 'word' | 'sentence' | 'essay'; id: string }) =>
      api.toggleFavorite(input.type, input.id),
    onSuccess: () => {
      toast('已取消收藏')
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      queryClient.invalidateQueries({ queryKey: ['sentences'] })
      queryClient.invalidateQueries({ queryKey: ['essays'] })
    },
  })

  const data = favorites.data
  const tabs: Array<{ value: Tab; label: string; count: number }> = [
    { value: 'words', label: '单词', count: data?.words.length ?? 0 },
    { value: 'sentences', label: '句子', count: data?.sentences.length ?? 0 },
    { value: 'essays', label: '作文', count: data?.essays.length ?? 0 },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Saved"
        title="收藏夹"
        description="把想反复看的词、句子和范文放在一起；收藏不等于学习进度，随时可以取消。"
      />

      <div className="mb-5 flex items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`chip !px-4 !py-1.5 ${tab === t.value ? 'chip-active' : ''}`}
          >
            {t.label}
            <span className="ml-1 text-[9px] opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'words' &&
        (data?.words.length ? (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {data.words.map((w) => (
              <div
                key={w.id}
                className="flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-surface-2/50"
                onClick={() => setWord(w)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="serif text-lg">{w.term}</span>
                    <span className="font-mono text-[10px] text-muted">{w.phonetic}</span>
                    <StateBadge state={w.state} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                    {w.meaning_cn}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <SpeakButton text={w.term} size={15} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove.mutate({ type: 'word', id: w.id })
                    }}
                    className="grid h-7 w-7 place-items-center rounded-full text-amber hover:bg-surface-2"
                    aria-label="取消收藏"
                  >
                    <Star size={14} fill="currentColor" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Star size={22} />}
            title="还没有收藏单词"
            description="在词书详情里点收藏，或者把文章中的词收进生词本。"
            action={
              <Link to="/words" className="btn btn-primary">
                去单词本
              </Link>
            }
          />
        ))}

      {tab === 'sentences' &&
        (data?.sentences.length ? (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {data.sentences.map((s) => (
              <div key={s.id} className="card relative mb-4 break-inside-avoid p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                    {categoryLabel(s.category)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove.mutate({ type: 'sentence', id: s.id })}
                    className="text-amber"
                    aria-label="取消收藏"
                  >
                    <Star size={13} fill="currentColor" />
                  </button>
                </div>
                <p className="mt-3 serif text-[16px] leading-relaxed">
                  <Link to={`/sentences?focus=${s.id}`}>{s.text_en}</Link>
                </p>
                <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted">{s.text_cn}</p>
                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-[10px] text-muted">
                  <span className="truncate">
                    {s.author || '佚名'}
                    {s.source ? ` · ${s.source}` : ''}
                  </span>
                  <SpeakButton text={s.text_en} size={12} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Quote size={22} />}
            title="还没有收藏句子"
            description="读到喜欢的句子，点一下星标就会出现在这里。"
            action={
              <Link to="/sentences" className="btn btn-primary">
                去句子库
              </Link>
            }
          />
        ))}

      {tab === 'essays' &&
        (data?.essays.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.essays.map((e) => (
              <div key={e.id} className="card flex flex-col p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">
                    {e.level === 'cet6' ? 'CET-6' : 'CET-4'}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove.mutate({ type: 'essay', id: e.id })}
                    className="text-amber"
                    aria-label="取消收藏"
                  >
                    <Star size={13} fill="currentColor" />
                  </button>
                </div>
                <Link to={`/essays/${e.id}`} className="mt-3 block">
                  <h3 className="serif text-lg leading-snug hover:text-forest">{e.title_cn}</h3>
                  <p className="mt-1 line-clamp-1 text-[11px] text-muted">{e.title_en}</p>
                </Link>
                <div className="mt-auto pt-3 text-[10px] text-muted">{e.word_count} 词</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={22} />}
            title="还没有收藏作文"
            description="在范文详情点收藏，方便以后重读。"
            action={
              <Link to="/essays" className="btn btn-primary">
                去作文库
              </Link>
            }
          />
        ))}

      <Modal open={Boolean(word)} onClose={() => setWord(null)} title={word?.term} size="md">
        {word && (
          <div className="p-6">
            <div className="flex items-center gap-2">
              <span className="serif text-4xl">{word.term}</span>
              <SpeakButton text={word.term} size={18} />
            </div>
            <div className="mt-1.5 font-mono text-xs text-muted">{word.phonetic}</div>
            <div className="mt-4 whitespace-pre-line rounded-xl bg-surface-2/50 p-4 text-[15px] leading-relaxed">
              {word.meaning_cn}
            </div>
            {word.example_en && (
              <div className="mt-4 border-l-2 border-line pl-3">
                <p className="serif text-[15px] leading-relaxed">{word.example_en}</p>
                <p className="mt-1 text-xs text-muted">{word.example_cn}</p>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="text-[11px] text-danger hover:underline"
                onClick={() => {
                  remove.mutate({ type: 'word', id: word.id })
                  setWord(null)
                }}
              >
                取消收藏
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
