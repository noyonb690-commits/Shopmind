export default async (req, context) => {
  const url = new URL(req.url);
  const shop = url.searchParams.get('shop');
  const code = url.searchParams.get('code');

  const SHOPIFY_API_KEY = Netlify.env.get('SHOPIFY_API_KEY');
  const SHOPIFY_API_SECRET = Netlify.env.get('SHOPIFY_API_SECRET');
  const APP_URL = Netlify.env.get('SHOPIFY_APP_URL') || 'https://shopmind-ai-agent.netlify.app';

  // Step 1: No shop param — redirect to landing
  if (!shop) {
    return Response.redirect(APP_URL, 302);
  }

  // Step 2: No code yet — start OAuth
  if (!code) {
    const scopes = 'read_products,read_orders,read_customers,read_analytics';
    const redirectUri = `${APP_URL}/auth/callback`;
    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return Response.redirect(installUrl, 302);
  }

  // Step 3: Exchange code for token
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

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token exchange failed:', err);
      return Response.redirect(`${APP_URL}?error=token_failed`, 302);
    }

    const { access_token } = await tokenRes.json();

    // Redirect back to app with token
    const successUrl = `${APP_URL}?token=${encodeURIComponent(access_token)}&shop=${encodeURIComponent(shop)}`;
    return Response.redirect(successUrl, 302);

  } catch (err) {
    console.error('OAuth error:', err);
    return Response.redirect(`${APP_URL}?error=oauth_error`, 302);
  }
};

export const config = {
  path: '/auth/callback'
};
