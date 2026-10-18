import { useEffect, useState } from 'react';
import { api, auth } from '@appdeploy/client';
import type { AuthUser } from '@appdeploy/client';
import { Activity, ArrowRight, BadgeCheck, BookOpenCheck, Building2, CheckCircle2, Clock3, CreditCard, FileCheck2, FileText, Fingerprint, GraduationCap, IdCard, KeyRound, Landmark, LogOut, Plus, RefreshCw, ScanSearch, ShieldCheck, Smartphone, UserRound, UserRoundCheck, WalletCards, Wifi, XCircle, X, Menu } from 'lucide-react';

const serviceGroups = [
  { title: 'NIN & BVN Services', description: 'Identity lookup, validation and slip services', services: ['NIN Services', 'NIN Slip Printing', 'NIN Validation', 'BVN Services', 'BVN Lookup', 'BVN Details'] },
  { title: 'NIMC & SOKOTECH Operations', description: 'Manual requests reviewed by the Super Agent', services: ['NIMC VPN Creation', 'Validation', 'IPE Clearance', 'Personalization', 'Modification'] },
  { title: 'Education & Exam Pins', description: 'Education PIN and examination PIN requests', services: ['Education PINs', 'Exam PINs'] },
  { title: 'Business & Digital Services', description: 'Registration, airtime conversion and subscriptions', services: ['CAC Registration', 'VTU Services', 'Airtime to Cash', 'Subscriptions'] }
];
const serviceTypes = serviceGroups.flatMap(group => group.services);
const serviceIcon = (service: string) => {
  const icons: Record<string, typeof Fingerprint> = {
    'NIN Services': Fingerprint, 'NIN Slip Printing': IdCard, 'NIN Validation': BadgeCheck,
    'BVN Services': ShieldCheck, 'BVN Lookup': ScanSearch, 'BVN Details': UserRoundCheck,
    'NIMC VPN Creation': Wifi, 'Validation': FileCheck2, 'IPE Clearance': BadgeCheck,
    'Personalization': UserRound, 'Modification': FileText, 'Education PINs': GraduationCap,
    'Exam PINs': BookOpenCheck, 'CAC Registration': Building2, 'VTU Services': Smartphone,
    'Airtime to Cash': CreditCard, 'Subscriptions': CreditCard
  };
  return icons[service] || FileText;
};
const statuses = ['Submitted', 'Under review', 'Awaiting information', 'Processing', 'Completed', 'Rejected'];
type PricingRecord = { serviceType: string; price: number | null; updatedAt?: string };
const formatNaira = (price: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(price);
const remainingTime = (createdAt: string, now: number) => { const left = 72 * 3600000 - (now - new Date(createdAt).getTime()); if (left <= 0) return '72-hour target passed'; const h = Math.floor(left / 3600000); const m = Math.floor((left % 3600000) / 60000); const s = Math.floor((left % 60000) / 1000); return `${h}h ${m}m ${s}s remaining`; };
const ninSlipLayouts = [
  { name: 'Regular Slip', price: 180, image: 'https://www.arapoint.com.ng/assets/image_1764211451522-BgEVjxxa.png' },
  { name: 'Standard Slip', price: 180, image: 'https://www.arapoint.com.ng/assets/image_1764211490940-D3_xPwcB.png' },
  { name: 'Premium Slip', price: 200, image: 'https://www.arapoint.com.ng/assets/image_1764211520708-BojOSBwc.png' }
];
const SERVICE_DESCRIPTIONS: Record<string, string> = {
  'NIN Services': 'Browse available NIN-related services and submit a request for manual processing.', 'NIN Slip Printing': 'Request NIN slip printing assistance and track the status here.', 'NIN Validation': 'Submit a NIN validation request for authorized review.', 'BVN Services': 'Browse BVN-related service requests and follow their progress.', 'BVN Lookup': 'Request a BVN lookup through the approved service workflow.', 'BVN Details': 'Submit a BVN details request for authorized processing.', 'NIMC VPN Creation': 'Request FortiClient VPN setup. A Super Agent reviews the request and updates its status after processing.', 'Validation': 'Submit a validation request and monitor the manual review status.', 'IPE Clearance': 'Submit an IPE clearance request for manual review.', 'Personalization': 'Request personalization support and follow progress updates.', 'Modification': 'Submit a modification request for authorized processing.', 'Education PINs': 'Request education PIN assistance. Fulfilment depends on a configured provider.', 'Exam PINs': 'Submit an exam PIN request. This page records the request; it does not issue a PIN automatically.', 'CAC Registration': 'Request CAC registration assistance and track manual processing.', 'VTU Services': 'Submit a VTU service request. Airtime/data provider integration is not connected yet.', 'Airtime to Cash': 'Request airtime-to-cash assistance. No conversion occurs automatically.', 'Subscriptions': 'Submit a subscription request and track its status.'
};
type RequestRecord = {
  id: string; requestRef: string; ownerId: string; serviceType?: string; servicePrice?: number | null; customerName: string; email: string;
  phone: string; organization: string; purpose: string; deviceOS?: string; vpnType?: string; duration?: string;
  serviceDetails?: string; notes: string; status: string; agentNote: string; createdAt: string; updatedAt: string;
  history: { status: string; note: string; actor: string; at: string }[];
};
const statusClass = (value: string) => value.toLowerCase().replaceAll(' ', '-');

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [view, setView] = useState<'customer' | 'agent'>('customer');
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [validationType, setValidationType] = useState('No record found');
  const isSuperAgent = (user?.email || '').toLowerCase() === 'superadmin@sokotech.com.ng';
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [agentQueue, setAgentQueue] = useState<RequestRecord[]>([]);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [form, setForm] = useState({ serviceType: serviceTypes[0], customerName: '', email: '', phone: '', organization: '', purpose: '', deviceOS: 'Windows', vpnType: 'Not sure — agent to confirm', duration: 'As advised by NIMC', serviceDetails: '', notes: '' });
  const [agentStatus, setAgentStatus] = useState('Under review');
  const [agentNote, setAgentNote] = useState('');
  const [selectedSlip, setSelectedSlip] = useState('');
  const [ninNumber, setNinNumber] = useState('');
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [pricingValues, setPricingValues] = useState<Record<string, string>>({});
  const [viewRequest, setViewRequest] = useState<RequestRecord | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    auth.getUser().then(current => {
      setUser(current);
      setView((current?.email || '').toLowerCase() === 'superadmin@sokotech.com.ng' ? 'agent' : 'customer');
      if (current?.email) setForm(previous => ({ ...previous, email: current.email || '', customerName: current.name || '' }));
    }).catch(() => setUser(null)).finally(() => setAuthLoading(false));
  }, []);

  const loadRequests = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.get(view === 'agent' ? '/api/agent/vpn-requests' : '/api/vpn/requests');
      if (view === 'agent') setAgentQueue(result.data.requests || []);
      else setRequests(result.data.requests || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load requests.';
      setErrorMessage(view === 'agent' ? 'Super Agent access is restricted. Sign in with the authorized administrator account.' : message);
      if (view === 'agent') setAgentQueue([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadRequests(); }, [user, view]);
  useEffect(() => { if (!user) return; const timer = window.setInterval(() => { setClockNow(Date.now()); void loadRequests(); }, 10000); return () => window.clearInterval(timer); }, [user, view]);
  useEffect(() => { if (!user || view !== 'agent') { setPricing([]); return; } let active = true; api.get('/api/agent/pricing').then(result => { if (!active) return; const rows = (result.data.pricing || []) as PricingRecord[]; setPricing(rows); setPricingValues(Object.fromEntries(rows.map(row => [row.serviceType, row.price == null ? '' : String(row.price)]))); }).catch(() => { if (active) setErrorMessage('Unable to load service pricing. Refresh and try again.'); }); return () => { active = false; }; }, [user, view]);

  const signIn = async () => {
    setSigningIn(true); setErrorMessage('');
    try {
      const result = await auth.signIn();
      setUser(result.user);
      setView((result.user.email || '').toLowerCase() === 'superadmin@sokotech.com.ng' ? 'agent' : 'customer');
      setActivePage('dashboard');
      setForm(previous => ({ ...previous, email: result.user.email || '', customerName: result.user.name || '' }));
    } catch (error) {
      const code = (error as { code?: string })?.code;
      setErrorMessage(code === 'popup_blocked' ? 'Allow sign-in popups in your browser and try again.' : code === 'popup_closed' ? 'Sign-in was cancelled.' : 'Sign-in failed. Please try again.');
    } finally { setSigningIn(false); }
  };

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setErrorMessage(''); setNotice('');
    const isNinSlip = form.serviceType === 'NIN Slip Printing';
    const isValidation = form.serviceType === 'Validation' || form.serviceType === 'NIN Validation';
    if (isNinSlip ? (!selectedSlip || !/^\d{11}$/.test(ninNumber)) : isValidation ? (!/^\d{11}$/.test(ninNumber) || !validationType) : (!form.customerName.trim() || !form.email.trim() || !form.phone.trim() || !form.organization.trim() || !form.purpose.trim())) {
      setErrorMessage(isNinSlip ? 'Choose a slip layout and enter a valid 11-digit NIN.' : isValidation ? 'Enter a valid 11-digit NIN and choose a validation type.' : 'Complete all required fields before submitting.'); return;
    }
    setLoading(true);
    try {
      const requestPayload = isNinSlip ? { serviceType: 'NIN Slip Printing', slipLayout: selectedSlip, ninNumber } : isValidation ? { serviceType: 'NIN Validation', ninNumber, validationType } : form;
      const result = await api.post('/api/vpn/requests', requestPayload);
      setNotice('Request submitted. Reference: ' + result.data.request.requestRef + '. The Super Agent team will process it manually.');
      setForm(previous => ({ ...previous, phone: '', organization: '', purpose: '', serviceDetails: '', notes: '' }));
      if (isNinSlip) { setSelectedSlip(''); setNinNumber(''); }
      if (isValidation) { setNinNumber(''); setValidationType('No record found'); }
      await loadRequests();
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Request could not be submitted.'); }
    finally { setLoading(false); }
  };

  const saveAgentUpdate = async () => {
    if (!selected) return;
    setLoading(true); setErrorMessage('');
    try {
      await api.put('/api/agent/vpn-requests/' + selected.id, { status: agentStatus, agentNote });
      setNotice('Request ' + selected.requestRef + ' updated.');
      setSelected(null); setAgentNote('');
      await loadRequests();
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Update failed.'); }
    finally { setLoading(false); }
  };

  const saveServicePrice = async (serviceType: string) => { const raw = pricingValues[serviceType] ?? ''; const price = Number(raw); if (raw.trim() === '' || !Number.isFinite(price) || price < 0) { setErrorMessage('Enter a valid price of ₦0 or more for ' + serviceType + '.'); return; } setLoading(true); setErrorMessage(''); setNotice(''); try { const result = await api.post('/api/agent/pricing', { serviceType, price }); const saved = result.data.pricing as PricingRecord; setPricing(rows => [...rows.filter(row => row.serviceType !== serviceType), saved].sort((x,y) => x.serviceType.localeCompare(y.serviceType))); setNotice('Pricing saved for ' + serviceType + ': ' + formatNaira(price) + '. New requests will use this price.'); } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to save service price.'); } finally { setLoading(false); } };

  const signOut = async () => {
    await auth.signOut(); setUser(null); setRequests([]); setAgentQueue([]); setView('customer'); setActivePage('dashboard');
  };

  const openServicePage = (service: string) => {
    setSidebarOpen(false);
    setActivePage(service);
    setForm(previous => ({ ...previous, serviceType: service }));
    setNotice(''); setErrorMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (authLoading) return <main className="center-screen"><div className="loader" /><p>Loading SOKOTECH secure workspace…</p></main>;
  if (!user) return <main className="landing-page">
    <header className="landing-nav"><a className="landing-brand" href="#top"><span className="brand-mark"><ShieldCheck size={24} /></span><span><strong>SOKO<span>TECH</span></strong><small>YOUR DIGITAL SERVICE HUB</small></span></a><div className="landing-nav-actions"><span className="landing-secure"><ShieldCheck size={14} /> Secure service requests</span><button className="secondary" onClick={signIn} disabled={signingIn}>{signingIn ? 'Opening sign-in…' : 'Sign in'} <ArrowRight size={15} /></button></div></header>
    <section className="landing-hero" id="top"><div className="landing-hero-copy"><span className="landing-kicker"><span /> SIMPLE. SECURE. TRACKABLE.</span><h1>Your essential services, <em>all in one place.</em></h1><p>Submit service requests, keep track of every update, and get support from the SOKOTECH team through one secure workspace.</p><div className="landing-cta"><button className="primary" onClick={signIn} disabled={signingIn}><UserRound size={17} /> {signingIn ? 'Opening secure access…' : 'Get started'} <ArrowRight size={16} /></button><a href="#services">Explore services <ArrowRight size={15} /></a></div><div className="landing-trust-row"><span><CheckCircle2 size={16} /> Private request history</span><span><CheckCircle2 size={16} /> Human-reviewed requests</span></div></div><div className="landing-visual"><div className="landing-orbit orbit-one" /><div className="landing-orbit orbit-two" /><div className="landing-center-icon"><ShieldCheck size={48} /></div><div className="floating-service float-top"><Fingerprint size={19} /><span><b>Identity services</b><small>NIN & BVN support</small></span></div><div className="floating-service float-right"><Wifi size={19} /><span><b>VPN requests</b><small>Manual agent review</small></span></div><div className="floating-service float-bottom"><FileCheck2 size={19} /><span><b>Request tracking</b><small>Updates in one place</small></span></div></div></section>
    <section className="landing-benefits"><article><span><ShieldCheck size={20} /></span><div><b>Secure by design</b><p>Your requests stay tied to your signed-in account.</p></div></article><article><span><Activity size={20} /></span><div><b>Clear progress</b><p>See submitted, processing and completed requests.</p></div></article><article><span><UserRoundCheck size={20} /></span><div><b>Human support</b><p>Manual requests are reviewed by the authorized team.</p></div></article></section>
    <section className="landing-services" id="services"><div className="landing-section-heading"><div><p className="eyebrow">WHAT WE CAN HELP WITH</p><h2>Services made simpler.</h2><p>Choose a category to get started. Available services may be processed manually.</p></div><span className="landing-service-count">{serviceTypes.length} services</span></div><div className="landing-service-grid">{serviceGroups.map((group, groupIndex) => <article className="landing-service-card" key={group.title}><div className="landing-service-card-head"><span className="landing-group-icon">{groupIndex === 0 ? <Fingerprint size={21} /> : groupIndex === 1 ? <Wifi size={21} /> : groupIndex === 2 ? <GraduationCap size={21} /> : <Building2 size={21} />}</span><div><h3>{group.title}</h3><p>{group.description}</p></div></div><div className="landing-service-chips">{group.services.map(service => { const Icon = serviceIcon(service); return <span key={service}><Icon size={15} /> {service}</span>; })}</div></article>)}</div></section>
    <section className="landing-bottom-cta"><div><p className="eyebrow">READY WHEN YOU ARE</p><h2>Start your request with SOKOTECH.</h2><p>Sign in securely to access your dashboard and follow your service updates.</p></div><button className="primary" onClick={signIn} disabled={signingIn}>Continue securely <ArrowRight size={16} /></button></section>
    <footer className="landing-footer"><a className="landing-brand" href="#top"><span className="brand-mark"><ShieldCheck size={20} /></span><span><strong>SOKO<span>TECH</span></strong><small>YOUR DIGITAL SERVICE HUB</small></span></a><span>© {new Date().getFullYear()} SOKOTECH · Secure service workflow</span><span className="landing-footer-auth"><KeyRound size={13} /> Secure email verification sign-in</span><span className="powered-by">Powered by <strong>Aratech Solution</strong></span></footer>
    {errorMessage && <div className="landing-error alert error"><XCircle size={17} />{errorMessage}<button onClick={() => setErrorMessage('')}><X size={15} /></button></div>}
  </main>;

  const isVpn = form.serviceType === 'NIMC VPN Creation';
  const recentTransactions = [...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  const recentVerifications = requests
    .filter(request => /nin|bvn/i.test(request.serviceType || '') && /lookup|validation/i.test(request.serviceType || ''))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return <div className="app-shell">
    <header className="topbar"><button className="mobile-menu-button" aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}><Menu size={20} /></button><div className="brand"><div className="brand-mark"><ShieldCheck size={23} /></div><div><strong>SOKO<span>TECH</span></strong><small>CUSTOMER SERVICE HUB</small></div></div>
      <div className="top-actions"><span className="secure-pill"><span /> Secure workspace</span><div className="user-chip"><div className="avatar"><UserRound size={17} /></div><div><b>{user.name || user.email || 'Signed-in user'}</b><small>{user.email}</small></div></div><button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={17} /></button></div>
    </header>
    <main className="workspace"><aside className={sidebarOpen ? 'sidebar sidebar-open' : 'sidebar'}><p className="eyebrow">{isSuperAgent ? 'AGENT WORKSPACE' : 'CUSTOMER MENU'}</p>
      {isSuperAgent ? <><div className="role-label"><ShieldCheck size={17} /><span>Super Agent access</span></div><button className="nav-link active" onClick={() => { setView('agent'); setSelected(null); }}><Activity size={17} /> Manual request queue</button><div className="sidebar-help"><div className="help-icon"><ShieldCheck size={18} /></div><b>Agent-only workspace</b><p>Review customer requests and publish status updates here. Customer navigation is not available in this role.</p></div></> : <><button className={activePage === 'dashboard' ? 'nav-link active' : 'nav-link'} onClick={() => { setSidebarOpen(false); setActivePage('dashboard'); }}><Activity size={17} /> Dashboard</button><p className="sidebar-section-title">NIN & BVN SERVICES</p>{serviceGroups[0].services.filter(service => !['NIN Services', 'BVN Services', 'BVN Details'].includes(service)).map(service => { const Icon = serviceIcon(service); return <button key={service} className={activePage === service ? 'nav-link active' : 'nav-link'} onClick={() => openServicePage(service)}><Icon size={16} /> {service}</button>; })}<p className="sidebar-section-title">SOKOTECH SERVICES</p>{serviceGroups[1].services.map(service => { const Icon = serviceIcon(service); return <button key={service} className={activePage === service ? 'nav-link active' : 'nav-link'} onClick={() => openServicePage(service)}><Icon size={16} /> {service}</button>; })}<p className="sidebar-section-title">EDUCATION & EXAM</p>{serviceGroups[2].services.filter(service => service !== 'Exam PINs').map(service => { const Icon = serviceIcon(service); return <button key={service} className={activePage === service ? 'nav-link active' : 'nav-link'} onClick={() => openServicePage(service)}><Icon size={16} /> {service}</button>; })}<p className="sidebar-section-title">BUSINESS & DIGITAL</p>{serviceGroups[3].services.filter(service => !['Airtime to Cash', 'Subscriptions'].includes(service)).map(service => { const Icon = serviceIcon(service); return <button key={service} className={activePage === service ? 'nav-link active' : 'nav-link'} onClick={() => openServicePage(service)}><Icon size={16} /> {service}</button>; })}<button className={activePage === 'history' ? 'nav-link active' : 'nav-link'} onClick={() => setActivePage('history')}><Clock3 size={17} /> Request history</button><div className="sidebar-help"><div className="help-icon"><Activity size={18} /></div><b>Customer help</b><p>Choose a service to open its own page. Your requests and their statuses remain private to your account.</p></div></>}
    </aside>
    <section className="main-content">
      <div className="page-heading"><div><p className="eyebrow">{view === 'agent' ? 'AGENT-ONLY / MANUAL REVIEW' : activePage === 'dashboard' ? 'CUSTOMER / OVERVIEW' : activePage === 'history' ? 'CUSTOMER / HISTORY' : 'CUSTOMER / SERVICE PAGE'}</p><h1>{view === 'agent' ? 'Super Agent queue' : activePage === 'dashboard' ? 'Customer dashboard' : activePage === 'history' ? 'My request history' : activePage}</h1><p className="muted">{view === 'agent' ? 'Review and update requests within the restricted Super Agent workspace.' : activePage === 'dashboard' ? 'Your services, activity and request tracking in one place.' : activePage === 'history' ? 'View the status of requests submitted from your customer account.' : SERVICE_DESCRIPTIONS[activePage] || 'Submit a service request and track its progress.'}</p></div><button className="secondary" onClick={() => void loadRequests()} disabled={loading}><RefreshCw size={16} /> Refresh</button></div>
      {notice && <div className="alert success"><CheckCircle2 size={18} /> {notice}<button onClick={() => setNotice('')}><XCircle size={16} /></button></div>}
      {errorMessage && <div className="alert error"><XCircle size={18} /><span>{errorMessage}</span><button onClick={() => setErrorMessage('')}><XCircle size={16} /></button></div>}
      {view === 'customer' ? <>
        {activePage !== 'dashboard' && activePage !== 'history' && activePage !== 'NIN Slip Printing' && activePage !== 'NIN Validation' && <section className="service-detail-banner"><div className="service-detail-icon"><FileText size={23} /></div><div><p className="eyebrow">DEDICATED SERVICE PAGE</p><h2>{activePage}</h2><p>{SERVICE_DESCRIPTIONS[activePage] || 'Submit your request below. The team will update its status after review.'}</p><span className="manual-badge"><Clock3 size={13} /> Request-based service</span></div></section>}
        {activePage === 'dashboard' && <>
        <section className="sla-notice"><Clock3 size={17} /><span><strong>72-hour service target:</strong> each request has a countdown in Request history. Status updates refresh automatically.</span></section>
        <section className="wallet-demo-panel" aria-label="PaymentPoint demo wallet">
          <div className="wallet-demo-heading"><div className="wallet-demo-icon"><WalletCards size={21} /></div><div><p className="eyebrow">PAYMENTPOINT WALLET</p><h2>Wallet & funding account</h2></div><span className="demo-badge">DEMO DATA</span></div>
          <div className="wallet-demo-grid">
            <article className="wallet-demo-balance"><span>Available wallet balance</span><strong>₦25,000.00</strong><small>Illustrative balance · not live funds</small></article>
            <article className="wallet-demo-account"><div className="wallet-account-title"><Landmark size={17} /><b>Funding account details</b></div><dl><dt>Account name</dt><dd>SOKOTECH DEMO CUSTOMER</dd><dt>Bank / provider</dt><dd>PaymentPoint (Demo)</dd><dt>Account number</dt><dd>0000000000 <span className="placeholder-tag">Placeholder</span></dd></dl></article>
          </div>
          <p className="wallet-demo-notice"><ShieldCheck size={15} /> Demo values only. This is not a real PaymentPoint balance or usable bank account. Live details will appear after secure API integration.</p>
        </section>
        <section className="quick-services-panel"><div className="catalog-heading"><div><p className="eyebrow">SHORTCUTS</p><h2>Quick services</h2><p className="muted">Jump straight to a frequently used service.</p></div></div><div className="quick-services-grid">{['NIN Slip Printing', 'NIN Validation', 'Validation', 'NIMC VPN Creation', 'BVN Lookup', 'Personalization'].map(service => { const Icon = serviceIcon(service); return <button className="quick-service-card" key={service} onClick={() => openServicePage(service)}><span><Icon size={18} /></span><strong>{service}</strong><ArrowRight size={15} /></button>; })}</div></section>
        <div className="recent-panels">
          <section className="panel request-list-panel"><div className="panel-title"><div className="panel-icon"><Activity size={18} /></div><div><h2>Recent transactions</h2><p>Your latest submitted service requests and their current status.</p></div><span className="count-badge">{recentTransactions.length}</span></div>
            {loading && <p className="muted">Loading recent transactions…</p>}
            {!loading && requests.length === 0 && <div className="empty-state"><Activity size={25} /><b>No recent transactions</b><span>Your submitted service requests will appear here.</span></div>}
            <div className="request-list">{recentTransactions.map(request => <article className="request-card" key={request.id}><div className="request-card-top"><b>{request.requestRef}</b><span className={'status ' + statusClass(request.status)}>{request.status}</span></div><p><strong>{request.serviceType || 'NIMC VPN Creation'}</strong> · {request.organization}</p><small>Submitted {new Date(request.createdAt).toLocaleString()}</small><div className="request-card-foot"><span><Clock3 size={14} /> Updated {new Date(request.updatedAt).toLocaleDateString()}</span></div></article>)}</div>
          </section>
          <section className="panel request-list-panel"><div className="panel-title"><div className="panel-icon"><ShieldCheck size={18} /></div><div><h2>Recent verifications</h2><p>Recent NIN/BVN lookup or validation requests. Results appear only after an authorized agent updates them.</p></div><span className="count-badge">{recentVerifications.length}</span></div>
            {loading && <p className="muted">Loading recent verifications…</p>}
            {!loading && recentVerifications.length === 0 ? <div className="empty-state"><ShieldCheck size={25} /><b>No recent verifications</b><span>NIN/BVN lookup and validation requests will appear here after you submit them.</span></div> : <div className="request-list">{recentVerifications.map(request => <article className="request-card" key={request.id}><div className="request-card-top"><b>{request.requestRef}</b><span className={'status ' + statusClass(request.status)}>{request.status}</span></div><p><strong>{request.serviceType}</strong></p><small>Requested {new Date(request.createdAt).toLocaleString()}</small>{request.agentNote && <div className="agent-note"><b>Agent update</b><p>{request.agentNote}</p></div>}</article>)}</div>}
          </section>
        </div>
        </>}
        <div className="customer-grid">
          {activePage !== 'history' && activePage !== 'dashboard' && <section className={form.serviceType === 'NIN Slip Printing' ? 'panel nin-slip-panel' : 'panel'} id="new-request"><div className="panel-title"><div className="panel-icon"><Plus size={18} /></div><div><h2>{form.serviceType === 'NIN Slip Printing' ? 'Print NIN Slip' : (form.serviceType === 'Validation' || form.serviceType === 'NIN Validation') ? 'NIN validation request' : 'New service request'}</h2><p>{form.serviceType === 'NIN Slip Printing' ? 'Select a layout, enter your NIN, and submit.' : (form.serviceType === 'Validation' || form.serviceType === 'NIN Validation') ? 'Enter your 11-digit NIN and select the validation issue.' : 'Choose a service and provide the required information.'}</p></div></div>
            <form onSubmit={submitRequest} className="request-form">
              {form.serviceType === 'NIN Slip Printing' && <section className="nin-slip-flow"><div className="nin-step-heading"><span>1</span><div><h3>Choose Slip Layout</h3><p>Select the slip format you want to print.</p></div></div><div className="nin-slip-options">{ninSlipLayouts.map(layout => <button type="button" key={layout.name} className={'nin-slip-option ' + (selectedSlip === layout.name ? 'selected' : '')} onClick={() => setSelectedSlip(layout.name)} aria-pressed={selectedSlip === layout.name}><img src={layout.image} alt={layout.name + ' preview'} loading="lazy" /><span className="nin-slip-option-details"><strong>{layout.name}</strong><b>₦{layout.price.toFixed(2)}</b></span><span className="nin-slip-select">{selectedSlip === layout.name ? 'Selected' : 'Choose'}</span></button>)}<article className="nin-slip-option nin-slip-coming-soon"><div className="nin-slip-placeholder"><IdCard size={34} /><span>Fourth slip preview</span></div><span className="nin-slip-option-details"><strong>Fourth Slip Type</strong><b>Price to be confirmed</b></span><span className="nin-slip-select">Coming soon</span></article></div><div className="nin-step-heading nin-step-two"><span>2</span><div><h3>Enter NIN</h3><p>Enter the 11-digit National Identification Number for the slip.</p></div></div><label>NIN *<input inputMode="numeric" autoComplete="off" value={ninNumber} onChange={e => setNinNumber(e.target.value.replace(/\D/g, '').slice(0, 11))} required={form.serviceType === 'NIN Slip Printing'} minLength={11} maxLength={11} pattern="[0-9]{11}" placeholder="Enter 11-digit NIN" /></label><p className="nin-privacy-note"><ShieldCheck size={15} /> Your request will be queued for authorized processing. Live NIN printing is not connected yet.</p></section>}
              {form.serviceType !== 'NIN Slip Printing' && form.serviceType !== 'Validation' && form.serviceType !== 'NIN Validation' && <label>Service type *<select value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })}>{serviceGroups.map(group => <optgroup key={group.title} label={group.title}>{group.services.map(type => <option key={type}>{type}</option>)}</optgroup>)}</select></label>
              }{(form.serviceType === 'Validation' || form.serviceType === 'NIN Validation') && <section className="nin-slip-flow validation-flow"><div className="nin-step-heading"><span>1</span><div><h3>NIN validation request</h3><p>Enter the NIN and select the issue shown on the record.</p></div></div><label>NIN *<input inputMode="numeric" autoComplete="off" value={ninNumber} onChange={e => setNinNumber(e.target.value.replace(/\D/g, '').slice(0, 11))} required minLength={11} maxLength={11} pattern="[0-9]{11}" placeholder="Enter 11-digit NIN" /></label><label>Validation type *<select value={validationType} onChange={e => setValidationType(e.target.value)} required><option>No record found</option><option>Photograph error</option><option>Update record</option><option>Inprocessing error</option></select></label><p className="nin-privacy-note"><ShieldCheck size={15} /> Only the NIN and selected validation issue are required. Your request will be reviewed manually.</p></section>}
              {form.serviceType !== 'NIN Slip Printing' && form.serviceType !== 'Validation' && form.serviceType !== 'NIN Validation' && <><label>Full name *<input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} required maxLength={120} placeholder="Enter your full name" /></label>
              <div className="form-row"><label>Email address *<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required maxLength={254} placeholder="you@example.com" /></label><label>Phone number *<input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required maxLength={30} placeholder="+234…" /></label></div></>}
              {form.serviceType !== 'NIN Slip Printing' && form.serviceType !== 'Validation' && form.serviceType !== 'NIN Validation' && <><label>Organization / unit *<input value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} required maxLength={160} placeholder="Organization or approved unit" /></label>
              <label>Purpose / reason for service *<textarea value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} required maxLength={1500} rows={3} placeholder="Explain the work or service required" /></label></>}
              {isVpn && <><div className="form-row"><label>Device operating system<select value={form.deviceOS} onChange={e => setForm({ ...form, deviceOS: e.target.value })}><option>Windows</option><option>macOS</option><option>Linux</option><option>Android</option><option>iOS</option></select></label><label>VPN type<select value={form.vpnType} onChange={e => setForm({ ...form, vpnType: e.target.value })}><option>Not sure — agent to confirm</option><option>SSL-VPN</option><option>IPsec VPN</option></select></label></div><label>Access duration<select value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}><option>As advised by NIMC</option><option>Temporary access</option><option>Ongoing access review</option></select></label></>}
              {form.serviceType !== 'NIN Slip Printing' && form.serviceType !== 'Validation' && form.serviceType !== 'NIN Validation' && <><label>Service-specific details (optional)<textarea value={form.serviceDetails} onChange={e => setForm({ ...form, serviceDetails: e.target.value })} maxLength={1500} rows={3} placeholder={isVpn ? 'Non-sensitive setup details only' : 'Enter non-sensitive details needed to process this service; do not include passwords or OTPs'} /></label>
              <label>Additional notes (optional)<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={2} placeholder="Add non-sensitive details only" /></label></>}
              <div className="privacy-note"><ShieldCheck size={17} /><span>Never enter passwords, OTPs, VPN pre-shared keys, or other login secrets. An authorized agent will contact you if more information is needed.</span></div>
              <button className="primary wide" type="submit" disabled={loading}><Plus size={17} /> {loading ? 'Submitting request…' : (form.serviceType === 'Validation' || form.serviceType === 'NIN Validation') ? 'Submit validation request' : 'Submit service request'}</button>
          </form></section>}
          {activePage === 'history' && <section className="panel request-list-panel" id="my-requests"><div className="panel-title"><div className="panel-icon"><FileText size={18} /></div><div><h2>My requests & history</h2><p>All service requests, full details, 72-hour countdown and live status updates.</p></div><span className="count-badge">{requests.length}</span></div>
            {loading && <p className="muted">Loading requests…</p>}
            {!loading && requests.length === 0 && <div className="empty-state"><FileText size={25} /><b>No requests yet</b><span>Submit a service request to see it here.</span></div>}
            <div className="request-list">{requests.map(request => <article className="request-card" key={request.id}><div className="request-card-top"><b>{request.requestRef}</b><span className={'status ' + statusClass(request.status)}>{request.status}</span></div><p><strong>{request.serviceType || 'NIMC VPN Creation'}</strong> · {request.organization}</p><small>Submitted {new Date(request.createdAt).toLocaleString()}</small><div className="sla-countdown"><Clock3 size={14} /> {remainingTime(request.createdAt, clockNow)}</div>{request.agentNote && <div className="agent-note"><b>Latest agent update</b><p>{request.agentNote}</p></div>}<div className="request-card-foot"><span><Clock3 size={14} /> Updated {new Date(request.updatedAt).toLocaleDateString()}</span><span>{request.history?.length || 1} updates</span><button className="text-action" onClick={() => setViewRequest(viewRequest?.id === request.id ? null : request)}>{viewRequest?.id === request.id ? 'Hide details' : 'View full details'}</button></div>{viewRequest?.id === request.id && <div className="request-expanded"><h3>Service request details</h3><dl><dt>Service</dt><dd>{request.serviceType}</dd><dt>Reference</dt><dd>{request.requestRef}</dd><dt>Submitted</dt><dd>{new Date(request.createdAt).toLocaleString()}</dd><dt>Service details</dt><dd>{request.serviceDetails || 'No extra details'}</dd><dt>Price recorded</dt><dd>{typeof request.servicePrice === 'number' ? formatNaira(request.servicePrice) : 'Price not set'}</dd></dl><h3>Status history</h3><div className="timeline">{(request.history || []).map((entry, index) => <div className="timeline-item" key={entry.at + index}><span className="timeline-dot" /><div><b>{entry.status}</b><small>{new Date(entry.at).toLocaleString()} · {entry.actor}</small><p>{entry.note || 'Status updated.'}</p></div></div>)}</div></div>}</article>)}</div>
          </section>}
        </div>
      </> : <section className="panel">
        <div className="panel-title"><div className="panel-icon"><ShieldCheck size={18} /></div><div><h2>Manual processing queue</h2><p>Only the allowlisted Super Agent can access cross-customer requests.</p></div><span className="count-badge">{agentQueue.length}</span></div>
        <section className="pricing-manager"><div className="panel-title"><div className="panel-icon"><CreditCard size={18} /></div><div><h2>Service pricing management</h2><p>Prices apply to new requests only. Existing requests keep their recorded price.</p></div></div><div className="pricing-grid">{pricing.map(item => <div className="pricing-row" key={item.serviceType}><label>{item.serviceType}<span>{item.serviceType === 'NIN Validation' || item.serviceType === 'Validation' ? 'Default price: ₦1,000' : 'Set a price for this service'}</span><div className="price-input-wrap"><span>₦</span><input type="number" min="0" step="1" value={pricingValues[item.serviceType] ?? ''} onChange={event => setPricingValues(current => ({ ...current, [item.serviceType]: event.target.value }))} placeholder="Enter price" /></div></label><button className="secondary" onClick={() => void saveServicePrice(item.serviceType)} disabled={loading}>Save price</button></div>)}</div></section>
        {loading && <p className="muted">Loading queue…</p>}
        {!loading && agentQueue.length === 0 && !errorMessage && <div className="empty-state"><ShieldCheck size={25} /><b>No open requests</b><span>New customer requests will appear here.</span></div>}
        <div className="queue-layout"><div className="request-list">{agentQueue.map(request => <button className={'queue-item ' + (selected?.id === request.id ? 'selected' : '')} key={request.id} onClick={() => { setSelected(request); setAgentStatus(request.status); setAgentNote(request.agentNote || ''); }}><div className="request-card-top"><b>{request.requestRef}</b><span className={'status ' + statusClass(request.status)}>{request.status}</span></div><p><strong>{request.serviceType || 'NIMC VPN Creation'}</strong> · {request.customerName}</p><small>{request.organization}</small><span className="queue-arrow"><ArrowRight size={15} /></span></button>)}</div>
          {selected && <div className="agent-detail"><div className="panel-title"><div><h2>{selected.requestRef}</h2><p>{selected.serviceType || 'NIMC VPN Creation'}</p></div><button className="icon-button" onClick={() => setSelected(null)}><X size={17} /></button></div>
            <div className="sla-countdown"><Clock3 size={14} /> {remainingTime(selected.createdAt, clockNow)}</div><dl><dt>Customer</dt><dd>{selected.customerName}</dd><dt>Email / phone</dt><dd>{selected.email} · {selected.phone}</dd><dt>Organization</dt><dd>{selected.organization}</dd><dt>Purpose</dt><dd>{selected.purpose}</dd>{(selected.serviceType || 'NIMC VPN Creation') === 'NIMC VPN Creation' && <><dt>Device / VPN</dt><dd>{selected.deviceOS || 'Not specified'} · {selected.vpnType || 'Agent to confirm'}</dd><dt>Duration</dt><dd>{selected.duration || 'Not specified'}</dd></>}<dt>Service details</dt><dd>{selected.serviceDetails || 'None supplied'}</dd><dt>Customer notes</dt><dd>{selected.notes || 'None supplied'}</dd></dl>
            <div className="manual-checklist"><b>Manual processing checklist</b><p>Verify authorization, complete the requested service through approved channels, record only customer-safe updates, and mark Completed only after the work is confirmed.</p></div>
            <label>Status<select value={agentStatus} onChange={e => setAgentStatus(e.target.value)}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
            <label>Update for customer<textarea rows={3} value={agentNote} onChange={e => setAgentNote(e.target.value)} maxLength={1500} placeholder="Describe progress or the next action. Do not include secrets." /></label>
            <div className="request-expanded"><h3>Existing status history</h3><div className="timeline">{(selected.history || []).map((entry, index) => <div className="timeline-item" key={entry.at + index}><span className="timeline-dot" /><div><b>{entry.status}</b><small>{new Date(entry.at).toLocaleString()} · {entry.actor}</small><p>{entry.note || 'Status updated.'}</p></div></div>)}</div></div><button className="primary wide" onClick={() => void saveAgentUpdate()} disabled={loading}>Publish live status update</button>
          </div>}
        </div>
      </section>}
      <footer className="footer"><span>© {new Date().getFullYear()} SOKOTECH</span><span><ShieldCheck size={14} /> Secure manual service workflow</span><span>Wallet and external service integrations pending</span></footer>
    </section></main>
  </div>;
}
export default App;
