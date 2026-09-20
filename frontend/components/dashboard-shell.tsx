'use client'

import { Link, useLocation } from 'react-router-dom'
import { useLayoutEffect, useRef, useState, Fragment } from 'react'
import { Bell, Bot, CalendarDays, ChevronDown, CircleHelp, CreditCard, LayoutDashboard, Search, Send, Settings, Sparkles, Wallet, WalletMinimal, ArrowLeftRight, Activity, Link2, Landmark, type LucideIcon } from 'lucide-react'

type NavItem = { label: string; href: string; icon: LucideIcon; group: string; description: string; soon?: boolean }

const initialNotifications = [
  { id: 1, title: 'Payment received', body: '+$250.00 USDC from 0x83F4...A21F', time: 'Today', read: false },
  { id: 2, title: 'Investment executed', body: 'Spotify payment invested $0.24 into NVIDIA', time: 'Today', read: false },
  { id: 3, title: 'Payment link paid', body: 'Invoice #FLX2041 was paid', time: 'Sep 15', read: true },
]

const nav: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, group: 'Main', description: 'Your account at a glance' },
  { label: 'Pay & Own', href: '/pay-and-own', icon: CreditCard, group: 'Main', description: 'Turn everyday payments into ownership' },
  { label: 'Subscriptions', href: '/subscriptions', icon: CalendarDays, group: 'Main', description: 'Manage and track your subscriptions' },
  { label: 'Portfolio', href: '/portfolio', icon: Wallet, group: 'Main', description: 'See the assets you own' },
  { label: 'Activity', href: '/activity', icon: Activity, group: 'Main', description: 'Your transactions and history' },
  { label: 'Wallet', href: '/wallet', icon: WalletMinimal, group: 'Wallet', description: 'Your wallet balance and funds' },
  { label: 'Send', href: '/send', icon: Send, group: 'Wallet', description: 'Send money to anyone' },
  { label: 'Receive', href: '/receive', icon: Landmark, group: 'Wallet', description: 'Get paid and receive funds' },
  { label: 'Swap', href: '/swap', icon: ArrowLeftRight, group: 'Wallet', description: 'Exchange between currencies', soon: true },
  { label: 'Payment Link', href: '/payment-link', icon: Link2, group: 'Wallet', description: 'Create and share payment links' },
  { label: 'AI Terminal', href: '/terminal', icon: Bot, group: 'AI', description: 'Ask the AI about your money' },
]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname
  const activeIndex = nav.findIndex(item => item.href === pathname)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const currentIndex = hoverIndex ?? (activeIndex >= 0 ? activeIndex : 0)
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notif, setNotif] = useState<{ x: number; y: number } | null>(null)
  const [notifications, setNotifications] = useState(initialNotifications)
  const unread = notifications.filter(n => !n.read).length
  const current = nav[activeIndex >= 0 ? activeIndex : 0]?.label || 'Overview'

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
          <button aria-label="Notifications" className={`notification${unread ? ' has-unread' : ''}`} onClick={e => setNotif({ x: e.clientX, y: e.clientY })}><Bell size={16} /></button>
          <div className="avatar header-avatar">JD</div>
          <div className="user-menu-wrap">
            <button className="user-menu" aria-label="Open account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
              <span className="user-meta"><strong>Jordan Davis</strong><small>jordan@fluxpay.io</small></span>
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
        <div className="search-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="search-panel" onClick={e => e.stopPropagation()}>
            <Search size={16} />
            <input autoFocus placeholder="Search transactions, assets, pages..." onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false) }} />
            <button className="search-esc" onClick={() => setSearchOpen(false)}>Esc</button>
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

export function GenericPage({ title, description }: { title: string; description: string }) { return <section className="dashboard-content"><PageHeading title={title} description={description} action={<button className="dark-button">+ New {title}</button>} /><div className="stats-grid"><StatCard label="Available balance" value="$24,680.00" detail="+12.8% from last month" accent="positive"/><StatCard label="Total activity" value="$8,420.50" detail="24 transactions"/><StatCard label="Active cards" value="4" detail="2 physical · 2 virtual"/></div><div className="empty-panel"><div className="empty-icon"><Sparkles size={22}/></div><h2>Your {title.toLowerCase()} workspace</h2><p>Everything you need to manage your FluxPay account will appear here.</p><button className="outline-button">Get started</button></div></section> }

export const CardBadge = ({ type = 'VISA', number = '4329' }: { type?: string; number?: string }) => <span className="card-badge"><b>{type}</b> **** {number}</span>

export { nav }
