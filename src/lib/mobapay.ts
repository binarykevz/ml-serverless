import type { IgnResult } from '../types'; // Assuming you have this type, otherwise define it locally

/**
 * Fetches IGN using the Mobapay App Card API.
 * This endpoint is more reliable for retrieving user-specific data like IGN.
 */
export async function fetchIGN(gameId: string, serverId: string): Promise<IgnResult> {
  const baseUrl = 'https://api.mobapay.com/api/app_card';
  
  const params = new URLSearchParams({
    app_id: '100000',
    country: 'PH',
    language: 'ph',
    game_user_key: gameId,
    game_server_key: serverId,
  });

  const url = `${baseUrl}?${params.toString()}`;

  // Critical Headers mimicking a modern Brave/Chrome browser on Windows
  const headers: Record<string, string> = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.6',
    'origin': 'https://www.mobapay.com',
    'priority': 'u=1, i',
    'referer': 'https://www.mobapay.com/',
    'sec-ch-ua': '"Brave";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-gpc': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    'x-lang': 'ph',
    'x-mm-version': '2.13.39',
    'x-request-start': Date.now().toString(),
    // Note: x-token is usually empty for public lookups, but included as per curl
    'x-token': '', 
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Debug log to see structure if parsing fails (remove in production)
    // console.log('Mobapay Response Structure:', JSON.stringify(data, null, 2));

    const userName = extractUserName(data);
    
    if (userName) {
      return { success: true, name: userName };
    } else {
      return { success: false, error: "Username not found in API response" };
    }
    
  } catch (error: any) {
    console.error('Error fetching IGN from Mobapay:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Recursively searches the JSON object for common username keys.
 * Mobapay structures can vary, so we check multiple known fields.
 */
function extractUserName(data: any): string | null {
  const preferredKeys = [
    'username', 
    'user_name', 
    'nick_name', 
    'nickname', 
    'player_name', 
    'role_name', 
    'game_user_name', 
    'name',
    'account_name'
  ];

  const seen = new WeakSet<object>();

  function walk(node: any): string | null {
    if (!node || typeof node !== 'object') return null;
    if (seen.has(node)) return null;
    seen.add(node);

    // If array, iterate through items
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    // Check direct properties first for performance
    for (const key of Object.keys(node)) {
      if (preferredKeys.includes(key.toLowerCase())) {
        const value = node[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    // Then recurse into nested objects
    for (const value of Object.values(node)) {
      const found = walk(value);
      if (found) return found;
    }

    return null;
  }

  return walk(data);
}
