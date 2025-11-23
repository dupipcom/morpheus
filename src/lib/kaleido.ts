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

const getKaleidoNftBase = (): string => {
  const base = process.env.KALEIDO_NFT_BASE;
  if (!base) {
    throw new Error('KALEIDO_NFT_BASE environment variable is required');
  }
  return base;
};

const getNftKrnAddress = (): string => {
  const address = process.env.SYMBOL_NFT_MINT_ADDRESS;
  if (!address) {
    throw new Error('SYMBOL_NFT_MINT_ADDRESS environment variable is required');
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
    'x-kaleido-sync': 'true',
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
    'x-kaleido-sync': 'true',
  };
};

/**
 * Get authentication headers for Kaleido NFT Gateway API
 * Uses Base64 encoded KALEIDO_NFT_API_KEY:KALEIDO_NFT_API_SECRET
 */
const getNftAuthHeaders = () => {
  const apiKey = process.env.KALEIDO_NFT_API_KEY;
  const apiSecret = process.env.KALEIDO_NFT_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    throw new Error('KALEIDO_NFT_API_KEY and KALEIDO_NFT_API_SECRET environment variables are required for NFT operations');
  }
  
  // Create Base64 encoded credentials
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
    'x-kaleido-sync': 'true',
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
export const getBalance = async (address: string): Promise<number> => {
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
    return balanceEther;
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
    const transferUrl = `${gatewayBase}/${contractAddress}/transfer?kld-from=${fromAddress}`;
    
    // Kaleido API might expect different field names - adjust based on actual API
    const requestBody = {
      recipient: toAddress,
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
    if (data.status == 1) {
      return "true";
    } else {
      throw new Error(`Invalid transfer response: missing sent. Response: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Error transferring tokens:', error);
    throw error;
  }
};

/**
 * Generate an NFT (mint to an address)
 * Uses Kaleido smart contract gateway API for NFT minting
 */
export const generateNFT = async (
  toAddress: string
): Promise<string> => {
  try {
    const nftBase = getKaleidoNftBase();
    const contractAddress = getNftKrnAddress();
    
    // Generate a unique tokenId (using timestamp + random number for uniqueness)
    const tokenId = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
    
    // Format tokenURI as specified: https://www.dupip.com?nft=${tokenId}
    const tokenURI = `https://www.dupip.com?nft=${tokenId}`;
    
    // Get minting account address if available (optional)
    // This is the account that will sign the mint transaction
    const mintFromAddress = process.env.SYMBOL_NFT_SIGNER;
    
    // Kaleido NFT mint endpoint: /{address}/mintWithTokenURI
    let mintUrl = `${nftBase}/${contractAddress}/mintWithTokenURI`;
    
    // Add kld-from parameter if minting account is specified (similar to transfer function)
    if (mintFromAddress) {
      mintUrl += `?kld-from=${mintFromAddress}`;
    }
    
    // Kaleido API expects only these fields: to, tokenId, tokenURI
    const requestBody = {
      to: toAddress,
      tokenId: tokenId,
      tokenURI: tokenURI,
    };
    
    const response = await fetch(mintUrl, {
      method: 'POST',
      headers: getNftAuthHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to mint NFT: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Return transaction hash - adjust based on actual API response format
    if (data.sent) {
      return data.sent;
    } else if (data.transactionHash) {
      return data.transactionHash;
    } else if (data.hash) {
      return data.hash;
    } else {
      throw new Error(`Invalid mint response: missing transaction hash. Response: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
};

/**
 * Get NFTs owned by an address
 * Uses Kaleido smart contract gateway API for NFT queries
 */
export interface NFT {
  tokenId: string;
  tokenURI: string;
}

export const getNFTs = async (address: string): Promise<NFT[]> => {
  try {
    const nftBase = getKaleidoNftBase();
    const contractAddress = getNftKrnAddress();
    
    // First, get the balance (number of NFTs owned)
    const balanceUrl = `${nftBase}/${contractAddress}/balanceOf?owner=${encodeURIComponent(address)}`;
    
    const balanceResponse = await fetch(balanceUrl, {
      method: 'GET',
      headers: getNftAuthHeaders(),
    });

    if (!balanceResponse.ok) {
      const errorText = await balanceResponse.text();
      throw new Error(`Failed to get NFT balance: ${balanceResponse.status} ${errorText}`);
    }

    const balanceData = await balanceResponse.json();
    
    // Parse balance - similar to token balance parsing
    let balanceValue: string | number;
    if (balanceData.output !== undefined) {
      balanceValue = balanceData.output;
    } else {
      throw new Error(`Invalid NFT balance response format: ${JSON.stringify(balanceData)}`);
    }

    // Convert balance to number
    let balance: number;
    if (typeof balanceValue === 'string') {
      if (balanceValue.startsWith('0x')) {
        balance = Number(BigInt(balanceValue));
      } else {
        balance = parseInt(balanceValue, 10);
      }
    } else {
      balance = Math.floor(balanceValue);
    }

    if (balance === 0) {
      return [];
    }

    // Get all token IDs owned by this address
    const nfts: NFT[] = [];
    
    for (let i = 0; i < balance; i++) {
      try {
        // Get token ID at index i using tokenOfOwnerByIndex
        const tokenIdUrl = `${nftBase}/${contractAddress}/tokenOfOwnerByIndex?owner=${encodeURIComponent(address)}&index=${i}`;
        
        const tokenIdResponse = await fetch(tokenIdUrl, {
          method: 'GET',
          headers: getNftAuthHeaders(),
        });

        if (!tokenIdResponse.ok) {
          console.error(`Failed to get token ID at index ${i}:`, await tokenIdResponse.text());
          continue;
        }

        const tokenIdData = await tokenIdResponse.json();
        let tokenId: string;
        
        if (tokenIdData.output !== undefined) {
          const tokenIdValue = tokenIdData.output;
          if (typeof tokenIdValue === 'string') {
            if (tokenIdValue.startsWith('0x')) {
              tokenId = BigInt(tokenIdValue).toString();
            } else {
              tokenId = tokenIdValue;
            }
          } else {
            tokenId = String(tokenIdValue);
          }
        } else {
          console.error(`Invalid token ID response at index ${i}:`, tokenIdData);
          continue;
        }

        // Get token URI for this token ID
        let tokenURI = '';
        try {
          const tokenUriUrl = `${nftBase}/${contractAddress}/tokenURI?tokenId=${encodeURIComponent(tokenId)}`;
          
          const tokenUriResponse = await fetch(tokenUriUrl, {
            method: 'GET',
            headers: getNftAuthHeaders(),
          });

          if (tokenUriResponse.ok) {
            const tokenUriData = await tokenUriResponse.json();
            if (tokenUriData.output !== undefined) {
              tokenURI = String(tokenUriData.output);
            }
          }
        } catch (error) {
          console.error(`Failed to get token URI for token ${tokenId}:`, error);
          // Continue without token URI
        }

        nfts.push({
          tokenId,
          tokenURI,
        });
      } catch (error) {
        console.error(`Error fetching NFT at index ${i}:`, error);
        // Continue to next NFT
      }
    }

    return nfts;
  } catch (error) {
    console.error('Error getting NFTs:', error);
    throw error;
  }
};
