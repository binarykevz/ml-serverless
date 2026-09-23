import type { Env } from '../types';

const BASE_URL = 'https://sg-api.mobilelegends.com';

// Common Headers for SG-API (Mimicking Brave Browser on Windows)
function getCommonHeaders(): Record<string, string> {
  return {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', // CRITICAL: Must be form-urlencoded
    'origin': 'https://www.mobilelegends.com',
    'priority': 'u=1, i',
    'referer': 'https://www.mobilelegends.com/',
    'sec-ch-ua': '"Brave";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-gpc': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  };
}

/**
 * Step 1: Send Verification Code via SG-API
 */
export async function sgSendVc(roleId: string, zoneId: string): Promise<{ success: boolean; message: string; raw?: any }> {
  const url = `${BASE_URL}/base/sendVc`;
  
  try {
    const body = new URLSearchParams({
      roleId,
      zoneId,
      language: 'en',
      country: 'SG', // Adjust based on region if needed
      net: '',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: getCommonHeaders(),
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    
    // Check for success code (usually 0 or 200 depending on API version)
    const isSuccess = data.code === 0 || data.status === 'success' || data.code === '0';

    return {
      success: isSuccess,
      message: data.msg || data.message || (isSuccess ? 'VC Sent' : 'Failed'),
      raw: data
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    };
  }
}

/**
 * Step 2: Login to get JWT Token
 * NOTE: This function attempts login WITHOUT validate token first. 
 * If it fails, you may need to manually capture the 'validate' string from browser DevTools 
 * and pass it here, or integrate a CAPTCHA solver.
 */
export async function sgLogin(roleId: string, zoneId: string, vc: string, validateStr?: string): Promise<{ success: boolean; token?: string; message: string }> {
  const url = `${BASE_URL}/base/login`;
  
  // Build body parameters
  const params: Record<string, string> = {
    roleId,
    zoneId,
    vc,
    referer: '2669606_2669607', // Hardcoded from your curl example
    type: 'web',
  };

  // Only include validate if provided (some APIs reject empty strings)
  if (validateStr && validateStr.trim() !== '') {
    params.validate = validateStr;
  }

  const body = new URLSearchParams(params);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getCommonHeaders(),
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    
    // Debug: Log the full response if it fails
    if (data.code !== 0 && data.code !== '0') {
        console.error('ML Login API Error Response:', JSON.stringify(data));
    }

    // Success condition: code is 0 AND token exists in data
    if ((data.code === 0 || data.code === '0') && data.data?.token) {
      return {
        success: true,
        token: data.data.token,
        message: 'Login Successful'
      };
    }

    // Specific error handling for missing validate
    let errorMsg = data.msg || data.message || 'Login Failed';
    if (errorMsg.includes('validate') || errorMsg.includes('captcha')) {
        errorMsg += " (Hint: Missing or invalid CAPTCHA token. Try capturing 'validate' from browser network tab.)";
    }

    return {
      success: false,
      message: errorMsg,
    };

  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    };
  }
}

/**
 * Step 3: Get Base Info using Token
 */
export async function sgGetBaseInfo(token: string): Promise<{ success: boolean; data?: any; message: string }> {
  const url = `${BASE_URL}/base/getBaseInfo`;
  
  const headers = {
    ...getCommonHeaders(),
    'authorization': token,
    'x-token': token,
    'x-actid': '2669607',
    'x-appid': '2669606',
    'x-lang': 'en',
    'content-length': '0', // Important for POST with no body
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: '', // Empty body
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();

    if (data.code === 0 || data.code === '0') {
      return {
        success: true,
        data: data.data,
        message: 'Info Retrieved'
      };
    }

    return {
      success: false,
      message: data.msg || data.message || 'Failed to get info',
    };

  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    };
  }
}
