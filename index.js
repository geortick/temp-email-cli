#!/usr/bin/env node

const inquirer = require('inquirer');
const EmailService = require('./src/emailService');
const StorageService = require('./src/storageService');
const CLIInterface = require('./src/cliInterface');

// Initialize services
const emailService = new EmailService();
const storageService = new StorageService();
const cliInterface = new CLIInterface(emailService, storageService);

// Main menu options
const mainMenuChoices = [
  { name: 'Create new email address', value: 'create' },
  { name: 'List existing email addresses', value: 'list' },
  { name: 'Check inbox', value: 'inbox' },
  { name: 'Read email', value: 'read' },
  { name: 'Exit', value: 'exit' }
];

// Main function to start the CLI application
async function main() {
  console.log('\n🔒 Temporary Email CLI 🔒\n');
  
  try {
    // Clean up expired addresses on startup
    await storageService.cleanupExpired();
    
    // Start the command loop
    await showMainMenu();
  } catch (error) {
    console.error('An unexpected error occurred:', error.message);
    process.exit(1);
  }
}

// Display the main menu and handle the selected option
async function showMainMenu() {
  try {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: mainMenuChoices
      }
    ]);

    // Execute the selected command
    await handleCommand(action);
  } catch (error) {
    console.error('Error displaying menu:', error.message);
    await pressEnterToContinue();
  }
}

// Handle the selected command
async function handleCommand(command) {
  try {
    switch (command) {
      case 'create':
        await cliInterface.createNewEmail();
        break;
      case 'list':
        await cliInterface.listAddresses();
        break;
      case 'inbox':
        await cliInterface.checkInbox();
        break;
      case 'read':
        await cliInterface.readEmail();
        break;
      case 'exit':
        console.log('👋 Thank you for using Temporary Email CLI. Goodbye!');
        process.exit(0);
      default:
        console.log('Invalid option. Please try again.');
    }

    // Return to main menu after command completion
    await pressEnterToContinue();
    await showMainMenu();
  } catch (error) {
    console.error(`Error executing command '${command}':`, error.message);
    await pressEnterToContinue();
    await showMainMenu();
  }
}

// Helper function to pause execution until user presses Enter
async function pressEnterToContinue() {
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...',
    }
  ]);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Exiting Temporary Email CLI. Goodbye!');
  process.exit(0);
});

// Start the application
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

