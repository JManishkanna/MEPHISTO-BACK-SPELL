import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { contactDetails } from '../../db/schema.js';
import '../../supabase-config.js';

export default async (request: Request) => {
  const headers = { 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!['GET', 'PUT'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, PUT' } });
  }
  try {
    if (request.method === 'GET') {
      const [details] = await db.select().from(contactDetails).where(eq(contactDetails.id, 1));
      return json(details || null);
    }

    // Verify the existing admin session with its trusted authentication service.
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Please sign in as an admin.' }, 401);
    const config = (globalThis as any).PORTFOLIO_SUPABASE_CONFIG;
    const permission = await fetch(`${config.url}/rest/v1/rpc/is_portfolio_admin`, {
      method: 'POST',
      headers: { authorization, apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!permission.ok || await permission.json() !== true) {
      return json({ error: 'Admin access is required.' }, 403);
    }
    let input;
    try { input = await request.json(); }
    catch { return json({ error: 'Invalid contact details.' }, 400); }
    const email = typeof input?.email === 'string' ? input.email.trim() : '';
    const phone = typeof input?.phone === 'string' ? input.phone.trim() : '';
    const location = typeof input?.location === 'string' ? input.location.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || !/^[+\d() .-]{5,40}$/.test(phone) || !/\d/.test(phone)
      || !location || location.length > 160) {
      return json({ error: 'Enter a valid email, phone number, and location (up to 160 characters).' }, 400);
    }
    const [saved] = await db.insert(contactDetails).values({ id: 1, email, phone, location })
      .onConflictDoUpdate({ target: contactDetails.id, set: { email, phone, location } }).returning();
    return json(saved);
  } catch {
    return json({ error: 'Contact details are unavailable. Please try again.' }, 503);
  }
};

export const config = { path: '/api/contact-details' };
