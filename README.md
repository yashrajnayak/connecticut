# Connecticut

A powerful web application for analyzing and visualizing GitHub connections between developers, particularly useful for developer meetups and networking events. The app helps organizers track and encourage networking by analyzing GitHub connections before and after events.

## Features

- 🔍 Analyze GitHub connections for multiple users simultaneously
- 📊 Display results in an interactive, sortable table
- 📈 Show detailed statistics including followers and following counts
- 🔗 Highlight direct and mutual connections between users
- 📋 Copy results to clipboard for easy sharing
- 📸 Create snapshots for before/after comparisons
- 📊 Compare snapshots to visualize connection growth over time
- 🌓 Dark/Light theme support
- 💻 Runs entirely in the browser - no server required

## Live Demo

Try Connecticut here: [https://yashrajnayak.github.io/connecticut/](https://yashrajnayak.github.io/connecticut/)

<img width="846" alt="Connecticut App Screenshot" src="https://github.com/user-attachments/assets/f13a249c-c181-42cf-99cf-ddc6a87da24e">

## Setup and Usage

### Prerequisites

1. A GitHub Personal Access Token with the following scopes:
   - `read:user`
   - `user:follow`

To create a token:
1. Go to GitHub Settings > Developer Settings > Personal Access Tokens
2. Click "Generate new token"
3. Select the required scopes
4. Copy and save your token securely

### Using the App

#### Analyze Mode

1. Visit the [Connecticut app](https://yashrajnayak.github.io/connecticut/)
2. Make sure "Analyze Connections" tab is selected
3. Enter GitHub usernames (one per line) in the textarea
4. Paste your GitHub Personal Access Token
5. Click "Analyze Connections"
6. View the results in the interactive table
7. Use "Copy Results" to share the analysis
8. Use "Take Snapshot" to save the current state for comparison

#### Compare Mode

1. Switch to the "Compare Snapshots" tab
2. Paste the earlier snapshot data into the "Snapshot 1" textarea
3. Paste the later snapshot data into the "Snapshot 2" textarea
4. Click the "Compare Snapshots" button to see the results
5. View a table of users sorted by number of new connections, showing before and after counts

### Rate Limiting

The app uses the GitHub GraphQL API, which has the following rate limits:
- 5,000 points per hour with an authenticated token
- Each request costs a certain number of points based on the complexity
- The app optimizes requests to minimize rate limit usage

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yashrajnayak/connecticut.git
   cd connecticut
   ```

2. Open `index.html` in your web browser
   ```bash
   # Using Python's built-in server
   python -m http.server 8000
   # Or using Node's http-server
   npx http-server
   ```

3. Visit `http://localhost:8000` (or the appropriate port)

No build process is required as the app runs entirely in the browser.

### Development Guidelines

- Follow the existing code style and formatting
- Test changes across different browsers
- Ensure dark/light theme compatibility
- Test with various numbers of users and connection patterns
- Verify error handling and rate limit handling

## Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Ways to Contribute

- Report bugs by [opening an issue](https://github.com/yashrajnayak/connecticut/issues/new)
- Suggest improvements or new features
- Submit pull requests for any open issues
- Improve documentation
- Add tests or improve error handling

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.