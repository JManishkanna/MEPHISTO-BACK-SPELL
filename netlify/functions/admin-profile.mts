import { eq } from 'drizzle-orm';
import { getStore } from '@netlify/blobs';
import { db } from '../../db/index.js';
import { adminProfiles } from '../../db/schema.js';
import '../../supabase-config.js';

export default async (request: Request) => {
  const headers = { 'Cache-Control': 'private, no-store' };
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
  if (!['GET', 'PUT'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, PUT' } });
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Please sign in again.' }, 401);
    const settings = (globalThis as any).PORTFOLIO_SUPABASE_CONFIG;
    const authHeaders = { authorization, apikey: settings.anonKey, 'Content-Type': 'application/json' };
    const userResponse = await fetch(`${settings.url}/auth/v1/user`, { headers: authHeaders });
    if (!userResponse.ok) return json({ error: 'Please sign in again.' }, 401);
    const user = await userResponse.json();
    const permission = await fetch(`${settings.url}/rest/v1/rpc/is_portfolio_admin`, { method: 'POST', headers: authHeaders, body: '{}' });
    if (!user.id || !permission.ok || await permission.json() !== true) return json({ error: 'Admin access is required.' }, 403);
    const [previous] = await db.select().from(adminProfiles).where(eq(adminProfiles.userId, user.id));
    const store = getStore({ name: 'admin-profile-photos', consistency: 'strong' });
    if (request.method === 'GET') {
      if (new URL(request.url).searchParams.has('image')) {
        if (!previous?.imagePath) return new Response('Not found', { status: 404, headers });
        const image = await store.get(previous.imagePath, { type: 'arrayBuffer' });
        if (!image) return new Response('Not found', { status: 404, headers });
        const type = previous.imagePath.endsWith('.jpg') ? 'image/jpeg' : previous.imagePath.endsWith('.png') ? 'image/png' : 'image/webp';
        return new Response(image as ArrayBuffer, { headers: { ...headers, 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' } });
      }
      return json(previous ? { display_name: previous.displayName, profile_image_path: previous.imagePath } : null);
    }
    let form;
    try { form = await request.formData(); } catch { return json({ error: 'Invalid profile form.' }, 400); }
    const displayName = String(form.get('display_name') || '').trim();
    if (!displayName || displayName.length > 40) return json({ error: 'Enter a display name up to 40 characters.' }, 400);
    const file = form.get('profile_image');
    let bytes: ArrayBuffer | null = null;
    let extension = '';
    if (file instanceof File && file.size) {
      if (file.size > 2097152) return json({ error: 'Choose a photo up to 2 MB.' }, 400);
      bytes = await file.arrayBuffer();
      const b = new Uint8Array(bytes);
      if (file.type === 'image/jpeg' && b[0] === 255 && b[1] === 216 && b[2] === 255) extension = 'jpg';
      if (file.type === 'image/png' && [137,80,78,71,13,10,26,10].every((v, i) => b[i] === v)) extension = 'png';
      if (file.type === 'image/webp' && new TextDecoder().decode(b.slice(0,4)) === 'RIFF' && new TextDecoder().decode(b.slice(8,12)) === 'WEBP') extension = 'webp';
      if (!extension) return json({ error: 'Choose a valid JPEG, PNG, or WebP photo.' }, 400);
    }
    let imagePath = form.get('remove_photo') === 'true' ? null : previous?.imagePath || null;
    const newPath = bytes ? `${user.id}/${crypto.randomUUID()}.${extension}` : null;
    if (newPath && bytes) { await store.set(newPath, bytes); imagePath = newPath; }
    try {
      await db.insert(adminProfiles).values({ userId: user.id, displayName, imagePath })
        .onConflictDoUpdate({ target: adminProfiles.userId, set: { displayName, imagePath } });
    } catch (error) {
      if (newPath) await store.delete(newPath).catch(() => {});
      throw error;
    }
    if (previous?.imagePath && previous.imagePath !== imagePath) await store.delete(previous.imagePath).catch(() => {});
    return json({ display_name: displayName, profile_image_path: imagePath });
  } catch {
    return json({ error: 'Could not update the admin profile. Please try again.' }, 503);
  }
};

export const config = { path: '/api/admin-profile' };
