# Temporary Email CLI

A command-line interface tool for creating and managing temporary email addresses using the mail.tm service.

## Features

- Create temporary email addresses
- List all created email addresses with their expiration dates
- Check inbox for received emails
- Read email content including HTML messages
- Auto-cleanup of expired email addresses
- User-friendly interactive interface

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/temp-email-cli.git
   ```

2. Install dependencies:
   ```bash
   cd temp-email-cli
   npm install
   ```

## Usage

Run the CLI tool:
```bash
node index.js
```

The interactive menu will guide you through the following options:
- Create new email address
- List existing email addresses
- Check inbox
- Read email
- Exit

## Configuration

Email addresses are automatically stored in `addresses.json` and expire after 7 days.

## Dependencies

- axios: HTTP client for API requests
- inquirer: Interactive command line interface
- chalk: Terminal string styling
- cli-table3: Pretty console tables
- html-to-text: HTML to plain text conversion

## License

MIT

