import { router, json, error, db, requireAuth, requireAdminEmailAllowlist } from '@appdeploy/sdk';

const ADMIN_EMAILS = ['superadmin@sokotech.com.ng'];
const SERVICE_TYPES = ['NIMC VPN Creation', 'Validation', 'IPE Clearance', 'Personalization', 'Modification', 'NIN Slip Printing', 'BVN Details', 'NIN Validation', 'CAC Registration', 'Education PINs', 'Exam PINs', 'BVN Lookup', 'VTU Services', 'Airtime to Cash', 'Subscriptions', 'NIN Services', 'BVN Services'];
const ALLOWED_STATUSES = ['Submitted', 'Under review', 'Awaiting information', 'Processing', 'Completed', 'Rejected'];
const DEFAULT_PRICES: Record<string, number | null> = Object.fromEntries(SERVICE_TYPES.map(service => [service, service === 'NIN Validation' || service === 'Validation' ? 1000 : null]));

type ServiceRequestInput = {
  serviceType?: string; customerName?: string; email?: string; phone?: string; organization?: string;
  purpose?: string; deviceOS?: string; vpnType?: string; duration?: string; serviceDetails?: string; notes?: string;
  slipLayout?: string; ninNumber?: string; validationType?: string; price?: number;
};
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ ok: true, service: 'sokotech-service-workflow' })],
  'GET /api/vpn/requests': [
    requireAuth(),
    async (ctx) => {
      const result = await db.list('vpn_requests', { filter: { ownerId: ctx.user!.userId }, limit: 100 });
      return json({ requests: result.items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }
  ],
  'POST /api/vpn/requests': [
    requireAuth(),
    async (ctx) => {
      const body = (ctx.body || {}) as ServiceRequestInput;
      const serviceType = clean(body.serviceType, 60);
      const customerName = clean(body.customerName, 120);
      const email = clean(body.email, 254).toLowerCase();
      const phone = clean(body.phone, 30);
      const organization = clean(body.organization, 160);
      const purpose = clean(body.purpose, 1500);
      const deviceOS = clean(body.deviceOS, 40);
      const vpnType = clean(body.vpnType, 60);
      const duration = clean(body.duration, 80);
      let serviceDetails = clean(body.serviceDetails, 1500);
      const notes = clean(body.notes, 1000);
      if (!SERVICE_TYPES.includes(serviceType)) return error('Choose a supported service type.', 400);
      if (serviceType === 'Validation' || serviceType === 'NIN Validation') {
        const ninNumber = clean(body.ninNumber, 11);
        const validationType = clean(body.validationType, 60);
        const validationTypes = ['No record found', 'Photograph error', 'Update record', 'Inprocessing error'];
        if (!/^\d{11}$/.test(ninNumber) || !validationTypes.includes(validationType)) return error('Enter a valid 11-digit NIN and choose a supported validation type.', 400);
        serviceDetails = `NIN: ${ninNumber}; Validation type: ${validationType}`;
      } else if (serviceType === 'NIN Slip Printing') {
        const slipPrices: Record<string, number> = { 'Regular Slip': 180, 'Standard Slip': 180, 'Premium Slip': 200 };
        const slipLayout = clean(body.slipLayout, 40);
        const ninNumber = clean(body.ninNumber, 11);
        if (!Object.prototype.hasOwnProperty.call(slipPrices, slipLayout) || !/^\d{11}$/.test(ninNumber)) {
          return error('Choose an available slip layout and enter a valid 11-digit NIN.', 400);
        }
        serviceDetails = `Slip layout: ${slipLayout}; Price: ₦${slipPrices[slipLayout].toFixed(2)}; NIN: ${ninNumber}`;
      } else if (serviceType !== 'Validation' && serviceType !== 'NIN Validation' && (!customerName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !organization || !purpose)) {
        return error('Please provide a valid name, email, phone, organization, and purpose.', 400);
      }
      const now = new Date().toISOString();
      const prefix = serviceType === 'NIMC VPN Creation' ? 'VPN' : serviceType.toUpperCase().replaceAll(' ', '').slice(0, 8);
      const requestRef = prefix + '-' + now.slice(0, 10).replaceAll('-', '') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      const pricingRows = await db.list('service_pricing', { limit: 100 });
      const configuredPrice = pricingRows.items.find(item => item.serviceType === serviceType)?.price;
      const servicePrice = typeof configuredPrice === 'number' ? configuredPrice : (DEFAULT_PRICES[serviceType] ?? null);
      const record = {
        requestRef, ownerId: ctx.user!.userId, serviceType, servicePrice,
        customerName: customerName || clean(ctx.user!.name, 120) || 'Customer',
        email: email || clean(ctx.user!.email, 254).toLowerCase(), phone, organization: organization || 'NIN Slip Printing', purpose: purpose || 'NIN slip printing request',
        deviceOS: deviceOS || 'Not specified', vpnType: vpnType || 'Not sure — agent to confirm',
        duration: duration || 'As advised by NIMC', serviceDetails, notes, status: 'Submitted', agentNote: '',
        createdAt: now, updatedAt: now,
        history: [{ status: 'Submitted', note: 'Request received and queued for manual review.', actor: 'Customer', at: now }]
      };
      const [id] = await db.add('vpn_requests', [record]);
      if (!id) return error('Request could not be saved. Please retry.', 503);
      return json({ request: { ...record, id } }, 201);
    }
  ],
  'GET /api/pricing': [ requireAuth(), async () => { const saved = await db.list('service_pricing', { limit: 100 }); return json({ pricing: SERVICE_TYPES.map(serviceType => { const item = saved.items.find(row => row.serviceType === serviceType); return { serviceType, price: typeof item?.price === 'number' ? item.price : (DEFAULT_PRICES[serviceType] ?? null), updatedAt: item?.updatedAt }; }) }); } ],
  'GET /api/agent/pricing': [ requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => { const saved = await db.list('service_pricing', { limit: 100 }); return json({ pricing: SERVICE_TYPES.map(serviceType => { const item = saved.items.find(row => row.serviceType === serviceType); return { serviceType, price: typeof item?.price === 'number' ? item.price : (DEFAULT_PRICES[serviceType] ?? null), updatedAt: item?.updatedAt }; }) }); } ],
  'POST /api/agent/pricing': [ requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async (ctx) => { const body = (ctx.body || {}) as { serviceType?: string; price?: number }; const serviceType = clean(body.serviceType, 60); const price = Number(body.price); if (!SERVICE_TYPES.includes(serviceType) || !Number.isFinite(price) || price < 0 || price > 1000000000) return error('Choose a supported service and enter a valid non-negative price.', 400); const saved = await db.list('service_pricing', { limit: 100 }); const existing = saved.items.find(item => item.serviceType === serviceType); const now = new Date().toISOString(); if (existing?.id) { const [updated] = await db.update('service_pricing', [{ id: String(existing.id), record: { ...existing, serviceType, price, updatedAt: now, updatedBy: ctx.user!.email || 'Super Agent' } }]); if (!updated) return error('Pricing update did not save. Retry.', 409); } else { const [id] = await db.add('service_pricing', [{ serviceType, price, updatedAt: now, updatedBy: ctx.user!.email || 'Super Agent' }]); if (!id) return error('Pricing could not be saved. Retry.', 503); } return json({ pricing: { serviceType, price, updatedAt: now } }); } ],
  'GET /api/agent/vpn-requests': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const result = await db.list('vpn_requests', { limit: 100 });
      return json({ requests: result.items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }
  ],
  'PUT /api/agent/vpn-requests/:id': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body || {}) as { status?: string; agentNote?: string };
      const status = clean(body.status, 40);
      const agentNote = clean(body.agentNote, 1500);
      if (!ALLOWED_STATUSES.includes(status)) return error('Invalid request status.', 400);
      const [existing] = await db.get<Record<string, unknown>>('vpn_requests', [ctx.params.id], { consistent: true });
      if (!existing) return error('Service request not found.', 404);
      const now = new Date().toISOString();
      const history = Array.isArray(existing.history) ? existing.history : [];
      const updated = { ...existing, status, agentNote, updatedAt: now,
        history: [...history, { status, note: agentNote || 'Status updated by Super Agent.', actor: ctx.user!.email || 'Super Agent', at: now }].slice(-50) };
      const [saved] = await db.update('vpn_requests', [{ id: ctx.params.id, record: updated }]);
      if (!saved) return error('Update did not save. Refresh the queue and try again.', 409);
      return json({ request: { ...updated, id: ctx.params.id } });
    }
  ]
});
