const axios = require('axios');

/**
 * Service for interacting with mail.tm API to create and manage temporary email addresses
 */
class EmailService {
  /**
   * Initialize email service with base URL and configuration
   * @param {Object} config - Configuration options
   * @param {string} config.baseUrl - Base URL for mail.tm API
   * @param {number} config.maxRetries - Maximum number of retry attempts
   * @param {number} config.retryDelay - Delay between retries in milliseconds
   */
  constructor(config = {}) {
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    
    this.client = axios.create({
      baseURL: 'https://api.mail.tm',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'TempEmailCLI/1.0'
      },
      timeout: 10000
    });
  }

  /**
   * Set the authentication token for API requests
   * @param {string} token - JWT token
   */
  setAuthToken(token) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear the authentication token
   */
  clearAuthToken() {
    delete this.client.defaults.headers.common['Authorization'];
  }

  /**
   * Helper method to implement retry logic for API calls
   * @param {Function} apiCall - The API call function to retry
   * @returns {Promise<any>} - Result of the API call
   */
  async withRetry(apiCall, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    const retryDelay = options.retryDelay || this.retryDelay;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Add exponential backoff for rate limiting
        const delay = error.response?.status === 429 
          ? retryDelay * Math.pow(2, attempt - 1)
          : retryDelay;
        
        console.log(`Attempt ${attempt} failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Create a new temporary email address
   * @param {string} password - Password for the account
   * @returns {Promise<Object>} - The created email account details
   */
  async createEmailAddress(password = 'Password123!') {
    try {
      // Get an available domain first
      const domain = await this.getAvailableDomain();
      if (!domain) {
        throw new Error('Failed to retrieve a valid email domain');
      }
      
      // Generate a random username (12-16 chars, lowercase only)
      const length = Math.floor(Math.random() * 5) + 12;
      const username = Array(length)
        .fill()
        .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
        .join('');
      
      const address = `${username}@${domain}`;
      console.log(`DEBUG: Generated email address: ${address}`);
      
      return await this.withRetry(async () => {
        // Wait before making request to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create account with proper headers
        const accountResponse = await this.client.post('/accounts', {
          address,
          password
        }, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br'
          }
        });
        
        if (!accountResponse.data || !accountResponse.data.id) {
          throw new Error('Invalid account creation response');
        }
        
        // Wait before token request
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get token with proper headers
        const tokenResponse = await this.client.post('/token', {
          address,
          password
        }, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br'
          }
        });
        
        if (!tokenResponse.data || !tokenResponse.data.token) {
          throw new Error('Invalid token response');
        }
        
        return {
          id: accountResponse.data.id,
          address: accountResponse.data.address,
          token: tokenResponse.data.token,
          password
        };
      }, {
        retryDelay: 3000,
        maxRetries: 5
      });
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 422) {
          throw new Error('Invalid email address format or domain. Please try again with a different address format.');
        } else if (status === 429) {
          throw new Error('Rate limit exceeded. The service is temporarily unavailable. Please try again after a few minutes.');
        } else if (status === 400) {
          throw new Error('Bad request: Email provider rejected the request. Check your input parameters.');
        } else if (status === 403) {
          throw new Error('Access forbidden: Your IP might be blocked by the email provider.');
        } else if (status === 500) {
          throw new Error('Email provider server error. Please try again later.');
        }
      }
      throw new Error(`Failed to create email address: ${error.message}. Please check your internet connection and try again.`);
    }
  }

  /**
   * Get available domain from mail.tm
   * @returns {Promise<string>} - Available domain
   */
  async getAvailableDomain() {
    try {
      return await this.withRetry(async () => {
        const response = await this.client.get('/domains');
        console.log('DEBUG: Raw domains response:', JSON.stringify(response.data, null, 2));
        
        // Handle direct array response
        if (Array.isArray(response.data) && response.data.length > 0) {
          const domainObj = response.data[0];
          if (domainObj && domainObj.domain) {
            console.log(`Using available domain: ${domainObj.domain}`);
            return domainObj.domain;
          }
        }
        
        throw new Error('No valid domains found in the response');
      });
    } catch (error) {
      console.warn('Failed to fetch domains:', error.message);
      throw new Error(`Unable to retrieve available email domains: ${error.message}`);
    }
  }

  /**
   * Get authentication token using email and password
   * @param {string} address - Email address
   * @param {string} password - Password
   * @returns {Promise<string>} - Authentication token
   */
  async getAuthToken(address, password) {
    try {
      return await this.withRetry(async () => {
        const response = await this.client.post('/token', {
          address,
          password
        }, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        return response.data.token;
      });
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Get emails for a specific address
   * @param {string} address - Email address
   * @param {string} password - Account password
   * @returns {Promise<Array>} - List of emails
   */
  async getEmails(address, password) {
    try {
      // First authenticate to get token
      const authResponse = await this.client.post('/token', {
        address,
        password
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      this.setAuthToken(authResponse.data.token);
      
      // Get messages
      const response = await this.client.get('/messages', {
        params: {
          'page': 1,
          'limit': 20
        }
      });
      
      this.clearAuthToken();
      
      if (response.data && Array.isArray(response.data['hydra:member'])) {
        return response.data['hydra:member'].map(msg => ({
          id: msg.id,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          intro: msg.intro,
          hasAttachments: msg.hasAttachments,
          receivedDate: msg.createdAt
        }));
      }
      
      return [];
    } catch (error) {
      this.clearAuthToken();
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }
  }

  /**
   * Get full email content
   * @param {string} messageId - ID of the message to fetch
   * @param {string} address - Email address
   * @param {string} password - Account password
   * @returns {Promise<Object>} - Email content
   */
  async getEmailContent(messageId, address, password) {
    try {
      // First authenticate to get token
      const authResponse = await this.client.post('/token', {
        address,
        password
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      this.setAuthToken(authResponse.data.token);
      
      // Get full message content
      const response = await this.client.get(`/messages/${messageId}`);
      
      this.clearAuthToken();
      
      if (!response.data) {
        throw new Error('Invalid response from server');
      }
      
      return {
        id: response.data.id,
        from: response.data.from,
        to: response.data.to,
        subject: response.data.subject,
        text: response.data.text,
        html: response.data.html,
        attachments: response.data.attachments,
        receivedDate: response.data.createdAt
      };
    } catch (error) {
      this.clearAuthToken();
      throw new Error(`Failed to fetch email content: ${error.message}`);
    }
  }

  /**
   * Delete an email by ID
   * @param {string} emailId - ID of the email to delete
   * @param {string} token - Authentication token
   * @returns {Promise<boolean>} - Success status
   */
  async deleteEmail(emailId, token) {
    try {
      if (!emailId || !token) {
        throw new Error('Email ID and token are required');
      }
      
      return await this.withRetry(async () => {
        await this.client.delete(`/messages/${emailId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        return true;
      });
    } catch (error) {
      throw new Error(`Failed to delete email: ${error.message}`);
    }
  }

  /**
   * Delete an account by ID
   * @param {string} accountId - ID of the account to delete
   * @param {string} token - Authentication token
   * @returns {Promise<boolean>} - Success status
   */
  async deleteAccount(accountId, token) {
    try {
      if (!accountId || !token) {
        throw new Error('Account ID and token are required');
      }
      
      return await this.withRetry(async () => {
        await this.client.delete(`/accounts/${accountId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        return true;
      });
    } catch (error) {
      throw new Error(`Failed to delete account: ${error.message}`);
    }
  }
}

module.exports = EmailService;

