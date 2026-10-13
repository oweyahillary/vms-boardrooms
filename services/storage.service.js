const { createClient } = require('@supabase/supabase-js');

// Lazily create the Supabase client so a missing/blank config doesn't crash
// the whole server at boot — uploads just no-op and return null instead.
let supabase = null;
function client() {
  if (supabase) return supabase;
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  return supabase;
}

exports.uploadBase64 = async (base64, path) => {
  const sb = client();
  if (!sb) {
    console.warn('storage not configured — skipping upload', path);
    return null;
  }
  try {
    const buffer = Buffer.from(base64.split(',')[1], 'base64');
    const { error } = await sb.storage
      .from('visitor-files')
      .upload(path, buffer, { contentType: 'image/png' });
    if (error) throw error;
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/visitor-files/${path}`;
  } catch (e) {
    console.error('upload failed', e.message);
    return null;
  }
};
