// Get DOM elements
const analyzeButton = document.getElementById('analyze');
const usernamesTextarea = document.getElementById('usernames');
const tokenInput = document.getElementById('token');
const progressBar = document.getElementById('progress-inner');
const resultDiv = document.getElementById('result');
const connectionsTableDiv = document.getElementById('connections-table');
const failedUsernamesDiv = document.getElementById('failed-usernames');
const copyResultsButton = document.getElementById('copy-results');
const takeSnapshotButton = document.getElementById('take-snapshot');
const buttonContainer = document.querySelector('.button-container');

// Add event listeners
analyzeButton.addEventListener('click', analyzeConnections);
copyResultsButton.addEventListener('click', copyResults);
takeSnapshotButton.addEventListener('click', takeSnapshot);

/**
 * Clean and format the input username
 * @param {string} username - The input username
 * @returns {string} - The cleaned username
 */
function cleanUsername(username) {
    return username.trim()
        .replace(/^@/, '')
        .replace(/^(https?:\/\/)?(www\.)?github\.com\//, '')
        .replace(/[^a-zA-Z0-9-]+/g, '-');
}

/**
 * Main function to analyze GitHub connections
 */
async function analyzeConnections() {
    resetUI();

    // Get and clean usernames from textarea
    const usernames = usernamesTextarea.value
        .split('\n')
        .map(cleanUsername)
        .filter(username => username !== '');
    const token = tokenInput.value.trim();

    // Validate input
    if (usernames.length === 0) {
        alert('Please enter at least one GitHub username.');
        return;
    }

    if (!token) {
        alert('Please provide a GitHub Personal Access Token.');
        return;
    }

    resultDiv.textContent = 'Analyzing connections...';
    progressBar.style.width = '0%';

    const connections = new Map();
    const failedUsernames = new Set();
    const totalChecks = usernames.length;
    let checksCompleted = 0;

    // Fetch data for each username
    for (const username of usernames) {
        try {
            const userInfo = await getUserInfo(username, token);
            const following = await getFollowing(username, token);
            const followingInList = following.filter(user => usernames.includes(user.login) && user.login !== username);
            connections.set(userInfo, followingInList);
        } catch (error) {
            console.error('Error fetching user information:', error);
            failedUsernames.add(username);
        }
        checksCompleted++;
        progressBar.style.width = `${(checksCompleted / totalChecks) * 100}%`;
    }

    displayResults(connections, failedUsernames);
}

/**
 * Fetch user information from GitHub API
 * @param {string} username - GitHub username
 * @param {string} token - GitHub Personal Access Token
 * @returns {Object} - User information
 */
async function getUserInfo(username, token) {
    const url = `https://api.github.com/users/${username}`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`
    };

    const response = await fetch(url, { headers });

    if (response.status === 404) {
        throw new Error('User not found');
    }

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
        login: data.login,
        name: data.name || data.login,
        followers: data.followers,
        following: data.following
    };
}

/**
 * Fetch users that a given user is following
 * @param {string} username - GitHub username
 * @param {string} token - GitHub Personal Access Token
 * @returns {Array} - Array of user objects the given user is following
 */
async function getFollowing(username, token) {
    const url = `https://api.github.com/users/${username}/following?per_page=100`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`
    };

    const response = await fetch(url, { headers });

    if (response.status === 404) {
        throw new Error('User not found');
    }

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return Promise.all(data.map(user => getUserInfo(user.login, token)));
}

/**
 * Display the analysis results in the UI
 * @param {Map} connections - Map of user connections
 * @param {Set} failedUsernames - Set of usernames that failed to fetch
 */
function displayResults(connections, failedUsernames) {
    const totalConnections = Array.from(connections.values()).reduce((sum, following) => sum + following.length, 0);
    resultDiv.textContent = `Total connections: ${totalConnections}`;

    // Sort connections by name
    const sortedConnections = new Map([...connections.entries()].sort((a, b) => a[0].name.localeCompare(b[0].name)));

    // Create connections table
    let tableHTML = `
        <table>
            <tr>
                <th>Name</th>
                <th>Following</th>
                <th>Count</th>
                <th>Total Followers</th>
                <th>Total Following</th>
            </tr>
    `;

    for (const [user, following] of sortedConnections) {
        tableHTML += `
            <tr>
                <td>${user.name}</td>
                <td>${following.map(f => f.name).join(', ') || 'None'}</td>
                <td>${following.length}</td>
                <td>${user.followers}</td>
                <td>${user.following}</td>
            </tr>
        `;
    }

    tableHTML += '</table>';
    connectionsTableDiv.innerHTML = tableHTML;

    // Hide the token input field, label, and analyze button
    tokenInput.style.display = 'none';
    document.querySelector('label[for="token"]').style.display = 'none';
    analyzeButton.style.display = 'none';

    // Show the button container and the buttons
    buttonContainer.style.display = 'flex';
    copyResultsButton.style.display = 'inline-block';
    takeSnapshotButton.style.display = 'inline-block';

    // Display failed usernames
    if (failedUsernames.size > 0) {
        failedUsernamesDiv.style.display = 'block';
        failedUsernamesDiv.innerHTML = `
            <h3>Failed to fetch information for the following usernames:</h3>
            <ul>
                ${Array.from(failedUsernames).map(username => `<li>${username}</li>`).join('')}
            </ul>
        `;
    } else {
        failedUsernamesDiv.style.display = 'none';
    }
}


/**
 * Copy the results table to the clipboard
 */
function copyResults() {
    const table = document.querySelector('#connections-table table');
    const range = document.createRange();
    range.selectNode(table);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
    alert('Results copied to clipboard!');
}

/**
 * Take a snapshot of the current results and copy to clipboard
 */
function takeSnapshot() {
    const table = document.querySelector('#connections-table table');
    const rows = Array.from(table.querySelectorAll('tr'));
    const headers = rows.shift().querySelectorAll('th');
    const headerNames = Array.from(headers).map(header => header.textContent);

    const snapshot = rows.map(row => {
        const cells = row.querySelectorAll('td');
        const rowData = {};
        headerNames.forEach((header, index) => {
            rowData[header] = cells[index].textContent;
        });
        return rowData;
    });

    const timestamp = new Date().toISOString();
    const snapshotData = {
        timestamp: timestamp,
        data: snapshot
    };

    const snapshotString = JSON.stringify(snapshotData);
    navigator.clipboard.writeText(snapshotString).then(() => {
        alert('Snapshot copied to clipboard!');
    }, () => {
        alert('Failed to copy snapshot to clipboard. Please try again.');
    });
}

/**
 * Reset the UI to its initial state
 */
function resetUI() {
    resultDiv.textContent = '';
    progressBar.style.width = '0%';
    connectionsTableDiv.innerHTML = '';
    failedUsernamesDiv.style.display = 'none';
    buttonContainer.style.display = 'none';
}