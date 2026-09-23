import type { IgnResult } from '../types';

/**
 * Fetches IGN using the Mobapay App Shop API.
 * Specifically targets data.user_info.user_name for reliability.
 */
export async function fetchIGN(gameId: string, serverId: string): Promise<IgnResult> {
  const baseUrl = 'https://api.mobapay.com/api/app_shop';
  
  // Construct URL exactly as per your curl command
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

  const url = `${baseUrl}?${params.toString()}`;

  // Exact headers from your provided curl command
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

    const rawData = await response.json();

    // 1. Check for API-level errors first (e.g., invalid ID)
    if (rawData.code && rawData.code !== 0 && rawData.code !== "0") {
       return { 
         success: false, 
         error: `API Error (${rawData.code}): ${rawData.msg || 'Unknown error'}` 
       };
    }

    // 2. Directly parse the expected structure: data.user_info.user_name
    let userName: string | null = null;
    
    // Safety check to ensure nested objects exist before accessing properties
    if (rawData.data && 
        rawData.data.user_info && 
        typeof rawData.data.user_info === 'object') {
      
      const userInfo = rawData.data.user_info;
      
      // Prioritize user_name as requested
      if (userInfo.user_name && typeof userInfo.user_name === 'string') {
        userName = userInfo.user_name.trim();
      } 
      // Fallback just in case key varies slightly (optional but recommended)
      else if (userInfo.username && typeof userInfo.username === 'string') {
        userName = userInfo.username.trim();
      }
    }

    if (userName) {
      return { success: true, name: userName };
    } else {
      // Detailed error message showing what WAS found, helping you debug if structure changes
      const hasData = !!rawData.data;
      const hasUserInfo = !!(rawData.data && rawData.data.user_info);
      const userInfoKeys = hasUserInfo ? Object.keys(rawData.data.user_info).join(', ') : 'none';
      
      return { 
        success: false, 
        error: `Username not found at data.user_info.user_name. Has Data: ${hasData}, Has User Info: ${hasUserInfo}. Keys found: [${userInfoKeys}]` 
      };
    }
    
  } catch (error: any) {
    console.error('Error fetching IGN from Mobapay:', error.message);
    return { success: false, error: error.message };
  }
}
