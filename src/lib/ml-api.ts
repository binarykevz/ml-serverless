import type { Env } from '../types';

const BASE_URL = 'https://sg-api.mobilelegends.com';

// Common Headers for SG-API
function getCommonHeaders(): Record<string, string> {
  return {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'origin': 'https://www.mobilelegends.com',
    'priority': 'u=1, i',
    'referer': 'https://www.mobilelegends.com/',
    'sec-ch-ua': '"Not=A?Brand";v="99", "Brave";v="151", "Chromium";v="151"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-gpc': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  };
}

/**
 * Step 1: Send Verification Code via SG-API
 */
export async function sgSendVc(roleId: string, zoneId: string): Promise<{ success: boolean; message: string; raw?: any }> {
  const url = `${BASE_URL}/base/sendVc`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getCommonHeaders(),
      body: new URLSearchParams({
        roleId,
        zoneId,
        language: 'en',
        // Some APIs require these extra params
        country: 'SG', 
        net: '',
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    
    // Typical response: { code: 0, msg: "Success", data: {...} }
    const code = data.code?.toString();
    const isSuccess = code === '0' || data.status === 'success';

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
 * NOTE: The 'validate' param in your curl seems to be a CAPTCHA/security token. 
 * If this fails, you may need to inspect Network tab in browser to see if 'validate' is mandatory.
 * For now, we send what we have. If 'validate' is required, you might need to hardcode a dummy 
 * or solve it dynamically (very hard in serverless).
 */
export async function sgLogin(roleId: string, zoneId: string, vc: string, validateStr?: string): Promise<{ success: boolean; token?: string; message: string }> {
  const url = `${BASE_URL}/base/login`;
  
  const bodyParams: Record<string, string> = {
    roleId,
    zoneId,
    vc,
    referer: '2669606_2669607', // From your curl
    type: 'web',
  };

  if (validateStr) {
    bodyParams.validate = validateStr;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getCommonHeaders(),
      body: new URLSearchParams(bodyParams).toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    
    // Response usually contains: { code: 0, data: { token: "..." } }
    if (data.code === 0 && data.data?.token) {
      return {
        success: true,
        token: data.data.token,
        message: 'Login Successful'
      };
    }

    return {
      success: false,
      message: data.msg || data.message || 'Login Failed',
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
    'content-length': '0',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: '', // Empty body as per curl
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();

    if (data.code === 0) {
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
