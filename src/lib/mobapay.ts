interface IgnResult {
  success: boolean;
  name?: string;
  error?: string;
}

function findUserName(data: any): string | null {
  const preferredKeys = [
    'username', 'user_name', 'nick_name', 'nickname', 
    'player_name', 'role_name', 'game_user_name', 'name'
  ];

  const seen = new WeakSet<object>();

  function walk(node: any): string | null {
    if (!node || typeof node !== 'object') return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    for (const key of Object.keys(node)) {
      if (preferredKeys.includes(key.toLowerCase())) {
        const value = node[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    for (const value of Object.values(node)) {
      const found = walk(value);
      if (found) return found;
    }

    return null;
  }

  return walk(data);
}

export async function fetchIGN(gameId: string, serverId: string): Promise<IgnResult> {
  const url = 'https://api.mobapay.com/api/app_shop';
  
  const params = new URLSearchParams({
    app_id: '100000',
    game_user_key: gameId,
    game_server_key: serverId,
    country: 'PH',
    language: 'ph',
    network: '',
    net: '',
    coupon_id: '',
    shop_id: ''
  });

  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'x-lang': 'ph',
    'x-mm-version': '2.13.29.3',
    'x-request-start': Date.now().toString(),
    'x-token': '',
    'Referer': 'https://www.mobapay.com/'
  };

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const userName = findUserName(data);
    
    if (userName) {
      return { success: true, name: userName };
    } else {
      return { success: false, error: "Username not found in response" };
    }
    
  } catch (error: any) {
    console.error('Error fetching IGN:', error.message);
    return { success: false, error: error.message };
  }
}
