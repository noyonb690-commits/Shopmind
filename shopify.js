export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ANTHROPIC_API_KEY = Netlify.env.get('ANTHROPIC_API_KEY');

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { shop, token, action, message, history, storeContext } = body;

  if (!shop || !token) {
    return new Response(JSON.stringify({ error: 'Missing shop or token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ── SHOPIFY FETCH HELPER ──
  async function shopifyFetch(endpoint) {
    const res = await fetch(`https://${shop}/admin/api/2024-01${endpoint}`, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
    return res.json();
  }

  // ── GET STORE DATA ──
  if (action === 'getStoreData') {
    try {
      const [shopData, products, orders, customers] = await Promise.allSettled([
        shopifyFetch('/shop.json'),
        shopifyFetch('/products.json?limit=10&fields=id,title,status,product_type,variants'),
        shopifyFetch('/orders.json?limit=250&status=any&fields=id,total_price,created_at,financial_status'),
        shopifyFetch('/customers/count.json')
      ]);

      const productList = products.status === 'fulfilled' ? products.value.products : [];
      const orderList = orders.status === 'fulfilled' ? orders.value.orders : [];
      const customersCount = customers.status === 'fulfilled' ? customers.value.count : 0;

      const totalRevenue = orderList
        .filter(o => o.financial_status === 'paid')
        .reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

      return new Response(JSON.stringify({
        shopInfo: shopData.status === 'fulfilled' ? shopData.value.shop : {},
        products: productList,
        productsCount: productList.length,
        ordersCount: orderList.length,
        totalRevenue: totalRevenue.toFixed(2),
        customersCount,
        recentOrders: orderList.slice(0, 5)
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Store data error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // ── AI CHAT ──
  if (action === 'chat') {
    try {
      // Build store context summary
      const ctx = storeContext || {};
      const systemPrompt = `You are ShopMind AI, an expert Shopify store assistant. You help merchants understand their store data, optimize their business, and answer questions about e-commerce.

CURRENT STORE DATA:
- Shop: ${shop}
- Products: ${ctx.productsCount || 0} total
- Orders: ${ctx.ordersCount || 0} total
- Revenue: $${ctx.totalRevenue || 0}
- Customers: ${ctx.customersCount || 0}
- Recent products: ${ctx.products ? ctx.products.slice(0, 5).map(p => p.title).join(', ') : 'None'}

Be helpful, concise, and specific. Use the store data above when relevant. Give actionable advice. Keep responses under 150 words unless detail is needed.`;

      const messages = [
        ...(history || []).slice(-8),
        { role: 'user', content: message }
      ];

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          system: systemPrompt,
          messages
        })
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error('Anthropic error:', errText);
        throw new Error('AI service error');
      }

      const aiData = await aiRes.json();
      const reply = aiData.content?.[0]?.text || 'I could not generate a response.';

      return new Response(JSON.stringify({ reply }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Chat error:', err);
      return new Response(JSON.stringify({ reply: '⚠️ AI service temporarily unavailable. Please try again.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {
  path: '/api/shopify'
};
  
