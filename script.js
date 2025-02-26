// Constants
const GITHUB_GRAPHQL_API_URL = "https://api.github.com/graphql";
const RATE_LIMIT_ERROR = "RATE_LIMITED";
const MAX_USERS_PER_REQUEST = 25;

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

// Add ARIA labels and roles for accessibility
usernamesTextarea.setAttribute('aria-label', 'Enter GitHub usernames, one per line');
tokenInput.setAttribute('aria-label', 'GitHub Personal Access Token');
analyzeButton.setAttribute('aria-label', 'Analyze GitHub Connections');
progressBar.setAttribute('role', 'progressbar');
progressBar.setAttribute('aria-valuemin', '0');
progressBar.setAttribute('aria-valuemax', '100');
resultDiv.setAttribute('role', 'status');
resultDiv.setAttribute('aria-live', 'polite');

// Event Listeners
analyzeButton.addEventListener('click', analyzeConnections);
copyResultsButton.addEventListener('click', copyResults);
takeSnapshotButton.addEventListener('click', takeSnapshot);

// Theme switching functionality
const themeSwitch = document.querySelector('input[type="checkbox"]');
const body = document.body;
const themeLabel = document.getElementById('theme-label');

/**
 * Validate GitHub Personal Access Token
 * @param {string} token - GitHub Personal Access Token
 * @returns {Promise<boolean>} - Whether the token is valid
 */
async function validateToken(token) {
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}`
            }
        });

        if (response.status === 401) {
            throw new Error('Invalid token or insufficient permissions');
        }

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        return true;
    } catch (error) {
        console.error('Token validation error:', error);
        throw new Error(`Failed to validate token: ${error.message}`);
    }
}

/**
 * Clean and format GitHub username
 * @param {string} username - Raw username input
 * @returns {string} - Cleaned username
 */
function cleanUsername(username) {
    return username.trim()
        .replace(/^@/, '')
        .replace(/^(https?:\/\/)?(www\.)?github\.com\//, '')
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .toLowerCase();
}

/**
 * Main function to analyze GitHub connections
 */
async function analyzeConnections() {
    try {
        resetUI();
        updateProgress(0);

        // Get and validate input
        const usernames = usernamesTextarea.value
            .split('\n')
            .map(cleanUsername)
            .filter(username => username !== '');

        const token = tokenInput.value.trim();

        if (usernames.length < 2) {
            throw new Error('Please enter at least two GitHub usernames.');
        }

        if (!token) {
            throw new Error('Please provide a GitHub Personal Access Token.');
        }

        // Validate token
        await validateToken(token);

        resultDiv.textContent = 'Analyzing connections...';
        resultDiv.setAttribute('aria-busy', 'true');

        const connections = new Map();
        const failedUsernames = new Set();
        const totalChecks = usernames.length;
        let checksCompleted = 0;

        // Process users in batches to optimize API calls
        for (let i = 0; i < usernames.length; i += MAX_USERS_PER_REQUEST) {
            const batch = usernames.slice(i, i + MAX_USERS_PER_REQUEST);
            const [userInfoData, followingData] = await getUserInfoAndFollowing(batch, token);
            
            for (const username of batch) {
                try {
                    const followingInList = followingData[username].filter(user =>
                        usernames.includes(user.login.toLowerCase())
                    );
                    connections.set(userInfoData[username], followingInList);
                    checksCompleted++;
                    updateProgress((checksCompleted / totalChecks) * 100);
                } catch (error) {
                    console.error(`Error processing ${username}:`, error);
                    failedUsernames.add(username);
                }
            }
        }

        displayResults(connections, failedUsernames);
    } catch (error) {
        handleError(error);
    } finally {
        resultDiv.setAttribute('aria-busy', 'false');
    }
}

/**
 * Update progress bar and ARIA attributes
 * @param {number} percentage - Progress percentage (0-100)
 */
function updateProgress(percentage) {
    progressBar.style.width = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', percentage);
}

/**
 * Handle and display errors
 * @param {Error} error - Error object
 */
function handleError(error) {
    console.error('Application error:', error);
    resultDiv.textContent = `Error: ${error.message}`;
    resultDiv.style.color = '#dc3545';
    
    if (error.message.includes('rate limit')) {
        resultDiv.textContent += ' Please try again later.';
    }
}

/**
 * Fetch user information from GitHub API
 * @param {string} username - GitHub username
 * @param {string} token - GitHub Personal Access Token
 * @returns {Object} - User information
 */
function getUserInfo(userData) {
    console.log('Fetching user info for:', userData);
    return {
        login: userData.login,
        name: userData.name || userData.login,
        followers: userData.followers.totalCount,
        following: userData.following.totalCount
    };
}

async function fetchInitialFollowing(usernames, token) {
    const queries = usernames.map((username, i) => `
        user${i}: user(login: "${username}") {
            login
            name
            followers {
                totalCount
            }
            following(first: 100) {
                totalCount
                nodes {
                    login
                    name
                }
                pageInfo {
                    endCursor
                    hasNextPage
                }
            }
        }
    `);

    const fullQuery = `query { ${queries.join(' ')} }`;
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const response = await fetch(GITHUB_GRAPHQL_API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ query: fullQuery })
    });

    const data = await response.json();
    return data.data;
}

async function fetchAdditionalFollowing(username, cursor, token) {
    const query = `
    query($login: String!, $cursor: String) {
        user(login: $login) {
            following(first: 100, after: $cursor) {
                nodes {
                    login
                    name
                }
                pageInfo {
                    endCursor
                    hasNextPage
                }
            }
        }
    }`;

    const variables = { login: username, cursor: cursor };
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const response = await fetch(GITHUB_GRAPHQL_API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    return data.data.user.following;
}

async function getAllFollowing(username, initialFollowing, token) {
    let allFollowing = initialFollowing.nodes;
    let cursor = initialFollowing.pageInfo.endCursor;
    let hasNextPage = initialFollowing.pageInfo.hasNextPage;

    while (hasNextPage) {
        const { nodes, pageInfo } = await fetchAdditionalFollowing(username, cursor, token);
        allFollowing = allFollowing.concat(nodes);
        cursor = pageInfo.endCursor;
        hasNextPage = pageInfo.hasNextPage;
    }

    return allFollowing;
}

/**
 * Fetch all users that a given user is following
 * @param {string} username - GitHub username
 * @param {string} token - GitHub Personal Access Token
 * @returns {Array} - Array of user objects the given user is following
 */
async function getUserInfoAndFollowing(usernames, token) {
    const initialData = await fetchInitialFollowing(usernames, token);
    const userInfo = {};
    for (const userData of Object.values(initialData)) {
        console.log(userData);
        userInfo[userData.login.toLowerCase()] = getUserInfo(userData);
    }

    const followingData = {};

    for (const [i, username] of usernames.entries()) {
        const initialFollowing = initialData[`user${i}`].following;
        if (initialFollowing.pageInfo.hasNextPage) {
            followingData[username] = await getAllFollowing(username, initialFollowing, token);
        } else {
            followingData[username] = initialFollowing.nodes;
        }
    }

    return [userInfo, followingData];
}

/**
 * Display the analysis results in the UI
 * @param {Map} connections - Map of user connections
 * @param {Set} failedUsernames - Set of usernames that failed to fetch
 */
function displayResults(connections, failedUsernames) {
    if (connections.size === 0) {
        resultDiv.textContent = 'No valid connections found.';
        return;
    }

    resultDiv.textContent = 'Analysis complete!';
    
    // Create table
    const table = document.createElement('table');
    table.setAttribute('role', 'grid');
    table.innerHTML = createTableHeader(connections);
    table.innerHTML += createTableBody(connections);
    
    connectionsTableDiv.innerHTML = '';
    connectionsTableDiv.appendChild(table);
    
    // Show copy and snapshot buttons
    copyResultsButton.style.display = 'inline-block';
    takeSnapshotButton.style.display = 'inline-block';
    
    // Display failed usernames if any
    if (failedUsernames.size > 0) {
        displayFailedUsernames(failedUsernames);
    }
}

function createTableHeader(connections) {
    let headerHTML = `
    <thead>
        <tr>
            <th>Name <span class="caret">&#9658;</span></th>
            <th>Following <span class="caret">&#9658;</span></th>
            <th>Count <span class="caret">&#9658;</span></th>
            <th>Total Followers <span class="caret">&#9658;</span></th>
            <th>Total Following <span class="caret">&#9658;</span></th>
        </tr>
    </thead>
`;

    return headerHTML;
}

function createTableBody(connections) {
    let bodyHTML = '<tbody>';

    const sortedConnections = new Map([...connections.entries()].sort((a, b) => a[0].name.localeCompare(b[0].name)));

    for (const [user, following] of sortedConnections) {
        bodyHTML += `
            <tr>
                <td>${user.name}</td>
                <td>${following.map(f => f.name).join(', ') || 'None'}</td>
                <td>${following.length}</td>
                <td>${user.followers}</td>
                <td>${user.following}</td>
            </tr>
        `;
    }

    bodyHTML += '</tbody>';
    return bodyHTML;
}

function displayFailedUsernames(failedUsernames) {
    failedUsernamesDiv.style.display = 'block';
    failedUsernamesDiv.innerHTML = `
        <h3>Failed to fetch information for the following usernames:</h3>
        <ul>
            ${Array.from(failedUsernames).map(username => `<li>${username}</li>`).join('')}
        </ul>
    `;
}

// Function to handle theme switching
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

// Event listener for theme switch
themeSwitch.addEventListener('change', switchTheme);

// Check for saved theme preference and apply it
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