import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Users,
  Wallet,
  X,
  CheckCircle2,
  Clock3,
  XCircle,
  Boxes,
  ScanFace,
} from 'lucide-react';

const initialRequests = [
  {
    id: 'REQ-2084',
    name: 'Amina Yusuf',
    service: 'Identity verification',
    date: 'Oct 16, 2026',
    status: 'Pending',
    amount: '₦2,500',
  },
  {
    id: 'REQ-2083',
    name: 'Samuel Okoro',
    service: 'Education PIN request',
    date: 'Oct 16, 2026',
    status: 'In review',
    amount: '₦4,000',
  },
  {
    id: 'REQ-2082',
    name: 'Fatima Bello',
    service: 'Identity verification',
    date: 'Oct 15, 2026',
    status: 'Approved',
    amount: '₦2,500',
  },
  {
    id: 'REQ-2081',
    name: 'Ibrahim Musa',
    service: 'Account verification',
    date: 'Oct 15, 2026',
    status: 'Pending',
    amount: '₦1,500',
  },
  {
    id: 'REQ-2080',
    name: 'Grace Eze',
    service: 'Education PIN request',
    date: 'Oct 14, 2026',
    status: 'Rejected',
    amount: '₦4,000',
  },
];
const initialProducts = [
  {
    name: 'Identity Verification',
    category: 'Verification',
    price: 2500,
    status: 'Active',
  },
  {
    name: 'Education PIN',
    category: 'Digital PIN',
    price: 4000,
    status: 'Active',
  },
  {
    name: 'Account Verification',
    category: 'Verification',
    price: 1500,
    status: 'Active',
  },
  {
    name: 'Business Profile Check',
    category: 'Business',
    price: 5000,
    status: 'Paused',
  },
];
const transactions = [
  {
    id: 'TXN-74192',
    customer: 'Amina Yusuf',
    type: 'Identity Verification',
    date: 'Oct 16, 2026',
    amount: 2500,
    status: 'Successful',
  },
  {
    id: 'TXN-74191',
    customer: 'Samuel Okoro',
    type: 'Education PIN',
    date: 'Oct 16, 2026',
    amount: 4000,
    status: 'Pending',
  },
  {
    id: 'TXN-74190',
    customer: 'Fatima Bello',
    type: 'Identity Verification',
    date: 'Oct 15, 2026',
    amount: 2500,
    status: 'Successful',
  },
  {
    id: 'TXN-74189',
    customer: 'Ibrahim Musa',
    type: 'Account Verification',
    date: 'Oct 15, 2026',
    amount: 1500,
    status: 'Failed',
  },
  {
    id: 'TXN-74188',
    customer: 'Grace Eze',
    type: 'Education PIN',
    date: 'Oct 14, 2026',
    amount: 4000,
    status: 'Successful',
  },
];
const initialCustomers = [
  {
    name: 'Amina Yusuf',
    email: 'amina.yusuf@example.test',
    joined: 'Oct 16, 2026',
    requests: 3,
    status: 'Active',
  },
  {
    name: 'Samuel Okoro',
    email: 'samuel.okoro@example.test',
    joined: 'Oct 14, 2026',
    requests: 2,
    status: 'Active',
  },
  {
    name: 'Fatima Bello',
    email: 'fatima.bello@example.test',
    joined: 'Oct 12, 2026',
    requests: 5,
    status: 'Active',
  },
  {
    name: 'Ibrahim Musa',
    email: 'ibrahim.musa@example.test',
    joined: 'Oct 10, 2026',
    requests: 1,
    status: 'Pending',
  },
  {
    name: 'Grace Eze',
    email: 'grace.eze@example.test',
    joined: 'Oct 08, 2026',
    requests: 4,
    status: 'Active',
  },
];
const navGroups = [
  {
    title: 'WORKSPACE',
    items: [
      { label: 'Overview', icon: LayoutDashboard },
      { label: 'User Dashboard', icon: Wallet },
      { label: 'Customers', icon: Users },
      { label: 'Requests', icon: ClipboardList },
      { label: 'Transactions', icon: CreditCard },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'Products', icon: ShoppingBag },
      { label: 'PIN Inventory', icon: Boxes },
      { label: 'Audit Log', icon: FileText },
    ],
  },
];
const money = n => '₦' + n.toLocaleString('en-NG');
function Status({ value }) {
  return (
    <span
      className={'status status-' + value.toLowerCase().replaceAll(' ', '-')}
    >
      <i />
      {value}
    </span>
  );
}
function App() {
  const [active, setActive] = useState('Overview');
  const [requests, setRequests] = useState(initialRequests);
  const [products, setProducts] = useState(initialProducts);
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [period, setPeriod] = useState('Last 7 days');
  const [audit, setAudit] = useState([
    {
      action: 'Demo workspace opened',
      actor: 'Demo visitor',
      time: 'Just now',
      result: 'Read-only environment',
    },
    {
      action: 'Request REQ-2082 approved',
      actor: 'Demo Admin',
      time: 'Oct 15, 2026',
      result: 'Success',
    },
    {
      action: 'Product catalog viewed',
      actor: 'Demo Admin',
      time: 'Oct 15, 2026',
      result: 'Success',
    },
  ]);
  const notify = message => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };
  const nav = label => {
    setActive(label);
    setMenuOpen(false);
    setQuery('');
    setFilter('All');
  };
  const filteredRequests = useMemo(
    () =>
      requests.filter(
        r =>
          (filter === 'All' || r.status === filter) &&
          (r.name + r.id + r.service)
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [requests, filter, query]
  );
  const filteredProducts = products.filter(p =>
    (p.name + p.category + p.status).toLowerCase().includes(query.toLowerCase())
  );
  const filteredCustomers = customers.filter(c =>
    (c.name + c.email).toLowerCase().includes(query.toLowerCase())
  );
  const filteredTransactions = transactions.filter(t =>
    (t.id + t.customer + t.type + t.status)
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const recordAudit = action =>
    setAudit(prev => [
      { action, actor: 'Demo visitor', time: 'Just now', result: 'Demo only' },
      ...prev,
    ]);
  const updateRequest = (id, status) => {
    setRequests(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    recordAudit('Request ' + id + ' marked ' + status);
    notify(id + ' marked ' + status + ' in this demo.');
  };
  const exportCsv = (rows, name) => {
    if (!rows.length) {
      notify('There are no rows to export.');
      return;
    }
    const csv = rows
      .map(row =>
        row
          .map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"')
          .join(',')
      )
      .join('\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    notify('Demo CSV exported successfully.');
  };
  const addProduct = e => {
    e.preventDefault();
    if (!productName.trim() || !productPrice || Number(productPrice) <= 0) {
      setFormError('Enter a product name and a price greater than zero.');
      return;
    }
    setProducts(prev => [
      ...prev,
      {
        name: productName.trim(),
        category: 'Custom demo product',
        price: Number(productPrice),
        status: 'Active',
      },
    ]);
    recordAudit('Demo product added: ' + productName.trim());
    setModal('');
    setProductName('');
    setProductPrice('');
    setFormError('');
    notify('Sample product added. Nothing was sent to a live service.');
  };
  const addCustomer = e => {
    e.preventDefault();
    if (
      !customerName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      setFormError('Enter a customer name and a valid email address.');
      return;
    }
    setCustomers(prev => [
      ...prev,
      {
        name: customerName.trim(),
        email: customerEmail.trim(),
        joined: 'Today',
        requests: 0,
        status: 'Active',
      },
    ]);
    recordAudit('Demo customer added: ' + customerName.trim());
    setModal('');
    setCustomerName('');
    setCustomerEmail('');
    setFormError('');
    notify('Sample customer added to this demo session.');
  };
  const pageTitle =
    active === 'Overview'
      ? 'Good afternoon, Demo Admin'
      : active === 'User Dashboard'
        ? 'Welcome back, Amina'
        : active;
  const pageSubtitle =
    active === 'Overview'
      ? 'Here’s what’s happening across your SOKOTECH workspace.'
      : {
          'User Dashboard': 'Your sample account, service requests, and recent activity.',
          Customers: 'Explore customer profiles and activity.',
          Requests: 'Review and update sample service requests.',
          Transactions:
            'Inspect sample transaction activity and export reports.',
          Products: 'Manage the demo service catalog.',
          'PIN Inventory': 'Inspect synthetic inventory and stock movements.',
          'Audit Log': 'Track actions performed in this interactive demo.',
        }[active] || 'Demo workspace settings.';
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (menuOpen ? 'sidebar-open' : '')}>
        <div className="brand">
          <div className="brand-mark">
            <ScanFace size={23} />
          </div>
          <div>
            <b>
              SOKO<span>TECH</span>
            </b>
            <small>OPERATIONS PORTAL</small>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">S</div>
          <div>
            <b>SOKOTECH Demo</b>
            <small>Demo workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        {navGroups.map(group => (
          <div className="nav-group" key={group.title}>
            <p>{group.title}</p>
            {group.items.map(item => (
              <button
                key={item.label}
                className={
                  'nav-item ' + (active === item.label ? 'active' : '')
                }
                onClick={() => nav(item.label)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.label === 'Requests' && (
                  <em>{requests.filter(r => r.status === 'Pending').length}</em>
                )}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-spacer" />
        <button
          className={'nav-item ' + (active === 'Settings' ? 'active' : '')}
          onClick={() => nav('Settings')}
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>
        <div className="sidebar-help">
          <div className="help-icon">
            <CircleHelp size={19} />
          </div>
          <b>Exploring SOKOTECH?</b>
          <p>This is a safe demo. Actions use sample data only.</p>
          <button onClick={() => setModal('help')}>
            How it works <span>→</span>
          </button>
        </div>
        <div className="user-mini">
          <div className="avatar navy">DA</div>
          <div>
            <b>Demo Admin</b>
            <small>Demo access</small>
          </div>
          <MoreHorizontal size={18} />
        </div>
      </aside>
      {menuOpen && (
        <button
          className="scrim"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <button
            className="hamburger"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            Workspace <span>/</span> <b>{active}</b>
          </div>
          <div className="top-actions">
            <div className="demo-pill">
              <span /> Interactive demo
            </div>
            <button
              className="icon-button notification-button"
              onClick={() => setShowNotifications(v => !v)}
              aria-label="Notifications"
            >
              <Bell size={19} />
              <i />
            </button>
            <div className="avatar navy top-avatar">DA</div>
            <div className="top-user">
              <b>Demo Admin</b>
              <small>Super Agent preview</small>
            </div>
            <button
              className="chevron-button"
              onClick={() => setModal('profile')}
              aria-label="Open demo profile"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </header>
        <div className="demo-banner">
          <ShieldCheck size={17} />
          <span>
            <b>Public demo mode</b> — no sign-in required. All records are
            synthetic; actions affect this preview only.
          </span>
          <button onClick={() => setModal('help')}>
            Learn more <span>↗</span>
          </button>
        </div>
        {showNotifications && (
          <div className="notification-pop">
            <b>Notifications</b>
            <p>
              <span className="notif-dot" /> Two requests are awaiting review.
            </p>
            <p>
              <span className="notif-dot blue" /> Demo workspace is ready to
              explore.
            </p>
            <button onClick={() => setShowNotifications(false)}>Close</button>
          </div>
        )}
        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">SOKOTECH / OPERATIONS</div>
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle}</p>
            </div>
            <div className="heading-actions">
              {active === 'Overview' && (
                <select
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  aria-label="Reporting period"
                >
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>This year</option>
                </select>
              )}
              {active === 'Products' && (
                <button
                  className="primary-btn"
                  onClick={() => {
                    setModal('product');
                    setFormError('');
                  }}
                >
                  <Plus size={16} /> Add product
                </button>
              )}
              {active === 'Customers' && (
                <button
                  className="primary-btn"
                  onClick={() => {
                    setModal('customer');
                    setFormError('');
                  }}
                >
                  <Plus size={16} /> Add customer
                </button>
              )}
              {['Transactions', 'Requests', 'Audit Log'].includes(active) && (
                <button
                  className="secondary-btn"
                  onClick={() => {
                    const rows =
                      active === 'Transactions'
                        ? filteredTransactions.map(t => [
                            t.id,
                            t.customer,
                            t.type,
                            t.date,
                            money(t.amount),
                            t.status,
                          ])
                        : active === 'Requests'
                          ? filteredRequests.map(r => [
                              r.id,
                              r.name,
                              r.service,
                              r.date,
                              r.amount,
                              r.status,
                            ])
                          : audit.map(a => [
                              a.action,
                              a.actor,
                              a.time,
                              a.result,
                            ]);
                    exportCsv(
                      rows,
                      active.toLowerCase().replace(' ', '-') + '-demo.csv'
                    );
                  }}
                >
                  <Download size={16} /> Export CSV
                </button>
              )}
            </div>
          </div>
          {active === 'Overview' && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Total customers</span>
                    <span className="stat-icon blue">
                      <Users size={18} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {(1248 + customers.length - 5).toLocaleString()}
                  </div>
                  <div className="stat-foot">
                    <span className="trend">
                      <ArrowUpRight size={14} /> 12.8%
                    </span>
                    <span>vs. previous period</span>
                  </div>
                  <div className="sparkline">
                    <span style={{ height: '38%' }} />
                    <span style={{ height: '52%' }} />
                    <span style={{ height: '43%' }} />
                    <span style={{ height: '68%' }} />
                    <span style={{ height: '54%' }} />
                    <span style={{ height: '75%' }} />
                    <span style={{ height: '62%' }} />
                    <span style={{ height: '92%' }} />
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Requests processed</span>
                    <span className="stat-icon violet">
                      <ClipboardList size={18} />
                    </span>
                  </div>
                  <div className="stat-value">864</div>
                  <div className="stat-foot">
                    <span className="trend">
                      <ArrowUpRight size={14} /> 8.2%
                    </span>
                    <span>vs. previous period</span>
                  </div>
                  <div className="sparkline violet-bars">
                    <span style={{ height: '44%' }} />
                    <span style={{ height: '63%' }} />
                    <span style={{ height: '51%' }} />
                    <span style={{ height: '80%' }} />
                    <span style={{ height: '66%' }} />
                    <span style={{ height: '88%' }} />
                    <span style={{ height: '72%' }} />
                    <span style={{ height: '96%' }} />
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Demo revenue</span>
                    <span className="stat-icon green">
                      <Wallet size={18} />
                    </span>
                  </div>
                  <div className="stat-value">{money(2864500)}</div>
                  <div className="stat-foot">
                    <span className="trend">
                      <ArrowUpRight size={14} /> 16.4%
                    </span>
                    <span>vs. previous period</span>
                  </div>
                  <div className="sparkline green-bars">
                    <span style={{ height: '30%' }} />
                    <span style={{ height: '48%' }} />
                    <span style={{ height: '41%' }} />
                    <span style={{ height: '60%' }} />
                    <span style={{ height: '52%' }} />
                    <span style={{ height: '79%' }} />
                    <span style={{ height: '71%' }} />
                    <span style={{ height: '96%' }} />
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Pending requests</span>
                    <span className="stat-icon amber">
                      <Clock3 size={18} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {requests.filter(r => r.status === 'Pending').length + 23}
                  </div>
                  <div className="stat-foot">
                    <span className="trend neutral">Needs attention</span>
                    <span>across all services</span>
                  </div>
                  <div className="mini-progress">
                    <span style={{ width: '38%' }} />
                  </div>
                  <small className="progress-caption">
                    38% of today's queue
                  </small>
                </div>
              </div>
              <div className="overview-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Transaction activity</h2>
                      <p>Sample transactions across your workspace</p>
                    </div>
                    <button
                      className="plain-button"
                      onClick={() => nav('Transactions')}
                    >
                      View report <span>→</span>
                    </button>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-blue" /> Successful
                    </span>
                    <span>
                      <i className="legend-light" /> Pending
                    </span>
                  </div>
                  <div className="chart">
                    <div className="y-labels">
                      <span>₦800k</span>
                      <span>₦600k</span>
                      <span>₦400k</span>
                      <span>₦200k</span>
                      <span>₦0</span>
                    </div>
                    <div className="chart-plot">
                      <div className="gridline" />
                      <div className="gridline" />
                      <div className="gridline" />
                      <div className="gridline" />
                      <div className="gridline" />
                      <svg
                        viewBox="0 0 600 190"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label="Illustrative transaction activity chart"
                      >
                        <defs>
                          <linearGradient
                            id="fillBlue"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#2563a6"
                              stopOpacity=".19"
                            />
                            <stop
                              offset="100%"
                              stopColor="#2563a6"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,145 C35,128 40,100 80,113 S130,145 160,91 S210,113 240,78 S280,91 320,54 S370,102 400,70 S450,90 480,44 S540,67 600,20 L600,190 L0,190Z"
                          fill="url(#fillBlue)"
                        />
                        <path
                          d="M0,145 C35,128 40,100 80,113 S130,145 160,91 S210,113 240,78 S280,91 320,54 S370,102 400,70 S450,90 480,44 S540,67 600,20"
                          fill="none"
                          stroke="#2563a6"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                        />
                        <path
                          d="M0,169 C45,160 45,150 80,157 S130,161 160,143 S205,156 240,133 S280,145 320,118 S360,141 400,126 S450,142 480,115 S540,129 600,101"
                          fill="none"
                          stroke="#9bbbdc"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                          strokeDasharray="5 4"
                        />
                      </svg>
                      <div className="x-labels">
                        <span>Oct 10</span>
                        <span>Oct 11</span>
                        <span>Oct 12</span>
                        <span>Oct 13</span>
                        <span>Oct 14</span>
                        <span>Oct 15</span>
                        <span>Oct 16</span>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="panel services-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Service overview</h2>
                      <p>Activity by service type</p>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => nav('Products')}
                      aria-label="Open products"
                    >
                      <MoreHorizontal />
                    </button>
                  </div>
                  {[
                    {
                      name: 'Identity verification',
                      count: 412,
                      pct: 78,
                      color: 'navy',
                    },
                    {
                      name: 'Education PIN',
                      count: 268,
                      pct: 58,
                      color: 'blue',
                    },
                    {
                      name: 'Account verification',
                      count: 124,
                      pct: 36,
                      color: 'purple',
                    },
                    {
                      name: 'Business profile',
                      count: 60,
                      pct: 21,
                      color: 'teal',
                    },
                  ].map(s => (
                    <div className="service-row" key={s.name}>
                      <div className="service-line">
                        <span>{s.name}</span>
                        <b>{s.count}</b>
                      </div>
                      <div className="service-track">
                        <span
                          className={s.color}
                          style={{ width: s.pct + '%' }}
                        />
                      </div>
                    </div>
                  ))}
                  <button className="full-link" onClick={() => nav('Products')}>
                    Manage services <span>→</span>
                  </button>
                </section>
              </div>
              <section className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent requests</h2>
                    <p>Latest customer activity in this sample workspace</p>
                  </div>
                  <button
                    className="plain-button"
                    onClick={() => nav('Requests')}
                  >
                    View all <span>→</span>
                  </button>
                </div>
                <RequestTable
                  rows={requests.slice(0, 4)}
                  onUpdate={updateRequest}
                />
              </section>
            </>
          )}
          {active === 'Requests' && (
            <section className="panel table-panel">
              <Toolbar
                query={query}
                setQuery={setQuery}
                filter={filter}
                setFilter={setFilter}
                filters={[
                  'All',
                  'Pending',
                  'In review',
                  'Approved',
                  'Rejected',
                ]}
                placeholder="Search requests..."
              />
              <RequestTable rows={filteredRequests} onUpdate={updateRequest} />
              <div className="table-footer">
                Showing {filteredRequests.length} sample requests{' '}
                <span>Demo data only</span>
              </div>
            </section>
          )}
          {active === 'User Dashboard' && (
            <>
              <div className="demo-banner user-welcome-banner">
                <Users size={18} />
                <span><b>Customer account preview</b> — signed-in user experience shown with fictional data. No real account is connected.</span>
                <button onClick={() => notify('This sample account is already active in the demo.')}>Account status <span>✓</span></button>
              </div>
              <div className="stats-grid">
                <StatCard title="My requests" value="3" detail="Across sample services" icon={<ClipboardList size={18} />} tone="blue" />
                <StatCard title="In progress" value="1" detail="Awaiting review" icon={<Clock3 size={18} />} tone="amber" />
                <StatCard title="Completed" value="2" detail="Sample requests" icon={<CheckCircle2 size={18} />} tone="green" />
                <StatCard title="Demo wallet" value={money(8500)} detail="Illustrative balance only" icon={<Wallet size={18} />} tone="violet" />
              </div>
              <div className="overview-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div><h2>My service requests</h2><p>Recent activity for the sample customer Amina Yusuf</p></div>
                    <button className="plain-button" onClick={() => nav('Requests')}>Track requests <span>→</span></button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Request ID</th><th>Service</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
                      <tbody>
                        {initialRequests.filter(r => r.name === 'Amina Yusuf' || r.name === 'Fatima Bello' || r.name === 'Samuel Okoro').slice(0, 3).map(r => (
                          <tr key={r.id}><td className="mono">{r.id}</td><td>{r.service}</td><td>{r.date}</td><td className="amount">{r.amount}</td><td><Status value={r.status} /></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-footer">Sample requests only <span>No live service request is submitted</span></div>
                </section>
                <section className="panel chart-panel">
                  <div className="panel-heading"><div><h2>Available services</h2><p>Explore what a customer can access</p></div></div>
                  <div className="service-preview-list">
                    {initialProducts.filter(p => p.status === 'Active').slice(0, 3).map(p => (
                      <div className="service-preview-row" key={p.name}>
                        <div className="product-icon"><ShoppingBag size={18} /></div>
                        <div className="service-preview-copy"><b>{p.name}</b><small>{p.category}</small></div>
                        <strong>{money(p.price)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="user-dashboard-actions">
                    <button className="primary-btn" onClick={() => notify('Demo only: service ordering and payment are disabled. No request or charge was created.')}><Plus size={16} /> Request a service</button>
                    <button className="secondary-btn" onClick={() => nav('Transactions')}><CreditCard size={16} /> View my activity</button>
                  </div>
                </section>
              </div>
              <section className="panel user-profile-panel">
                <div className="avatar avatar-color-0">AY</div>
                <div><b>Amina Yusuf</b><p>amina.yusuf@example.test</p><small>Sample customer · Joined Oct 16, 2026</small></div>
                <button className="secondary-btn" onClick={() => setModal('profile')}>View profile</button>
              </section>
            </>
          )}
          {active === 'Customers' && (
            <section className="panel table-panel">
              <Toolbar
                query={query}
                setQuery={setQuery}
                placeholder="Search customers..."
              />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Joined</th>
                      <th>Requests</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c, i) => (
                      <tr key={c.email}>
                        <td>
                          <div className="person-cell">
                            <div className={'avatar avatar-color-' + (i % 4)}>
                              {c.name
                                .split(' ')
                                .map(n => n[0])
                                .join('')
                                .slice(0, 2)}
                            </div>
                            <div>
                              <b>{c.name}</b>
                              <small>{c.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>{c.joined}</td>
                        <td>{c.requests}</td>
                        <td>
                          <Status value={c.status} />
                        </td>
                        <td>
                          <button
                            className="row-action"
                            onClick={() =>
                              notify(
                                'Viewing sample profile for ' + c.name + '.'
                              )
                            }
                          >
                            <Eye size={16} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                {filteredCustomers.length} sample customers{' '}
                <span>Use Add customer to try a form</span>
              </div>
            </section>
          )}
          {active === 'Transactions' && (
            <section className="panel table-panel">
              <div className="table-summary">
                <div>
                  <span>Sample transaction volume</span>
                  <b>{money(transactions.reduce((s, t) => s + t.amount, 0))}</b>
                </div>
                <div>
                  <span>Successful</span>
                  <b>
                    {transactions.filter(t => t.status === 'Successful').length}
                  </b>
                </div>
                <div>
                  <span>Needs review</span>
                  <b>
                    {transactions.filter(t => t.status !== 'Successful').length}
                  </b>
                </div>
              </div>
              <Toolbar
                query={query}
                setQuery={setQuery}
                placeholder="Search transactions..."
              />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Customer</th>
                      <th>Service</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map(t => (
                      <tr key={t.id}>
                        <td className="mono">{t.id}</td>
                        <td>{t.customer}</td>
                        <td>{t.type}</td>
                        <td>{t.date}</td>
                        <td className="amount">{money(t.amount)}</td>
                        <td>
                          <Status value={t.status} />
                        </td>
                        <td>
                          <button
                            className="icon-button small"
                            onClick={() =>
                              notify(
                                'Sample transaction ' +
                                  t.id +
                                  ' details opened.'
                              )
                            }
                            aria-label={'View ' + t.id}
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                {filteredTransactions.length} sample transactions{' '}
                <span>No real payments are processed</span>
              </div>
            </section>
          )}
          {active === 'Products' && (
            <section className="panel table-panel">
              <Toolbar
                query={query}
                setQuery={setQuery}
                placeholder="Search products..."
              />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product / service</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p, i) => (
                      <tr key={p.name}>
                        <td>
                          <div className="product-cell">
                            <div className="product-icon">
                              <Package size={18} />
                            </div>
                            <b>{p.name}</b>
                          </div>
                        </td>
                        <td>{p.category}</td>
                        <td className="amount">{money(p.price)}</td>
                        <td>
                          <Status value={p.status} />
                        </td>
                        <td>
                          <button
                            className="row-action"
                            onClick={() => {
                              setProducts(prev =>
                                prev.map(x =>
                                  x.name === p.name
                                    ? {
                                        ...x,
                                        status:
                                          x.status === 'Active'
                                            ? 'Paused'
                                            : 'Active',
                                      }
                                    : x
                                )
                              );
                              recordAudit('Product status toggled: ' + p.name);
                              notify('Product status updated in demo.');
                            }}
                          >
                            {p.status === 'Active' ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            className="icon-button small"
                            aria-label={'More actions for ' + p.name}
                            onClick={() =>
                              notify(
                                'More actions for ' +
                                  p.name +
                                  ' are available in the full platform preview.'
                              )
                            }
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                {products.length} products in sample catalog{' '}
                <span>Changes remain in this preview session</span>
              </div>
            </section>
          )}
          {active === 'PIN Inventory' && (
            <>
              <div className="stats-grid inventory-stats">
                <StatCard
                  title="Total PINs"
                  value="2,480"
                  detail="Across sample batches"
                  icon={<Boxes size={18} />}
                  tone="blue"
                />
                <StatCard
                  title="Available"
                  value="1,820"
                  detail="73.4% of sample stock"
                  icon={<CheckCircle2 size={18} />}
                  tone="green"
                />
                <StatCard
                  title="Redeemed"
                  value="590"
                  detail="Sample redemptions"
                  icon={<CreditCard size={18} />}
                  tone="violet"
                />
                <StatCard
                  title="Low-stock batches"
                  value="2"
                  detail="Review suggested"
                  icon={<Clock3 size={18} />}
                  tone="amber"
                />
              </div>
              <section className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Inventory batches</h2>
                    <p>
                      Synthetic stock examples — PINs shown here cannot be
                      redeemed
                    </p>
                  </div>
                  <button
                    className="secondary-btn"
                    onClick={() =>
                      notify(
                        'Demo import wizard opened. Live supplier imports are disabled.'
                      )
                    }
                  >
                    <Plus size={16} /> Import batch
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Batch ID</th>
                        <th>Product</th>
                        <th>Added</th>
                        <th>Total</th>
                        <th>Available</th>
                        <th>Stock level</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          id: 'PIN-2026-041',
                          name: 'Education PIN',
                          date: 'Oct 15, 2026',
                          total: 1000,
                          available: 720,
                        },
                        {
                          id: 'PIN-2026-040',
                          name: 'Education PIN',
                          date: 'Oct 10, 2026',
                          total: 500,
                          available: 82,
                        },
                        {
                          id: 'PIN-2026-039',
                          name: 'Exam Access PIN',
                          date: 'Oct 07, 2026',
                          total: 600,
                          available: 510,
                        },
                        {
                          id: 'PIN-2026-038',
                          name: 'Education PIN',
                          date: 'Oct 01, 2026',
                          total: 380,
                          available: 8,
                        },
                      ].map(b => (
                        <tr key={b.id}>
                          <td className="mono">{b.id}</td>
                          <td>{b.name}</td>
                          <td>{b.date}</td>
                          <td>{b.total.toLocaleString()}</td>
                          <td>{b.available.toLocaleString()}</td>
                          <td>
                            <div className="stock-track">
                              <span
                                style={{
                                  width: (b.available / b.total) * 100 + '%',
                                }}
                              />
                            </div>
                            <small className="muted">
                              {Math.round((b.available / b.total) * 100)}%
                              remaining
                            </small>
                          </td>
                          <td>
                            <Status
                              value={
                                b.available / b.total < 0.2
                                  ? 'Low stock'
                                  : 'Available'
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {active === 'Audit Log' && (
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Activity history</h2>
                  <p>
                    Actions in this interactive session are recorded locally for
                    demonstration.
                  </p>
                </div>
                <button
                  className="secondary-btn"
                  onClick={() =>
                    exportCsv(
                      audit.map(a => [a.action, a.actor, a.time, a.result]),
                      'sokotech-demo-audit.csv'
                    )
                  }
                >
                  <Download size={16} /> Export log
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Time</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a, i) => (
                      <tr key={i}>
                        <td>
                          <div className="audit-action">
                            <span>
                              <Activity size={16} />
                            </span>
                            <b>{a.action}</b>
                          </div>
                        </td>
                        <td>{a.actor}</td>
                        <td>{a.time}</td>
                        <td>
                          <Status
                            value={
                              a.result === 'Success'
                                ? 'Successful'
                                : 'Demo only'
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                {audit.length} activity events <span>Local demo log</span>
              </div>
            </section>
          )}
          {active === 'Settings' && (
            <section className="settings-grid">
              <div className="panel settings-card">
                <div className="settings-symbol">
                  <Settings />
                </div>
                <h2>Workspace preferences</h2>
                <p>
                  Explore common settings controls. Changes are preview-only and
                  won't affect a real account.
                </p>
                <label>
                  Workspace name
                  <input defaultValue="SOKOTECH Demo" />
                </label>
                <label>
                  Default currency
                  <select defaultValue="NGN">
                    <option value="NGN">NGN — Nigerian Naira (₦)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                  </select>
                </label>
                <label>
                  Notification preference
                  <select defaultValue="important">
                    <option value="important">Important updates only</option>
                    <option value="all">All activity</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <button
                  className="primary-btn"
                  onClick={() =>
                    notify('Preferences preview saved for this session.')
                  }
                >
                  Save preferences
                </button>
              </div>
              <div className="panel settings-card">
                <div className="settings-symbol shield">
                  <LockKeyhole />
                </div>
                <h2>Security & access</h2>
                <p>
                  The public demo intentionally has no sign-in and never
                  connects to live customer data.
                </p>
                <div className="setting-row">
                  <span>Demo mode</span>
                  <Status value="Active" />
                </div>
                <div className="setting-row">
                  <span>Live provider connections</span>
                  <Status value="Disabled" />
                </div>
                <div className="setting-row">
                  <span>Real payment actions</span>
                  <Status value="Disabled" />
                </div>
                <button
                  className="secondary-btn"
                  onClick={() => setModal('help')}
                >
                  View demo safety notes
                </button>
              </div>
            </section>
          )}
        </section>
        <footer className="footer">
          <span>© 2026 SOKOTECH · Interactive product preview</span>
          <span>
            <ShieldCheck size={14} /> Synthetic data only <i />{' '}
            <button onClick={() => setModal('help')}>Demo guide</button>
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss message">
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              setModal('');
              setFormError('');
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">SOKOTECH DEMO</div>
                <h2 id="modal-title">
                  {modal === 'product'
                    ? 'Add a sample product'
                    : modal === 'customer'
                      ? 'Add a sample customer'
                      : modal === 'profile'
                        ? 'Demo profile'
                        : 'Explore safely'}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setModal('');
                  setFormError('');
                }}
                aria-label="Close dialog"
              >
                <X />
              </button>
            </div>
            {modal === 'product' && (
              <form onSubmit={addProduct}>
                <p className="modal-copy">
                  Create a product in the local demo catalog. It will not be
                  sent to a live service.
                </p>
                <label>
                  Product name
                  <input
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    placeholder="e.g. Document Review"
                  />
                </label>
                <label>
                  Price (NGN)
                  <input
                    type="number"
                    min="1"
                    value={productPrice}
                    onChange={e => setProductPrice(e.target.value)}
                    placeholder="2500"
                  />
                </label>
                {formError && <p className="form-error">{formError}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setModal('')}
                  >
                    Cancel
                  </button>
                  <button className="primary-btn" type="submit">
                    <Plus size={16} /> Add product
                  </button>
                </div>
              </form>
            )}
            {modal === 'customer' && (
              <form onSubmit={addCustomer}>
                <p className="modal-copy">
                  Add a synthetic customer profile for testing dashboard
                  interactions.
                </p>
                <label>
                  Customer name
                  <input
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Full name"
                  />
                </label>
                <label>
                  Email address
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    placeholder="name@example.test"
                  />
                </label>
                {formError && <p className="form-error">{formError}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setModal('')}
                  >
                    Cancel
                  </button>
                  <button className="primary-btn" type="submit">
                    <Plus size={16} /> Add customer
                  </button>
                </div>
              </form>
            )}
            {modal === 'help' && (
              <div className="guide-copy">
                <p>
                  This public demo is built for exploring the SOKOTECH
                  operations experience without creating an account.
                </p>
                <ul>
                  <li>
                    Use the left navigation to explore each dashboard page.
                  </li>
                  <li>
                    Approve or reject requests, add sample products and
                    customers, pause services, and export CSV reports.
                  </li>
                  <li>
                    Changes are held in this browser session only and may reset
                    on refresh.
                  </li>
                  <li>
                    All names, amounts, requests, and inventory are fictional.
                    No live identity checks, payments, PIN redemption, or
                    provider calls are made.
                  </li>
                </ul>
                <div className="safe-note">
                  <ShieldCheck size={18} /> Real accounts and operational data
                  remain protected outside this demo.
                </div>
                <div className="modal-actions">
                  <button className="primary-btn" onClick={() => setModal('')}>
                    Got it
                  </button>
                </div>
              </div>
            )}
            {modal === 'profile' && (
              <div className="guide-copy">
                <div className="profile-large">
                  <div className="avatar navy">DA</div>
                  <div>
                    <b>Demo Admin</b>
                    <p>Public preview · No account connected</p>
                  </div>
                </div>
                <div className="safe-note">
                  <LockKeyhole size={18} /> No real sign-in or account settings
                  are connected.
                </div>
                <div className="modal-actions">
                  <button className="primary-btn" onClick={() => setModal('')}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function Toolbar({ query, setQuery, filter, setFilter, filters, placeholder }) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <Search size={17} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder || 'Search...'}
          aria-label={placeholder || 'Search'}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>
      {filters && (
        <label className="filter-box">
          <Filter size={16} />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter requests"
          >
            {filters.map(f => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
function RequestTable({ rows, onUpdate }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Customer</th>
            <th>Service</th>
            <th>Submitted</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td className="mono">{r.id}</td>
              <td>
                <div className="person-cell">
                  <div className="avatar avatar-color-1">
                    {r.name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <b>{r.name}</b>
                </div>
              </td>
              <td>{r.service}</td>
              <td>{r.date}</td>
              <td className="amount">{r.amount}</td>
              <td>
                <Status value={r.status} />
              </td>
              <td>
                {r.status === 'Pending' || r.status === 'In review' ? (
                  <div className="action-pair">
                    <button
                      className="approve-btn"
                      onClick={() => onUpdate(r.id, 'Approved')}
                      title="Approve request"
                      aria-label={'Approve ' + r.id}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      className="reject-btn"
                      onClick={() => onUpdate(r.id, 'Rejected')}
                      title="Reject request"
                      aria-label={'Reject ' + r.id}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="icon-button small"
                    onClick={() => onUpdate(r.id, 'In review')}
                    title="Reopen for review"
                    aria-label={'Reopen ' + r.id}
                  >
                    <Eye size={15} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-state">
          <Search size={22} />
          <b>No matching records</b>
          <span>Try another search or filter.</span>
        </div>
      )}
    </div>
  );
}
function StatCard({ title, value, detail, icon, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className={'stat-icon ' + tone}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        <span className="trend neutral">{detail}</span>
      </div>
    </div>
  );
}
export default App;
