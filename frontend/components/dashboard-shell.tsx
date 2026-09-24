'use client'

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLayoutEffect, useRef, useState, Fragment } from 'react'
import { Bell, Bot, CalendarDays, ChevronDown, CircleHelp, CreditCard, LayoutDashboard, Search, Send, Settings, Sparkles, Wallet, WalletMinimal, ArrowLeftRight, Activity, Link2, Landmark, type LucideIcon } from 'lucide-react'
import { useProfile } from '@/hooks/profile'
import { fetchActivity } from '@/lib/activity'
import { resolveUsernameApi, checkUsername } from '@/lib/api'
import { money, initials, shortAddr, timeAgo } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/chain'

type NavItem = { label: string; href: string; icon: LucideIcon; group: string; description: string; soon?: boolean }

interface NotifItem { id: string; title: string; body: string; time: string; read: boolean }

const nav: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, group: 'Main', description: 'Your account at a glance' },
  { label: 'Pay & Own', href: '/pay-and-own', icon: CreditCard, group: 'Main', description: 'Turn everyday payments into ownership' },
  { label: 'Subscriptions', href: '/subscriptions', icon: CalendarDays, group: 'Main', description: 'Manage and track your subscriptions' },
  { label: 'Portfolio', href: '/portfolio', icon: Wallet, group: 'Main', description: 'See the assets you own' },
  { label: 'Activity', href: '/activity', icon: Activity, group: 'Main', description: 'Your transactions and history' },
  { label: 'Wallet', href: '/wallet', icon: WalletMinimal, group: 'Wallet', description: 'Your wallet balance and funds' },
  { label: 'Send', href: '/send', icon: Send, group: 'Wallet', description: 'Send money to anyone' },
  { label: 'Receive', href: '/receive', icon: Landmark, group: 'Wallet', description: 'Get paid and receive funds' },
  { label: 'Swap', href: '/swap', icon: ArrowLeftRight, group: 'Wallet', description: 'Swap tokens via Kuru Flow' },
  { label: 'Payment Link', href: '/payment-link', icon: Link2, group: 'Wallet', description: 'Create and share payment links' },
  { label: 'AI Terminal', href: '/terminal', icon: Bot, group: 'AI', description: 'Ask the AI about your money' },
]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname
  const navigate = useNavigate()
  const { profile, address } = useProfile()
  const activeIndex = nav.findIndex(item => item.href === pathname)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const currentIndex = hoverIndex ?? (activeIndex >= 0 ? activeIndex : 0)
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [resolvedUser, setResolvedUser] = useState<{ username: string; address: string } | null>(null)
  const [resolveError, setResolveError] = useState('')
  const [notif, setNotif] = useState<{ x: number; y: number } | null>(null)
  const [notifications, setNotifications] = useState<NotifItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const notifLoaded = useRef(false)
  const unread = notifications.filter(n => !n.read).length
  const current = nav[activeIndex >= 0 ? activeIndex : 0]?.label || 'Overview'

  const displayName = profile?.fullName || profile?.username || 'FluxPay user'
  const emailLabel = profile?.email || (address ? shortAddr(address) : '…')

  const showTip = (i: number, e: React.MouseEvent) => {
    if (i === activeIndex) { setTip(null); return }
    setTip({ index: i, x: e.clientX, y: e.clientY })
  }
  const moveTip = (e: React.MouseEvent) => {
    const el = tipRef.current
    if (el) { el.style.left = `${e.clientX}px`; el.style.top = `${e.clientY}px` }
  }

  useLayoutEffect(() => {
    const link = linkRefs.current[currentIndex]
    const indicator = indicatorRef.current
    if (!link || !indicator) return
    indicator.style.width = `${link.offsetWidth}px`
    indicator.style.transform = `translateX(${link.offsetLeft}px)`
  }, [currentIndex, pathname])

  const openNotifications = (e: React.MouseEvent) => {
    setNotif({ x: e.clientX, y: e.clientY })
    if (notifLoaded.current || !address) return
    notifLoaded.current = true
    setNotifLoading(true)
    fetchActivity(address, 20_000)
      .then(items => {
        setNotifications(
          items.slice(0, 8).map(i => ({
            id: i.hash,
            title: i.kind === 'received' ? 'Payment received' : 'Payment sent',
            body: `${i.kind === 'received' ? '+' : '−'}${i.amount.toFixed(4)} ${i.token ?? ''} ${i.kind === 'received' ? 'from' : 'to'} ${shortAddr(i.counterparty)}`,
            time: timeAgo(i.ts),
            read: false,
          })),
        )
      })
      .catch(() => setNotifications([]))
      .finally(() => setNotifLoading(false))
  }

  const pageMatches = nav.filter(n => !n.soon && n.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))

  const resolveSearch = async () => {
    setResolvedUser(null)
    setResolveError('')
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '')
    if (!/^[a-z0-9_]{3,32}$/.test(q)) return
    try {
      const avail = await checkUsername(q)
      if (!avail.available) {
        const r = await resolveUsernameApi(q)
        setResolvedUser(r)
      } else {
        setResolveError(`@${q} is not registered yet`)
      }
    } catch {
      setResolveError('Lookup failed — try again')
    }
  }

  return (
    <div className="dashboard-app">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard"><span>F</span> FluxPay</Link>
        <nav className="dashboard-nav" onMouseLeave={() => setHoverIndex(null)}>
          <span className="nav-indicator" ref={indicatorRef} />
          {nav.map((item, i) => {
            const Icon = item.icon
            return <Fragment key={item.href}>
              {i > 0 && nav[i - 1].group !== item.group && <span className="nav-divider" aria-hidden="true" />}
              <Link ref={el => { linkRefs.current[i] = el }} aria-current={pathname === item.href ? 'page' : undefined} aria-disabled={item.soon || undefined} className={`${pathname === item.href ? 'nav-link active' : 'nav-link'}${item.soon ? ' is-soon' : ''}`} to={item.href} onClick={item.soon ? e => e.preventDefault() : undefined} onMouseEnter={e => { setHoverIndex(i); showTip(i, e) }} onMouseMove={moveTip} onMouseLeave={() => setTip(null)}><Icon size={16} /><span>{item.label}</span>{item.soon && <span className="soon-badge">Soon</span>}</Link>
            </Fragment>
          })}
        </nav>
        <div className="header-actions">
          <button aria-label="Search" onClick={() => setSearchOpen(true)}><Search size={16} /></button>
          <button aria-label="Notifications" className={`notification${unread ? ' has-unread' : ''}`} onClick={openNotifications}><Bell size={16} /></button>
          <div className="avatar header-avatar">{initials(displayName)}</div>
          <div className="user-menu-wrap">
            <button className="user-menu" aria-label="Open account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
              <span className="user-meta"><strong>{displayName}</strong><small>{emailLabel}</small></span>
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <>
                <button className="user-menu-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setMenuOpen(false)} />
                <div className="user-dropdown">
                  <Link to="/settings" onClick={() => setMenuOpen(false)}><Settings size={15} /> Settings</Link>
                  <Link to="/help" onClick={() => setMenuOpen(false)}><CircleHelp size={15} /> Help &amp; Support</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="dashboard-main">
        <div className="breadcrumbs">FluxPay <span>/</span> {current}</div>
        {children}
      </main>
      {tip && (
        <div className="nav-tooltip" ref={tipRef} style={{ left: tip.x, top: tip.y }}>
          <strong>{nav[tip.index].label}</strong>
          <span>{nav[tip.index].description}</span>
        </div>
      )}
      {searchOpen && (
        <div className="search-backdrop" onClick={() => { setSearchOpen(false); setResolvedUser(null); setResolveError('') }}>
          <div className="search-panel" onClick={e => e.stopPropagation()}>
            <Search size={16} />
            <input
              autoFocus
              placeholder="Search pages or resolve @username..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); if (e.key === 'Enter') void resolveSearch() }}
            />
            <button className="search-esc" onClick={() => setSearchOpen(false)}>Esc</button>
            {(pageMatches.length > 0 || resolvedUser || resolveError) && (
              <div className="search-results">
                {pageMatches.map(m => (
                  <button key={m.href} onClick={() => { navigate(m.href); setSearchOpen(false) }}>{m.label}</button>
                ))}
                {resolvedUser && (
                  <a href={`${EXPLORER_URL}/address/${resolvedUser.address}`} target="_blank" rel="noreferrer">
                    @{resolvedUser.username} → {shortAddr(resolvedUser.address)}
                  </a>
                )}
                {resolveError && <span>{resolveError}</span>}
              </div>
            )}
          </div>
        </div>
      )}
      {notif && (
        <div className="notif-backdrop" onClick={() => setNotif(null)}>
          <div className="notif-panel" style={{ left: notif.x, top: notif.y + 12 }} onClick={e => e.stopPropagation()}>
            <div className="notif-head">
              <strong>Notifications</strong>
              <button className="notif-readall" onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}>Mark all as read</button>
            </div>
            <div className="notif-list">
              {notifLoading && <div className="notif-item"><div className="notif-body"><small>Loading on-chain activity…</small></div></div>}
              {!notifLoading && notifications.length === 0 && (
                <div className="notif-item"><div className="notif-body"><strong>You're all caught up</strong><small>Recent payments will show up here.</small></div></div>
              )}
              {notifications.map(n => (
                <div className={`notif-item${n.read ? '' : ' unread'}`} key={n.id}>
                  <span className="notif-dot" />
                  <div className="notif-body"><strong>{n.title}</strong><small>{n.body}</small></div>
                  <span className="notif-time">{n.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div> }

export function StatCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: string }) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small className={accent || ''}>{detail}</small></div> }

export function GenericPage({ title, description }: { title: string; description: string }) {
  const { address } = useProfile()
  return <section className="dashboard-content"><PageHeading title={title} description={description} action={<button className="dark-button" disabled>+ New {title}</button>} /><div className="empty-panel"><div className="empty-icon"><Sparkles size={22}/></div><h2>Your {title.toLowerCase()} workspace</h2><p>{address ? 'Everything you need to manage your FluxPay account will appear here.' : 'Connect your wallet to get started.'}</p></div></section>
}
