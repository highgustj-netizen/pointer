import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { publicId } = await req.json();
    if (!publicId) return new Response('missing publicId', { status: 400, headers: CORS });

    const apiKey    = Deno.env.get('CLOUDINARY_API_KEY')!;
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')!;
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')!;

    const timestamp = Math.floor(Date.now() / 1000);
    const strToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const hashBuf   = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(strToSign));
    const signature = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const fd = new FormData();
    fd.append('public_id', publicId);
    fd.append('timestamp',  String(timestamp));
    fd.append('api_key',    apiKey);
    fd.append('signature',  signature);

    const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST', body: fd,
    });
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: CORS });
  }
});
