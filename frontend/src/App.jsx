import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, Check, ChevronDown,
  CircleHelp, Clock3, Code2, Database, ExternalLink, FileJson, Filter, Globe2,
  LayoutDashboard, LoaderCircle, Menu, Moon, MoreHorizontal, Play, Plus, RefreshCw,
  Rocket, Search, Settings2, ShieldCheck, Sparkles, Terminal, Trash2, X, Zap
} from 'lucide-react'
import { api } from './api'

const initialSelectors = 'main_heading: h1\nall_paragraphs: p'
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'new', label: 'New scrape', icon: Plus },
  { id: 'jobs', label: 'Scrape jobs', icon: Database },
  { id: 'history', label: 'Run history', icon: Clock3 },
]
const dateLabel = (value) => value ? new Date(value).toLocaleString() : 'Never'
const safeCount = (value) => Number(value || 0).toLocaleString()

function makeExportFilename(run, format) {
  let source = 'website'
  try {
    const parsed = new URL(run?.url || run?.result?.url)
    source = `${parsed.hostname.replace(/^www\./i, '')}${parsed.pathname}`
  } catch {
    // Fall back to a generic label when the source URL is unavailable.
  }

  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'website'
  const runId = run?.id ? `-run-${run.id}` : ''
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `smartscrape-${slug}${runId}-${stamp}.${format}`
}

function parseSelectors(raw) {
  return Object.fromEntries(raw.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const i = line.indexOf(':')
    if (i < 1) throw new Error(`Use "field_name: CSS selector" format: ${line}`)
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
  }).filter(([key, selector]) => key && selector))
}

function downloadResultCsv(run) {
  const data = run?.result

  if (!data) {
    throw new Error('No scrape result is available to export.')
  }

  const rows = [['section', 'field', 'value']]

  const addRow = (section, field, value) => {
    rows.push([section, field, value ?? ''])
  }

  for (const key of [
    'page_title',
    'meta_description',
    'url',
    'status_code',
  ]) {
    addRow('page', key, data[key])
  }

  for (const section of ['headings', 'custom']) {
    for (const [field, values] of Object.entries(data[section] || {})) {
      const items = Array.isArray(values) ? values : [values]
      for (const value of items) {
        addRow(section, field, value)
      }
    }
  }

  for (const field of ['links', 'images']) {
    for (const item of data[field] || []) {
      addRow(
        field,
        field === 'links' ? 'text' : 'alt',
        field === 'links' ? item.text : item.alt
      )
      addRow(field, 'url', item.url)
    }
  }

  const csv = '\uFEFF' + rows.map(row =>
    row.map(value => {
      const text = String(value ?? '')
      return `"${text.replace(/"/g, '""')}"`
    }).join(',')
  ).join('\r\n')

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = makeExportFilename(run, 'csv')
  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  // Restore navigation from the URL first, then localStorage. The URL hash
  // survives both browser refreshes and Vite's App.jsx hot-module reloads.
  const [active, setActive] = useState(() => {
    try {
      const hashPage = window.location.hash.replace(/^#/, '')
      if (nav.some(item => item.id === hashPage)) return hashPage
      const savedPage = window.localStorage.getItem('smartscrape-active-page')
      return nav.some(item => item.id === savedPage) ? savedPage : 'overview'
    } catch {
      return 'overview'
    }
  })
  const [jobs, setJobs] = useState([])
  const [runs, setRuns] = useState([])
  const [health, setHealth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [search, setSearch] = useState('')
  const [url, setUrl] = useState('')
  const [jobName, setJobName] = useState('Example homepage')
  const [selectorText, setSelectorText] = useState(initialSelectors)
  const [schedule, setSchedule] = useState('manual')
  const [saveJob, setSaveJob] = useState(true)
  const [result, setResult] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('smartscrape-open-job-result') || 'null') } catch { return null }
  })
  const [dark, setDark] = useState(true)
  const [mobileNav, setMobileNav] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)

    const results = await Promise.allSettled([
      api.jobs(),
      api.runs(),
      api.health(),
    ])

    const [jobResult, runResult, healthResult] = results

    if (jobResult.status === 'fulfilled') {
      const data = jobResult.value
      setJobs(Array.isArray(data) ? data : data.results || [])
    }

    if (runResult.status === 'fulfilled') {
      const data = runResult.value
      setRuns(Array.isArray(data) ? data : data.results || [])
    }

    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value.status === 'ok')
    } else {
      setHealth(false)
    }

    const errors = results
      .filter(result => result.status === 'rejected')
      .map(result => result.reason?.message || 'Unknown API error')

    if (errors.length) {
      setNotice({
        type: 'error',
        text: [...new Set(errors)].join(' | '),
      })
    }

    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    try {
      if (result) window.localStorage.setItem('smartscrape-open-job-result', JSON.stringify(result))
      else window.localStorage.removeItem('smartscrape-open-job-result')
    } catch { /* Ignore storage limits; the live result remains available. */ }
  }, [result])
  useEffect(() => {
    // Keep both storage and URL in sync. The URL is especially useful during
    // Vite HMR, which may remount React components when App.jsx is saved.
    try {
      window.localStorage.setItem('smartscrape-active-page', active)
    } catch {
      // Keep navigation usable if browser storage is disabled.
    }

    const nextHash = `#${active}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${nextHash}`
      )
    }
  }, [active])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const successfulRuns = runs.filter(run => run.status === 'success').length
  const records = runs.reduce((sum, run) => sum + Number(run.records_count || 0), 0)
  const filteredJobs = useMemo(() => jobs.filter(job =>
    `${job.name} ${job.url}`.toLowerCase().includes(search.toLowerCase())
  ), [jobs, search])
  const filteredRuns = useMemo(() => runs.filter(run =>
    `${run.url} ${run.status} ${run.job_name || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [runs, search])

  async function handleScrape(event) {
    event?.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const selectors = parseSelectors(selectorText)
      const run = await api.scrape({ url, selectors })
      setResult(run)
      setNotice({ type: 'success', text: 'Scrape completed successfully.' })
      if (saveJob) {
        await api.createJob({ name: jobName || new URL(url).hostname, url, selectors, schedule, is_active: true })
      }
      await refresh()
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function runJob(job) {
    setBusy(true)
    try {
      const run = await api.runJob(job.id)
      setResult({ ...run, _selectedJobId: job.id, _selectedJobName: job.name })
      // Keep the user on Scrape Jobs when launching a saved job.
      setActive('jobs')
      setNotice({ type: 'success', text: `Run finished for ${job.name}.` })
      await refresh()
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function deleteJob(job) {
    if (!window.confirm(`Delete "${job.name}"? Existing run history will remain.`)) return
    try {
      await api.deleteJob(job.id)
      setJobs(current => current.filter(item => item.id !== job.id))
      setNotice({ type: 'success', text: 'Job deleted.' })
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
  }

  async function openExport(run, format) {
    try {
      if (!run?.id) {
        throw new Error('Cannot export: the scrape run ID is missing.')
      }

      const response = await fetch(api.exportUrl(run.id, format))

      if (!response.ok) {
        const message = await response.text()
        throw new Error(
          `Export failed (${response.status}): ${message.slice(0, 250)}`
        )
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = downloadUrl
      link.download = makeExportFilename(run, format)
      document.body.appendChild(link)
      link.click()
      link.remove()

      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.message || 'Failed to download the export.',
      })
    }
  }

  const activeNav = nav.find(item => item.id === active)?.label || 'Overview'
  return (
    <div className={`app-shell ${dark ? 'theme-dark' : 'theme-light'}`}>
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Sparkles size={21} /></div>
          <div><strong>SmartScrape<span> AI</span></strong><small>DATA WORKSPACE</small></div>
          <button className="icon-btn mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          {nav.map(item => {
            const Icon = item.icon
            return <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => { if (item.id === 'jobs' || item.id === 'new') setResult(null); setActive(item.id); setMobileNav(false) }}>
              <Icon size={18}/><span>{item.label}</span>{item.id === 'jobs' && jobs.length > 0 && <small className="nav-count">{jobs.length}</small>}
            </button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="pro-card">
            <div className="pro-icon"><Rocket size={18}/></div>
            <strong>Ready for lift-off?</strong>
            <p>Automate repeat scraping tasks and keep your data fresh.</p>
            <button onClick={() => { setResult(null); setActive('new') }}>Create a scrape <ArrowRight size={14}/></button>
          </div>
          <div className="sidebar-user">
            <div className="avatar">SS</div><div className="user-copy"><strong>Scrape Studio</strong><small>Local workspace</small></div>
            <MoreHorizontal size={18} className="muted"/>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button>
            <span className="breadcrumb">Workspace</span><span className="crumb-slash">/</span><strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <div className={`connection ${health ? 'online' : 'offline'}`}><span/>{health ? 'API connected' : 'API disconnected'}</div>
            <button className="icon-btn" title="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Moon size={17}/> : <Sparkles size={17}/>}</button>
            <button className="avatar avatar-small" title="SmartScrape AI">SS</button>
          </div>
        </header>

        <div className="page-content">
          {notice && <div className={`toast ${notice.type}`}><span>{notice.type === 'success' ? <Check size={17}/> : <CircleHelp size={17}/>}</span>{notice.text}<button onClick={() => setNotice(null)}><X size={15}/></button></div>}

          {active === 'overview' && <Overview jobs={jobs} runs={runs} loading={loading} successfulRuns={successfulRuns} records={records} setActive={setActive} runJob={runJob} />}
          {active === 'new' && <NewScrape url={url} setUrl={setUrl} jobName={jobName} setJobName={setJobName} selectorText={selectorText} setSelectorText={setSelectorText} schedule={schedule} setSchedule={setSchedule} saveJob={saveJob} setSaveJob={setSaveJob} busy={busy} onSubmit={handleScrape} result={result} openExport={openExport} downloadResultCsv={downloadResultCsv} />}
          {active === 'jobs' && <Jobs jobs={filteredJobs} search={search} setSearch={setSearch} loading={loading} runJob={runJob} deleteJob={deleteJob} setActive={setActive} result={result} openExport={openExport} downloadResultCsv={downloadResultCsv} />}
          {active === 'history' && <History runs={filteredRuns} search={search} setSearch={setSearch} loading={loading} openExport={openExport} />}
        </div>
        <footer className="footer"><span>SmartScrape AI <span className="footer-dot">·</span> Built for structured web data</span><span><ShieldCheck size={14}/> Respectful scraping by design</span></footer>
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>
}
function MetricCard({ label, value, detail, icon: Icon, tone }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={18}/></div></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div>
}
function StatusPill({ status }) {
  const success = status === 'success' || status === true
  return <span className={`status-pill ${success ? 'status-success' : 'status-failed'}`}><span/>{success ? 'Success' : 'Failed'}</span>
}
function Overview({ jobs, runs, loading, successfulRuns, records, setActive, runJob }) {
  const successRate = runs.length ? Math.round(successfulRuns / runs.length * 100) : 0
  return <>
    <PageHeading eyebrow="YOUR SCRAPING COMMAND CENTER" title="Good data starts here." subtitle="Build repeatable scrapes, turn pages into structured data, and keep everything in one place." action={<button className="btn btn-primary" onClick={() => setActive('new')}><Plus size={17}/> New scrape</button>}/>
    <div className="hero-banner"><div className="hero-copy"><div className="hero-kicker"><Sparkles size={14}/> YOUR WEB DATA, ORGANIZED</div><h2>From URL to useful data.<br/><span>Without the busywork.</span></h2><p>Extract, organize, and automate public web data with a workflow built for speed and clarity.</p><button className="btn btn-white" onClick={() => setActive('new')}>Start extracting <ArrowUpRight size={16}/></button></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-core"><Bot size={35}/></div><div className="float-chip chip-one"><Code2 size={15}/><span>HTML parsed</span><Check size={14}/></div><div className="float-chip chip-two"><Database size={15}/><span>Data structured</span></div><div className="float-chip chip-three"><Zap size={15}/><span>Workflow ready</span></div></div></div>
    <div className="section-head"><div><h2>Workspace overview</h2><p>A quick pulse on your scraping activity</p></div><button className="text-btn" onClick={() => setActive('history')}>View activity <ArrowRight size={15}/></button></div>
    <div className="metric-grid">
      <MetricCard label="Saved jobs" value={safeCount(jobs.length)} detail="Reusable configurations" icon={Database} tone="violet"/>
      <MetricCard label="Total runs" value={safeCount(runs.length)} detail="All recorded attempts" icon={Activity} tone="blue"/>
      <MetricCard label="Success rate" value={`${successRate}%`} detail="Across recorded runs" icon={Check} tone="green"/>
      <MetricCard label="Custom values" value={safeCount(records)} detail="Values extracted by selectors" icon={FileJson} tone="orange"/>
    </div>
    <div className="content-grid">
      <section className="panel activity-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Your latest extraction runs</p></div><button className="icon-btn" onClick={() => window.location.reload()} title="Refresh"><RefreshCw size={16}/></button></div>
        {loading ? <EmptyState icon={LoaderCircle} title="Loading activity" text="Connecting to your workspace…"/> : runs.length ? <div className="activity-list">{runs.slice(0,5).map(run => <div className="activity-row" key={run.id}><div className={`activity-symbol ${run.status}`}><Globe2 size={17}/></div><div className="activity-info"><strong>{run.job_name || new URL(run.url).hostname}</strong><span className="truncate">{run.url}</span><small>{dateLabel(run.created_at)} · {run.duration_ms} ms</small></div><StatusPill status={run.status}/></div>)}</div> : <EmptyState icon={Activity} title="No activity yet" text="Your scrape runs will appear here once you start extracting." action={() => setActive('new')} actionLabel="Run your first scrape"/>}
      </section>
      <section className="panel jobs-panel"><div className="panel-heading"><div><h3>Quick launch</h3><p>Run a saved scraping job</p></div><button className="text-btn" onClick={() => setActive('jobs')}>All jobs <ArrowRight size={14}/></button></div>
        {jobs.length ? <div className="quick-jobs">{jobs.slice(0,4).map(job => <div className="quick-job" key={job.id}><div className="job-favicon"><Globe2 size={17}/></div><div className="quick-job-copy"><strong>{job.name}</strong><span className="truncate">{job.url}</span><small>{job.schedule === 'manual' ? 'Manual run' : job.schedule.replaceAll('_',' ')}</small></div><button className="run-icon" onClick={() => runJob(job)} title="Run job"><Play size={15} fill="currentColor"/></button></div>)}</div> : <EmptyState icon={Rocket} title="Your launchpad is empty" text="Save a scrape configuration to rerun it in one click." action={() => setActive('new')} actionLabel="Create a job"/>}
      </section>
    </div>
  </>
}
function NewScrape({ url, setUrl, jobName, setJobName, selectorText, setSelectorText, schedule, setSchedule, saveJob, setSaveJob, busy, onSubmit, result, openExport, downloadResultCsv }) {
  return <>
    <PageHeading eyebrow="EXTRACT STRUCTURED DATA" title="New scrape" subtitle="Point SmartScrape at a public page and choose exactly what you want to collect."/>
    <div className="scrape-layout">
      <form className="panel scrape-form" onSubmit={onSubmit}>
        <div className="form-section-title"><div className="step-number">01</div><div><h3>Target website</h3><p>Enter the page you want to inspect.</p></div></div>
        <label className="field-label" htmlFor="url">Page URL <span className="required">*</span></label>
        <div className="url-input"><Globe2 size={17}/><input id="url" type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/products"/><span className="https-tag"><ShieldCheck size={13}/> URL</span></div>
        <div className="field-hint">Use a public HTTP or HTTPS page that you are authorized to scrape.</div>
        <div className="form-divider"/>
        <div className="form-section-title"><div className="step-number">02</div><div><h3>Extraction rules</h3><p>Define custom fields with CSS selectors.</p></div></div>
        <label className="field-label" htmlFor="selectors">Custom CSS selectors <span className="optional">OPTIONAL</span></label>
        <textarea id="selectors" className="code-input" value={selectorText} onChange={e => setSelectorText(e.target.value)} spellCheck="false" rows={5}/>
        <div className="field-hint">One per line: <code>field_name: CSS selector</code>. Examples: <code>price: .price</code>, <code>cards: article.product</code>.</div>
        <div className="selector-presets"><span>Quick add</span><button type="button" onClick={() => setSelectorText(v => `${v.trim()}\npage_title: title`)}>Page title</button><button type="button" onClick={() => setSelectorText(v => `${v.trim()}\nall_buttons: button`)}>Buttons</button><button type="button" onClick={() => setSelectorText(v => `${v.trim()}\narticle_text: article`)}>Article</button></div>
        <div className="form-divider"/>
        <div className="form-section-title"><div className="step-number">03</div><div><h3>Save & automate</h3><p>Keep this setup ready for future runs.</p></div></div>
        <label className="toggle-row"><span className="toggle-copy"><strong>Save as a reusable job</strong><small>Store this URL and its selectors for later.</small></span><input type="checkbox" checked={saveJob} onChange={e => setSaveJob(e.target.checked)}/><span className="toggle-ui"/></label>
        {saveJob && <div className="save-options"><div className="field-group"><label className="field-label" htmlFor="jobName">Job name</label><input className="text-input" id="jobName" value={jobName} onChange={e => setJobName(e.target.value)} placeholder="e.g. Product catalog"/></div><div className="field-group"><label className="field-label" htmlFor="schedule">Schedule</label><select id="schedule" className="text-input" value={schedule} onChange={e => setSchedule(e.target.value)}><option value="manual">Manual only</option><option value="every_15_minutes">Every 15 minutes</option><option value="hourly">Hourly</option><option value="daily">Daily</option></select></div></div>}
        <div className="form-actions"><span><ShieldCheck size={15}/> Respectful request settings enabled</span><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin"/> Scraping…</> : <><Play size={16} fill="currentColor"/> Preview scrape</>}</button></div>
        <div className="result-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => downloadResultCsv(result)}
            disabled={!result?.result}
          >
            <ArrowDownToLine size={15} /> CSV
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => openExport(result, 'json')}
          >
            <FileJson size={15} /> JSON
          </button>
        </div>
      </form>
      <aside className="scrape-side">
        <div className="panel side-tip"><div className="tip-icon"><Sparkles size={19}/></div><h3>Smart extraction tips</h3><p>Start with broad selectors, preview the output, then narrow down to the fields you need.</p><div className="tip-example"><span>CSS SELECTOR</span><code>h1, .product-title</code><small>Collects matching text from both selectors.</small></div><div className="tip-example"><span>CSS SELECTOR</span><code>article p</code><small>Finds paragraph elements inside articles.</small></div></div>
        <div className="panel included-panel"><h3><ShieldCheck size={17}/> Included automatically</h3>{['Page title & meta description','Headings (H1–H6)','Links and destination URLs','Images and alt text','Response status and duration'].map(item => <div className="included-item" key={item}><Check size={15}/>{item}</div>)}</div>
        <div className="safe-note"><ShieldCheck size={17}/><span><strong>Safe by default</strong><br/>Local and private-network addresses are blocked. Always follow site terms and applicable rules.</span></div>
      </aside>
    </div>
    {result && <section className="panel result-panel"><div className="panel-heading"><div><div className="eyebrow">SCRAPE RESULT</div><h3>{result.result?.page_title || result.url}</h3><p>{result.url} · {result.duration_ms} ms</p></div><div className="result-actions"><button className="btn btn-secondary" onClick={() => downloadResultCsv(result)} disabled={!result.result}><ArrowDownToLine size={15}/> CSV</button><button className="btn btn-secondary" onClick={() => openExport(result, 'json')}><FileJson size={15}/> JSON</button></div></div>
      {result.status === 'success' ? <><div className="result-stats"><div><span>Links</span><strong>{result.result?.stats?.links_found || 0}</strong></div><div><span>Images</span><strong>{result.result?.stats?.images_found || 0}</strong></div><div><span>Custom fields</span><strong>{Object.keys(result.result?.custom || {}).length}</strong></div><div><span>Status code</span><strong>{result.result?.status_code || '—'}</strong></div></div><ImageGallery images={result.result?.images || []} /><VideoGallery videos={result.result?.videos || []} links={result.result?.links || []} images={result.result?.images || []} /><pre className="json-preview">{JSON.stringify(result.result, null, 2)}</pre></> : <div className="error-block">{result.error || 'Scrape failed.'}</div>}
    </section>}
  </>
}
function VideoGallery({ videos = [], links = [], images = [] }) {
  const [brokenPreviews, setBrokenPreviews] = useState({})
  const directVideos = videos
    .filter(item => typeof item?.url === 'string' && item.url.trim())
    .map((item, index) => ({
      ...item,
      label: item.title?.trim() || item.alt?.trim() || `Video ${index + 1}`,
      href: item.page_url || item.url,
      mediaUrl: item.url,
      direct: /\.(mp4|webm|ogg|mov)(?:[?#]|$)/i.test(item.url) ||
        /^video\//i.test(item.type || item.mime_type || ''),
    }))

  // Some sites (including Instagram profiles) expose a Reel/Clip page rather
  // than a downloadable .mp4 URL. Treat those links as video entries too.
  const reelLinks = links
    .filter(item => typeof item?.url === 'string' &&
      (/\/reel\//i.test(item.url) || /\/(video|videos)\//i.test(item.url) ||
       /^(clip|reel|video)$/i.test((item.text || '').trim())))
    .map((item, index) => ({
      label: item.text?.trim() || `Clip ${index + 1}`,
      href: item.url,
      direct: false,
    }))

  const seen = new Set(directVideos.map(item => item.href))
  const allVideos = [
    ...directVideos,
    ...reelLinks.filter(item => { if (seen.has(item.href)) return false; seen.add(item.href); return true }),
  ]
  if (!allVideos.length) return null

  const videoThumbnails = images.filter(item =>
    typeof item?.url === 'string' && /^video\b/i.test(item.alt?.trim() || '')
  )

  return <section style={{ margin: '22px 0 18px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16 }}>Video & clips</h3>
        <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: 13 }}>Play direct video files or open Reel/Clip pages</p>
      </div>
      <span style={{ fontSize: 12, padding: '5px 9px', borderRadius: 999, background: 'rgba(14, 165, 233, .14)' }}>{allVideos.length} videos</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {allVideos.map((item, index) => {
        const thumbnail = item.thumbnail || item.preview_image ||
          videoThumbnails[index % Math.max(videoThumbnails.length, 1)]?.url
        const label = item.label || `Video ${index + 1}`
        return <article key={`${item.href}-${index}`} style={{ minWidth: 0, overflow: 'hidden', border: '1px solid var(--border, rgba(148,163,184,.25))', borderRadius: 12, background: 'var(--panel, rgba(148,163,184,.06))' }}>
          <div style={{ height: 150, position: 'relative', display: 'grid', placeItems: 'center', background: 'rgba(148,163,184,.09)', overflow: 'hidden' }}>
            {item.direct ? <video src={item.mediaUrl} controls preload="metadata" poster={thumbnail} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setBrokenPreviews(current => ({ ...current, [index]: true }))} /> :
              thumbnail && !brokenPreviews[index] ? <a href={item.href} target="_blank" rel="noreferrer" title="Open video page" style={{ width: '100%', height: '100%', position: 'relative', display: 'block' }}>
                <img src={thumbnail} alt={label} loading="lazy" onError={() => setBrokenPreviews(current => ({ ...current, [index]: true }))} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.22)', color: 'white', fontSize: 30 }}>▶</span>
              </a> : <a href={item.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'grid', placeItems: 'center', width: '100%', height: '100%', gap: 6 }}>
                <span style={{ fontSize: 32 }}>▶</span><span style={{ fontSize: 12, opacity: .75 }}>Open video page</span>
              </a>}
          </div>
          <div style={{ padding: '9px 10px' }}>
            <div title={label} style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</div>
            <a href={item.href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7, fontSize: 12, color: 'var(--accent, #8b5cf6)', textDecoration: 'none' }}>
              <ExternalLink size={13} /> Open original
            </a>
          </div>
        </article>
      })}
    </div>
    <p style={{ margin: '9px 0 0', fontSize: 12, opacity: .65 }}>Some platforms provide only a clip page or thumbnail, not the actual video file. Those items open on the original website.</p>
  </section>
}

function ImageGallery({ images = [] }) {
  const [brokenImages, setBrokenImages] = useState({})
  const usableImages = images.filter(item => typeof item?.url === 'string' && item.url.trim())

  return <section style={{ margin: '22px 0 18px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16 }}>Image gallery</h3>
        <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: 13 }}>Preview images found on this page</p>
      </div>
      <span style={{ fontSize: 12, padding: '5px 9px', borderRadius: 999, background: 'rgba(139, 92, 246, .14)' }}>{usableImages.length} images</span>
    </div>
    {!usableImages.length ? <div style={{ padding: 18, border: '1px dashed var(--border, rgba(148,163,184,.35))', borderRadius: 12, opacity: .75, fontSize: 13 }}>No image URLs were found on this page.</div> :
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {usableImages.map((item, index) => {
          const label = item.alt?.trim() || `Image ${index + 1}`
          const failed = brokenImages[index]
          return <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" title="Open original image in a new tab" style={{ minWidth: 0, overflow: 'hidden', display: 'block', textDecoration: 'none', color: 'inherit', border: '1px solid var(--border, rgba(148,163,184,.25))', borderRadius: 12, background: 'var(--panel, rgba(148,163,184,.06))', transition: 'transform .18s ease, border-color .18s ease' }}>
            <div style={{ height: 125, display: 'grid', placeItems: 'center', background: 'rgba(148,163,184,.09)', overflow: 'hidden' }}>
              {failed ? <div style={{ textAlign: 'center', padding: 12, fontSize: 12, opacity: .7 }}><div style={{ fontSize: 24, marginBottom: 5 }}>▧</div>Preview unavailable</div> : <img src={item.url} alt={label} loading="lazy" onError={() => setBrokenImages(current => ({ ...current, [index]: true }))} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            </div>
            <div style={{ padding: '9px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</div>
              <div style={{ fontSize: 11, opacity: .65, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 4 }}>{item.url}</div>
              <div style={{ fontSize: 11, marginTop: 7, color: 'var(--accent, #a78bfa)' }}>Open original ↗</div>
            </div>
          </a>
        })}
      </div>
    }
  </section>
}

function Jobs({ jobs, search, setSearch, loading, runJob, deleteJob, setActive, result, openExport, downloadResultCsv }) {
  const [page, setPage] = useState(1)
  const pageSize = 5
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize))
  const visibleJobs = jobs.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { setPage(current => Math.min(current, pageCount)) }, [pageCount])
  return <>
    <PageHeading eyebrow="REUSABLE CONFIGURATIONS" title="Scrape jobs" subtitle="Manage your saved targets and launch repeatable data extraction." action={<button className="btn btn-primary" onClick={() => { setResult(null); setActive('new') }}><Plus size={17}/> New job</button>}/>
    <div className="toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search jobs or URLs…"/></div><div className="toolbar-meta"><Filter size={15}/>{jobs.length} jobs</div></div>
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>JOB</th><th>SCHEDULE</th><th>LAST RUN</th><th>RUNS</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
      {visibleJobs.map(job => { const isSelected = result && (String(result._selectedJobId ?? result.job_id ?? result.job?.id ?? '') === String(job.id) || (!result._selectedJobId && !result.job_id && !result.job?.id && result.url && result.url === job.url)); return <tr key={job.id} className={isSelected ? 'selected-job-row' : undefined} aria-current={isSelected ? 'true' : undefined} style={isSelected ? { background: 'rgba(139, 92, 246, .13)', boxShadow: 'inset 3px 0 0 #a78bfa' } : undefined}><td><div className="table-primary"><div className="job-favicon"><Globe2 size={16}/></div><div><strong>{job.name}</strong><span>{job.url}</span></div></div></td><td><span className="schedule-chip">{job.schedule === 'manual' ? 'Manual' : job.schedule.replaceAll('_',' ')}</span></td><td>{dateLabel(job.last_run_at)}</td><td>{job.run_count ?? '—'}</td><td><span className={`active-state ${job.is_active ? 'is-active' : ''}`}><span/>{job.is_active ? 'Active' : 'Paused'}</span></td><td><div className="table-actions"><button className="run-icon" onClick={() => runJob(job)} title="Run job"><Play size={14} fill="currentColor"/></button><button className="icon-btn danger-hover" onClick={() => deleteJob(job)} title="Delete job"><Trash2 size={15}/></button></div></td></tr> })}
      {!jobs.length && <tr><td colSpan="6"><EmptyState icon={Database} title={loading ? 'Loading jobs…' : 'No matching jobs'} text={loading ? 'Fetching saved configurations.' : 'Create a scrape and save it as a job to see it here.'} action={!loading ? () => setActive('new') : undefined} actionLabel="Create a job"/></td></tr>}
    </tbody></table></div></div>
    {jobs.length > pageSize && <div className="pagination" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 14 }}>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, jobs.length)} of {jobs.length}</span>
      <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
      <span style={{ fontSize: 12 }}>Page {page} of {pageCount}</span>
      <button className="btn btn-secondary" disabled={page === pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
    </div>}
    {result && <section className="panel result-panel" style={{ marginTop: 20 }}>
      <div className="panel-heading"><div><div className="eyebrow">LATEST JOB RESULT</div><h3>{result.result?.page_title || result.url || 'Scrape result'}</h3><p>{result.url || ''}{result.duration_ms != null ? ` · ${result.duration_ms} ms` : ''}</p></div><div className="result-actions"><button className="btn btn-secondary" onClick={() => downloadResultCsv(result)} disabled={!result.result}><ArrowDownToLine size={15}/> CSV</button><button className="btn btn-secondary" onClick={() => openExport(result, 'json')} disabled={!result.id}><FileJson size={15}/> JSON</button></div></div>
      {result.status === 'success' ? <><div className="result-stats"><div><span>Links</span><strong>{result.result?.stats?.links_found || 0}</strong></div><div><span>Images</span><strong>{result.result?.stats?.images_found || 0}</strong></div><div><span>Custom fields</span><strong>{Object.keys(result.result?.custom || {}).length}</strong></div><div><span>Status code</span><strong>{result.result?.status_code || '—'}</strong></div></div><ImageGallery images={result.result?.images || []} /><VideoGallery videos={result.result?.videos || []} links={result.result?.links || []} images={result.result?.images || []} /><pre className="json-preview">{JSON.stringify(result.result, null, 2)}</pre></> : <div className="error-block">{result.error || 'Scrape failed.'}</div>}
    </section>}
  </>
}
function History({ runs, search, setSearch, loading, openExport }) {
  return <>
    <PageHeading eyebrow="AUDIT TRAIL" title="Run history" subtitle="Review previous extraction attempts, inspect outcomes, and export captured data."/>
    <div className="toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search URL, job, or status…"/></div><div className="toolbar-meta"><Activity size={15}/>{runs.length} runs</div></div>
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>URL / JOB</th><th>STATUS</th><th>RECORDS</th><th>DURATION</th><th>RUN DATE</th><th>EXPORT</th></tr></thead><tbody>
      {runs.map(run => <tr key={run.id}><td><div className="run-url"><strong>{run.job_name || 'One-off scrape'}</strong><span>{run.url}</span>{run.error && <small className="error-text">{run.error}</small>}</div></td><td><StatusPill status={run.status}/></td><td>{safeCount(run.records_count)}</td><td>{run.duration_ms} ms</td><td>{dateLabel(run.created_at)}</td><td><div className="table-actions"><button className="icon-btn" onClick={() => openExport(run, 'csv')} title="Export CSV"><ArrowDownToLine size={15}/></button><button className="icon-btn" onClick={() => openExport(run, 'json')} title="Export JSON"><FileJson size={15}/></button></div></td></tr>)}
      {!runs.length && <tr><td colSpan="6"><EmptyState icon={Clock3} title={loading ? 'Loading history…' : 'No runs recorded'} text={loading ? 'Fetching recent activity.' : 'Your run history will show up here after the first scrape.'}/></td></tr>}
    </tbody></table></div></div>
  </>
}
function EmptyState({ icon: Icon, title, text, action, actionLabel }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={21}/></div><strong>{title}</strong><p>{text}</p>{action && <button className="text-btn" onClick={action}>{actionLabel || 'Get started'} <ArrowRight size={14}/></button>}</div>
}

export default App
