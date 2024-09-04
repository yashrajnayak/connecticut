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

// Add these constants at the top of the file
const themeSwitch = document.querySelector('input[type="checkbox"]');
const body = document.body;
const themeLabel = document.getElementById('theme-label');

// Add this function to validate the GitHub token
async function validateToken(token) {
    const url = 'https://api.github.com/user';
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`
    };

    try {
        const response = await fetch(url, { headers });
        if (response.ok) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error('Error validating token:', error);
        return false;
    }
}

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
    if (usernames.length < 2) {
        alert('Please enter at least two GitHub usernames.');
        return;
    }

    if (!token) {
        alert('Please provide a GitHub Personal Access Token.');
        return;
    }

    // Validate the token
    const isValidToken = await validateToken(token);
    if (!isValidToken) {
        alert('Invalid GitHub Personal Access Token. Please check and try again.');
        return;
    }

    resultDiv.textContent = 'Analyzing connections...';
    progressBar.style.width = '0%';

    const connections = new Map();
    const failedUsernames = new Set();
    const totalChecks = usernames.length;
    let checksCompleted = 0;

    // Convert all input usernames to lowercase for case-insensitive comparison
    const lowercaseUsernames = usernames.map(username => username.toLowerCase());

    // Process each username
    for (const username of usernames) {
        try {
            console.log(`Processing ${username}`);
            
            // Fetch user info
            const userInfo = await getUserInfo(username, token);
            console.log(`User info for ${username}:`, userInfo);
            
            // Fetch list of users this user is following
            const following = await getFollowing(username, token);
            console.log(`${username} is following ${following.length} users`);
            console.log(`${username} is following:`, following.map(u => u.login));
            
            // Filter following to only include users from our input list (case-insensitive)
            const followingInList = following.filter(user => 
                lowercaseUsernames.includes(user.login.toLowerCase())
            );
            
            console.log(`${username} is following in our list:`, followingInList.map(u => u.login));
            
            // Store the connections for this user
            connections.set(userInfo, followingInList);
        } catch (error) {
            console.error(`Error processing ${username}:`, error);
            failedUsernames.add(username);
        }
        
        // Update progress bar
        checksCompleted++;
        progressBar.style.width = `${(checksCompleted / totalChecks) * 100}%`;
    }

    // Log final connections for debugging
    console.log('Final connections:');
    for (const [user, following] of connections) {
        console.log(`${user.login} is following:`, following.map(f => f.login));
    }

    // Display the results
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
 * Fetch all users that a given user is following
 * @param {string} username - GitHub username
 * @param {string} token - GitHub Personal Access Token
 * @returns {Array} - Array of user objects the given user is following
 */
async function getFollowing(username, token) {
    let page = 1;
    let allFollowing = [];
    
    while (true) {
        const url = `https://api.github.com/users/${username}/following?per_page=100&page=${page}`;
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`
        };

        console.log(`Fetching following for ${username}, page ${page}`);
        const response = await fetch(url, { headers });

        if (response.status === 404) {
            throw new Error('User not found');
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Received ${data.length} results for ${username}, page ${page}`);
        
        allFollowing = allFollowing.concat(data);

        // Stop if we received fewer than 100 results
        if (data.length < 100) {
            break;
        }

        page++;
    }

    console.log(`Total following for ${username}: ${allFollowing.length}`);
    return Promise.all(allFollowing.map(user => getUserInfo(user.login, token)));
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

// Add this function to handle theme switching
function switchTheme(e) {
    if (e.target.checked) {
        body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeLabel.textContent = 'Dark Mode';
    } else {
        body.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        themeLabel.textContent = 'Light Mode';
    }    
}

// Add event listener for theme switch
themeSwitch.addEventListener('change', switchTheme);

// Check for saved theme preference
const currentTheme = localStorage.getItem('theme');
if (currentTheme) {
    body.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') {
        themeSwitch.checked = true;
        themeLabel.textContent = 'Dark Mode';
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