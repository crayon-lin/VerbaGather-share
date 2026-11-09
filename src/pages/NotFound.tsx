import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

export default function NotFound() {
  return (
    <EmptyState
      icon={<Compass size={22} />}
      title="这一页还没有写"
      description="地址可能拼错了，或者内容已经被移动。"
      action={
        <>
          <Link to="/" className="btn btn-primary">
            回到首页
          </Link>
          <Link to="/words" className="btn btn-ghost">
            去单词本
          </Link>
        </>
      }
    />
  )
}
