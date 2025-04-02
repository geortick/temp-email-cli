const fs = require('fs').promises;
const path = require('path');
const os = require('os');
/**
 * Service to manage email addresses with persistence and expiration handling
 */
class StorageService {
  /**
   * Initialize the storage service
   * @param {string} storageFile - Path to the storage file (default: addresses.json)
   * @param {number} expirationDays - Number of days before an address expires (default: 7)
   */
  constructor(storageFile, expirationDays = 7) {
    // Use XDG_CONFIG_HOME if available, otherwise use user's home directory
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const defaultDir = path.join(configDir, 'temp-email-cli');
    const defaultFile = path.join(defaultDir, 'addresses.json');
    
    this.storageFile = storageFile ? path.resolve(storageFile) : defaultFile;
    this.storageDir = path.dirname(this.storageFile);
    this.expirationDays = expirationDays;
    this.initialized = false;
  }

  /**
   * Initialize the storage file if it doesn't exist
   * @private
   */
  async _initialize() {
    try {
      // Ensure the directory exists
      try {
        await fs.access(this.storageDir);
      } catch (dirError) {
        // Directory doesn't exist, create it
        await fs.mkdir(this.storageDir, { recursive: true });
      }
      
      // Check if file exists
      await fs.access(this.storageFile);
    } catch (error) {
      // File doesn't exist, create it with empty array
      await this._writeToFile([]);
    }
    this.initialized = true;
  }

  /**
   * Read addresses from storage file
   * @private
   * @returns {Promise<Array>} Array of address objects
   */
  async _readFromFile() {
    if (!this.initialized) {
      await this._initialize();
    }

    try {
      const data = await fs.readFile(this.storageFile, 'utf8');
      return JSON.parse(data || '[]');
    } catch (error) {
      console.error('Error reading storage file:', error.message);
      return [];
    }
  }

  /**
   * Write addresses to storage file
   * @private
   * @param {Array} addresses - Array of address objects
   * @returns {Promise<boolean>} Success status
   */
  async _writeToFile(addresses) {
    try {
      await fs.writeFile(this.storageFile, JSON.stringify(addresses, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing to storage file:', error.message);
      return false;
    }
  }

  /**
   * Save an email address with metadata
   * @param {string} address - Email address
   * @param {Object} metadata - Additional metadata (password, domain, etc.)
   * @returns {Promise<boolean>} Success status
   */
  async saveAddress(address, metadata = {}) {
    const addresses = await this._readFromFile();
    
    // Calculate expiration date (current time + expiration days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.expirationDays);
    
    // Check if address already exists
    const existingIndex = addresses.findIndex(item => item.address === address);
    
    const addressData = {
      address, // Ensure address is stored in the address field
      ...metadata,
      expiresAt: expiresAt.toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (existingIndex !== -1) {
      // Update existing address
      addresses[existingIndex] = {
        ...addresses[existingIndex],
        ...addressData
      };
    } else {
      // Add new address
      addressData.createdAt = new Date().toISOString();
      addresses.push(addressData);
    }
    
    return this._writeToFile(addresses);
  }

  /**
   * Get metadata for a specific email address
   * @param {string} address - Email address to get metadata for
   * @returns {Promise<Object|null>} Address metadata or null if not found
   */
  async getAddressMetadata(address) {
    const addresses = await this._readFromFile();
    const addressData = addresses.find(item => item.address === address);
    return addressData || null;
  }

  /**
   * Get all non-expired addresses
   * @param {boolean} includeExpired - Whether to include expired addresses (default: false)
   * @returns {Promise<Array>} Array of address objects
   */
  async getAddresses(includeExpired = false) {
    const addresses = await this._readFromFile();
    
    if (includeExpired) {
      return addresses;
    }
    
    const now = new Date();
    return addresses.filter(address => {
      const expiresAt = new Date(address.expiresAt);
      return expiresAt > now;
    });
  }

  /**
   * Remove an address from storage
   * @param {string} address - Email address to remove
   * @returns {Promise<boolean>} Success status
   */
  async removeAddress(address) {
    const addresses = await this._readFromFile();
    const filteredAddresses = addresses.filter(item => item.address !== address);
    
    // If no addresses were removed, return false
    if (filteredAddresses.length === addresses.length) {
      return false;
    }
    
    return this._writeToFile(filteredAddresses);
  }

  /**
   * Remove all expired addresses
   * @returns {Promise<number>} Number of addresses removed
   */
  async cleanupExpired() {
    const addresses = await this._readFromFile();
    const now = new Date();
    
    const validAddresses = addresses.filter(address => {
      const expiresAt = new Date(address.expiresAt);
      return expiresAt > now;
    });
    
    const removedCount = addresses.length - validAddresses.length;
    
    if (removedCount > 0) {
      await this._writeToFile(validAddresses);
    }
    
    return removedCount;
  }
}

module.exports = StorageService;

