import "server-only";

/**
 * Kaleido.io blockchain service
 * Handles wallet creation, balance queries, token transfers using direct Kaleido API
 */

// Kaleido API Configuration
const getKaleidoAccountsApi = (): string => {
  const api = process.env.KALEIDO_ACCOUNTS_API;
  if (!api) {
    throw new Error('KALEIDO_ACCOUNTS_API environment variable is required');
  }
  return api;
};

const getKaleidoGatewayBase = (): string => {
  const base = process.env.KALEIDO_GATEWAY_BASE;
  if (!base) {
    throw new Error('KALEIDO_GATEWAY_BASE environment variable is required');
  }
  return base;
};

const getDpipContractAddress = (): string => {
  const address = process.env.SYMBOL_DPIP_ADDRESS;
  if (!address) {
    throw new Error('SYMBOL_DPIP_ADDRESS environment variable is required');
  }
  return address;
};

/**
 * Get authentication headers for Kaleido Root API (account creation)
 */
const getRootAuthHeaders = () => {
  const apiKey = process.env.KALEIDO_ROOT_API_KEY;
  if (!apiKey) {
    throw new Error('KALEIDO_ROOT_API_KEY environment variable is required');
  }
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
};

/**
 * Get authentication headers for Kaleido Gateway API (balance, transfers)
 * Uses Base64 encoded KALEIDO_API_KEY:KALEIDO_API_SECRET
 */
const getGatewayAuthHeaders = () => {
  const apiKey = process.env.KALEIDO_API_KEY;
  const apiSecret = process.env.KALEIDO_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    throw new Error('KALEIDO_API_KEY and KALEIDO_API_SECRET environment variables are required for gateway operations');
  }
  
  // Create Base64 encoded credentials
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
};

/**
 * Create a new account (wallet) on Kaleido
 * Returns the account address and private key
 */
export const generateWallet = async (): Promise<{
  address: string;
}> => {
  try {
    const accountsApi = getKaleidoAccountsApi();
    const response = await fetch(accountsApi, {
      method: 'POST',
      headers: getRootAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create account: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    console.log('Kaleido account data:', data);
    
    // Kaleido API returns account data in format:
    // { address: "0x...", privateKey: "0x..." } or similar
    // Adjust based on actual API response format
    if (!data.address) {
      throw new Error('Invalid response from Kaleido API: missing address or privateKey');
    }

    return {
      address: data.address
    };
  } catch (error) {
    console.error('Error creating Kaleido account:', error);
    throw error;
  }
};

/**
 * Get token balance for an address
 * Uses Kaleido smart contract gateway API
 */
export const getBalance = async (address: string): Promise<string> => {
  try {
    const gatewayBase = getKaleidoGatewayBase();
    const contractAddress = getDpipContractAddress();
    // Kaleido balance endpoint format
    const balanceUrl = `${gatewayBase}/${contractAddress}/balanceOf?account=${encodeURIComponent(address)}`;
    
    const response = await fetch(balanceUrl, {
      method: 'GET',
      headers: getGatewayAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get balance: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Kaleido API returns balance - adjust based on actual response format
    // It might be in wei (hex string) or already formatted
    // Common formats: { balance: "0x..." }, { result: "..." }, or direct value
    let balanceValue: string | number;
    
    if (data.output !== undefined) {
      balanceValue = data.output;
    } else {
      throw new Error(`Invalid balance response format: ${JSON.stringify(data)}`);
    }

    // Convert from hex/wei to decimal string (assuming 18 decimals)
    let balanceWei: bigint;
    
    if (typeof balanceValue === 'string') {
      if (balanceValue.startsWith('0x')) {
        // Hex string
        balanceWei = BigInt(balanceValue);
      } else {
        // Decimal string (already in wei)
        balanceWei = BigInt(balanceValue);
      }
    } else {
      // Number (assume already in wei)
      balanceWei = BigInt(Math.floor(balanceValue));
    }

    // Convert from wei to ether (18 decimals)
    const balanceEther = Number(balanceWei) / 1e18;
    return balanceEther.toString();
  } catch (error) {
    console.error('Error getting balance:', error);
    throw error;
  }
};

/**
 * Transfer tokens from one address to another
 * Uses Kaleido smart contract gateway API
 */
export const sendTokens = async (
  fromAddress: string,
  toAddress: string,
  amount: string
): Promise<string> => {
  try {
    const gatewayBase = getKaleidoGatewayBase();
    const contractAddress = getDpipContractAddress();
    // Convert amount from ether to wei (assuming 18 decimals)
    const amountWei = BigInt(Math.floor(parseFloat(amount) * 1e18)).toString();
    
    // Kaleido transfer endpoint
    const transferUrl = `${gatewayBase}/${contractAddress}/transfer`;
    
    // Kaleido API might expect different field names - adjust based on actual API
    const requestBody = {
      from: fromAddress,
      to: toAddress,
      amount: amountWei,
      // Alternative field names the API might expect:
      // value: amountWei,
      // recipient: toAddress,
      // sender: fromAddress,
    };
    
    const response = await fetch(transferUrl, {
      method: 'POST',
      headers: getGatewayAuthHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to transfer tokens: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Return transaction hash - adjust based on actual API response format
    if (data.txHash) {
      return data.txHash;
    } else if (data.transactionHash) {
      return data.transactionHash;
    } else if (data.hash) {
      return data.hash;
    } else if (data.result) {
      return data.result;
    } else if (data.txid) {
      return data.txid;
    } else {
      throw new Error(`Invalid transfer response: missing transaction hash. Response: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Error transferring tokens:', error);
    throw error;
  }
};

/**
 * Generate an NFT (mint to an address)
 * This is a placeholder - implement based on your NFT contract API
 */
export const generateNFT = async (
  toAddress: string,
  tokenUri?: string
): Promise<string> => {
  // Placeholder for NFT generation
  // You'll need to implement this based on your NFT contract's API
  throw new Error('NFT generation not yet implemented - requires NFT contract API integration');
};
