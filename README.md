# MCP Blockchain Server & DApp

A secure system enabling AI assistants to interact with blockchain smart contracts while ensuring users maintain complete control over their private keys and transaction signing.

## Overview

This project addresses a key challenge in AI-blockchain integration: allowing AI assistants to read blockchain data and prepare transactions while ensuring users maintain exclusive control over transaction signing and private keys.

![Architecture Overview](docs/images/architecture-overview.png)

## Key Features

- 🔒 **Secure by Design**: Private keys never leave the user's wallet
- 🤖 **AI Integration**: Simple API for AI assistants to query blockchain data
- 📝 **Transaction Preparation**: AI can prepare unsigned transactions for user review
- ✅ **User Approval**: Clear UI for reviewing and approving transactions
- 🌐 **Multi-Chain Support**: Works with multiple blockchain networks
- 🛠️ **MCP Protocol**: Built on the Model Context Protocol for standardized AI context handling

## Components

1. **MCP Server**: Node.js server handling blockchain operations and transaction preparation
2. **Web DApp**: React application for wallet connection and transaction approval
3. **AI Integration**: API and SDK for AI assistants to use the MCP Server

## Documentation

- [Architecture Overview](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Security Considerations](docs/security.md)
- [Getting Started](docs/getting-started.md)

## Development

```bash
# Clone the repository
git clone https://github.com/zhangzhongnan928/mcp-blockchain-server.git
cd mcp-blockchain-server

# Install dependencies
npm install

# Start development server
npm run dev
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
