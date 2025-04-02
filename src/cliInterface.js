const inquirer = require('inquirer');
const Table = require('cli-table3');
const { htmlToText } = require('html-to-text');
const chalk = require('chalk');

class CLIInterface {
  constructor(emailService, storageService) {
    this.emailService = emailService;
    this.storageService = storageService;
  }

  /**
   * Create a new temporary email address
   */
  async createNewEmail() {
    console.log(chalk.cyan('Creating a new temporary email address...'));
    
    try {
      const result = await this.emailService.createEmailAddress();
      
      if (result) {
        // Save the new address with metadata
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7);
        
        await this.storageService.saveAddress(result.address, {
          id: result.id,
          token: result.token,
          password: result.password,
          createdAt: new Date().toISOString(),
          expiresAt: expirationDate.toISOString()
        });
        
        console.log('\n' + chalk.green('✓ Success! Your temporary email is ready:'));
        console.log(chalk.cyan('Email:   ') + chalk.yellow(result.address));
        console.log(chalk.cyan('Expires: ') + chalk.yellow(expirationDate.toLocaleDateString()));
        console.log('\nThis address will be valid for 7 days.');
      }
    } catch (error) {
      this.displayError('Failed to create a new email address', error);
    }
  }

  /**
   * List all available email addresses
   */
  async listAddresses() {
    try {
      const addresses = await this.storageService.getAddresses();
      
      if (!addresses || addresses.length === 0) {
        this.displayInfo('No email addresses found. Create one using the \"create\" command.');
        return;
      }
      
      const table = new Table({
        head: [
          chalk.cyan('Email Address'), 
          chalk.cyan('Created Date'), 
          chalk.cyan('Expires On'), 
          chalk.cyan('Status')
        ],
        colWidths: [40, 20, 20, 15]
      });
      
      addresses.forEach(address => {
        const createdDate = new Date(address.createdAt).toLocaleDateString();
        const expiresDate = new Date(address.expiresAt).toLocaleDateString();
        const now = new Date();
        const expirationDate = new Date(address.expiresAt);
        
        let status = chalk.green('Active');
        if (expirationDate < now) {
          status = chalk.red('Expired');
        } else if (expirationDate - now < 24 * 60 * 60 * 1000) {
          status = chalk.yellow('Expiring soon');
        }
        
        table.push([address.address, createdDate, expiresDate, status]);
      });
      
      console.log(table.toString());
    } catch (error) {
      this.displayError('Failed to list email addresses', error);
    }
  }

  /**
   * Check inbox for a selected address
   */
  async checkInbox() {
    try {
      const addresses = await this.storageService.getAddresses();
      if (!addresses || addresses.length === 0) {
        console.log(chalk.yellow('No email addresses found. Create one first!'));
        return;
      }

      const { selectedAddress } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedAddress',
        message: 'Select email address to check:',
        choices: addresses.map(addr => ({
          name: `${addr.address} (expires: ${new Date(addr.expiresAt).toLocaleDateString()})`,
          value: addr
        }))
      }]);

      console.log(chalk.cyan('\nFetching emails...'));
      
      const emails = await this.emailService.getEmails(selectedAddress.address, selectedAddress.password);
      
      if (!emails || emails.length === 0) {
        console.log(chalk.yellow('\nNo emails found in this inbox.'));
        return;
      }

      const table = new Table({
        head: ['From', 'Subject', 'Received'].map(h => chalk.cyan(h)),
        style: { head: [], border: [] }
      });

      emails.forEach(email => {
        table.push([
          email.from.address,
          email.subject || '(No subject)',
          new Date(email.receivedDate).toLocaleString()
        ]);
      });

      console.log('\n' + table.toString());
      
      // Store emails temporarily for the readEmail command
      this.currentEmails = emails;
      this.currentAddress = selectedAddress.address;
      this.currentAddressData = selectedAddress;
    } catch (error) {
      this.displayError('Failed to check inbox', error);
    }
  }

  /**
   * Read a specific email
   */
  async readEmail() {
    try {
      const addresses = await this.storageService.getAddresses();
      if (!addresses || addresses.length === 0) {
        console.log(chalk.yellow('No email addresses found. Create one first!'));
        return;
      }

      const { selectedAddress } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedAddress',
        message: 'Select email address:',
        choices: addresses.map(addr => ({
          name: `${addr.address} (expires: ${new Date(addr.expiresAt).toLocaleDateString()})`,
          value: addr
        }))
      }]);

      console.log(chalk.cyan('\nFetching emails...'));
      
      const emails = await this.emailService.getEmails(selectedAddress.address, selectedAddress.password);
      
      if (emails.length === 0) {
        console.log(chalk.yellow('\nNo emails found in this inbox.'));
        return;
      }

      const { messageId } = await inquirer.prompt([{
        type: 'list',
        name: 'messageId',
        message: 'Select email to read:',
        choices: emails.map(email => ({
          name: `From: ${email.from.address} - Subject: ${email.subject || '(No subject)'}`,
          value: email.id
        }))
      }]);

      console.log(chalk.cyan('\nFetching email content...'));
      const email = await this.emailService.getEmailContent(messageId, selectedAddress.address, selectedAddress.password);

      console.log('\n' + chalk.cyan('From: ') + email.from.address);
      console.log(chalk.cyan('To: ') + email.to.map(t => t.address).join(', '));
      console.log(chalk.cyan('Subject: ') + (email.subject || '(No subject)'));
      console.log(chalk.cyan('Date: ') + new Date(email.receivedDate).toLocaleString());
      console.log('\n' + chalk.cyan('Content:'));
      console.log(htmlToText(email.html || email.text || '(No content)'));

      if (email.attachments && email.attachments.length > 0) {
        console.log('\n' + chalk.cyan('Attachments:'));
        email.attachments.forEach(att => {
          console.log(`- ${att.filename} (${att.contentType})`);
        });
      }
    } catch (error) {
      this.displayError('Failed to read email', error);
    }
  }

  // Helper methods for formatting output
  displaySuccess(message) {
    console.log(chalk.green('✓'), message);
  }
  
  displayError(message, error) {
    console.error(chalk.red('✗ ERROR:'), message);
    if (error?.message) {
      console.error(chalk.red('  Details:'), error.message);
    }
  }
  
  displayInfo(message) {
    console.log(chalk.blue('ℹ'), message);
  }
  
  /**
   * Format a table of data
   */
  formatTable(headers, data, options = {}) {
    const table = new Table({
      head: headers.map(h => chalk.cyan(h)),
      ...options
    });
    
    data.forEach(row => table.push(row));
    return table.toString();
  }
}

module.exports = CLIInterface;

