export default async (req, context) => {
  const url = new URL(req.url);
  const shop = url.searchParams.get('shop');
  const code = url.searchParams.get('code');

  const SHOPIFY_API_KEY = Netlify.env.get('SHOPIFY_API_KEY');
  const SHOPIFY_API_SECRET = Netlify.env.get('SHOPIFY_API_SECRET');
  const APP_URL = 'https://shopmind-ai-agent.netlify.app';

  if (!shop) {
    return Response.redirect(APP_URL, 302);
  }

  if (!code) {
    const scopes = 'read_products,read_orders,read_customers';
    const redirectUri = `${APP_URL}/auth/callback`;
    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_options[]=per-user`;
    return Response.redirect(installUrl, 302);
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      })
    });

    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error('No token');

    return Response.redirect(
      `${APP_URL}?token=${encodeURIComponent(access_token)}&shop=${encodeURIComponent(shop)}`,
      302
    );
  } catch (err) {
    return Response.redirect(`${APP_URL}?error=failed`, 302);
  }
};

export const config = {
  path: '/auth/callback'
};
