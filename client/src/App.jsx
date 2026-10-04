import { useState } from 'react'

const fmtTime = (s) => {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const fmtSize = (b) => (b ? ` · ${(b / 1048576).toFixed(1)} MB` : '')

function prepareHref(url, f) {
  const q = new URLSearchParams({ url })
  if (f.type === 'video') q.set('height', f.height)
  else q.set('type', f.type)
  return `/api/prepare?${q}`
}

function statusText(job) {
  switch (job.stage) {
    case 'download': {
      const what = job.type === 'mp3' || job.part > 1 ? 'audio' : 'video'
      const extra = [job.speed, job.eta && `ETA ${job.eta}`].filter(Boolean).join(' · ')
      return `Downloading ${what}… ${job.percent.toFixed(1)}%${extra ? ` · ${extra}` : ''}`
    }
    case 'merging': return 'Merging video + audio…'
    case 'converting': return 'Converting to MP3…'
    default: return 'Starting…'
  }
}

export default function App() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)

  function prepare(f) {
    setError('')
    setJob({ label: f.label, type: f.type, stage: 'starting' })
    const es = new EventSource(prepareHref(url.trim(), f))
    es.onmessage = (e) => {
      const d = JSON.parse(e.data)
      if (d.stage === 'done') {
        es.close()
        setJob(null)
        window.location.href = `/api/file/${d.id}`
      } else if (d.stage === 'error') {
        es.close()
        setJob(null)
        setError(d.error)
      } else {
        setJob((j) => ({ ...j, ...d }))
      }
    }
    es.onerror = () => {
      es.close()
      setJob(null)
      setError('Lost connection to server while preparing the file')
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo(null)
    try {
      const res = await fetch(`/api/info?${new URLSearchParams({ url: url.trim() })}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInfo(data)
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <h1>Video Downloader</h1>
      <p className="hint center">YouTube · Facebook · Instagram · TikTok</p>
      <form onSubmit={onSubmit}>
        <label htmlFor="url" className="sr-only">Video URL</label>
        <input
          id="url"
          type="url"
          required
          placeholder="Paste a YouTube, Facebook, Instagram or TikTok link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button disabled={loading}>{loading ? 'Loading…' : 'Download'}</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {info && (
        <section className="card">
          <img src={info.thumbnail} alt="" referrerPolicy="no-referrer" />
          <div>
            <h2>{info.title}</h2>
            <p className="meta">{[info.uploader, fmtTime(info.duration)].filter(Boolean).join(' · ')}</p>
            <ul className="formats">
              {info.formats.map((f) => (
                <li key={f.label}>
                  <button type="button" disabled={!!job} onClick={() => prepare(f)}>
                    {f.type === 'mp3' ? 'MP3 audio' : `MP4 ${f.label}`}{fmtSize(f.size)}
                  </button>
                </li>
              ))}
            </ul>
            {job ? (
              <div className="progress" aria-live="polite">
                <p>Preparing {job.label}: {statusText(job)}</p>
                <progress max="100" value={job.stage === 'download' ? job.percent : undefined} />
              </div>
            ) : (
              <p className="hint">The server prepares the file first; progress shows here.</p>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
