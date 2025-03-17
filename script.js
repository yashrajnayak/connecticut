// Constants
const GITHUB_GRAPHQL_API_URL = "https://api.github.com/graphql";
const RATE_LIMIT_ERROR = "RATE_LIMITED";
const MAX_USERS_PER_REQUEST = 25;
const MAX_CONNECTIONS_PER_BATCH = 100;

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

// Mode switching elements
const analyzeModeBtn = document.getElementById('analyze-mode');
const compareModeBtn = document.getElementById('compare-mode');
const analyzeSection = document.getElementById('analyze-section');
const compareSection = document.getElementById('compare-section');

// Compare elements
const compareButton = document.getElementById('compare');
const snapshot1Input = document.getElementById('snapshot1');
const snapshot2Input = document.getElementById('snapshot2');
const comparisonResultDiv = document.getElementById('comparison-result');

// Add ARIA labels and roles for accessibility
usernamesTextarea.setAttribute('aria-label', 'Enter GitHub usernames, one per line');
tokenInput.setAttribute('aria-label', 'GitHub Personal Access Token');
analyzeButton.setAttribute('aria-label', 'Analyze GitHub Connections');
progressBar.setAttribute('role', 'progressbar');
progressBar.setAttribute('aria-valuemin', '0');
progressBar.setAttribute('aria-valuemax', '100');
resultDiv.setAttribute('role', 'status');
resultDiv.setAttribute('aria-live', 'polite');
snapshot1Input.setAttribute('aria-label', 'Paste the earlier snapshot here');
snapshot2Input.setAttribute('aria-label', 'Paste the later snapshot here');
compareButton.setAttribute('aria-label', 'Compare Snapshots');
comparisonResultDiv.setAttribute('role', 'status');
comparisonResultDiv.setAttribute('aria-live', 'polite');

// Event Listeners
analyzeButton.addEventListener('click', analyzeConnections);
copyResultsButton.addEventListener('click', copyResults);
takeSnapshotButton.addEventListener('click', takeSnapshot);
compareButton.addEventListener('click', compareSnapshots);

// Mode switching event listeners
analyzeModeBtn.addEventListener('click', () => switchMode('analyze'));
compareModeBtn.addEventListener('click', () => switchMode('compare'));

// Theme switching functionality
const themeSwitch = document.querySelector('input[type="checkbox"]');
const body = document.body;
const themeLabel = document.getElementById('theme-label');

/**
 * Switch between analyze and compare modes
 * @param {string} mode - The mode to switch to ('analyze' or 'compare')
 */
function switchMode(mode) {
    if (mode === 'analyze') {
        analyzeModeBtn.classList.add('active');
        compareModeBtn.classList.remove('active');
        analyzeSection.classList.add('active');
        compareSection.classList.remove('active');
    } else {
        analyzeModeBtn.classList.remove('active');
        compareModeBtn.classList.add('active');
        analyzeSection.classList.remove('active');
        compareSection.classList.add('active');
    }
}

/**
 * Validate GitHub Personal Access Token
 * @param {string} token - GitHub Personal Access Token
 * @returns {Promise<boolean>} - Whether the token is valid
 */
async function validateToken(token) {
    try {
        // Use GraphQL to validate token - more efficient than REST API
        const query = `query { viewer { login } }`;
        const response = await fetchFromGitHub(query, null, token);
        
        if (response.errors) {
            const error = response.errors[0];
            if (error.type === RATE_LIMIT_ERROR) {
                throw new Error('API rate limit exceeded. Please try again later.');
            }
            throw new Error(`GitHub API error: ${error.message}`);
        }
        
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
 * Helper function to fetch data from GitHub GraphQL API
 * @param {string} query - GraphQL query
 * @param {Object} variables - Variables for the query
 * @param {string} token - GitHub Personal Access Token
 * @returns {Promise<Object>} - API response data
 */
async function fetchFromGitHub(query, variables, token) {
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const body = {
        query: query
    };
    
    if (variables) {
        body.variables = variables;
    }

    const response = await fetch(GITHUB_GRAPHQL_API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });

    return await response.json();
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
        buttonContainer.style.display = 'none';

        // Get connections data with optimized GraphQL queries
        const { userProfiles, connections, failedUsernames } = 
            await getConnectionsData(usernames, token);

        displayResults(userProfiles, connections, failedUsernames);
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
 * Get connections data using optimized GraphQL queries
 * @param {Array<string>} usernames - Array of GitHub usernames
 * @param {string} token - GitHub Personal Access Token
 * @returns {Promise<Object>} - Object containing user profiles, connections, and failed usernames
 */
async function getConnectionsData(usernames, token) {
    const userProfiles = new Map();
    const connections = new Map();
    const failedUsernames = new Set();
    const totalUsers = usernames.length;
    let completedUsers = 0;

    // Process users in batches for better efficiency
    for (let i = 0; i < usernames.length; i += MAX_USERS_PER_REQUEST) {
        const batch = usernames.slice(i, i + MAX_USERS_PER_REQUEST);
        try {
            // Fetch all user profiles in a single optimized query
            const profilesData = await fetchUserProfiles(batch, token);
            
            // Process profiles
            for (const username of batch) {
                const key = `user_${batch.indexOf(username)}`;
                const userData = profilesData[key];
                
                if (!userData) {
                    failedUsernames.add(username);
                    continue;
                }
                
                const profile = {
                    login: userData.login,
                    name: userData.name || userData.login,
                    followers: userData.followers.totalCount,
                    following: userData.following.totalCount
                };
                
                userProfiles.set(username, profile);
            }
            
            // Fetch all following connections in a single optimized query
            const followingData = await fetchAllFollowingConnections(batch, usernames, token);
            
            // Process connections
            for (const username of batch) {
                if (followingData[username]) {
                    connections.set(username, followingData[username]);
                } else {
                    connections.set(username, []);
                }
                
                completedUsers++;
                updateProgress((completedUsers / totalUsers) * 100);
            }
        } catch (error) {
            console.error(`Error processing batch starting with ${batch[0]}:`, error);
            batch.forEach(username => failedUsernames.add(username));
            completedUsers += batch.length;
            updateProgress((completedUsers / totalUsers) * 100);
        }
    }
    
    return { userProfiles, connections, failedUsernames };
}

/**
 * Fetch user profiles with an optimized GraphQL query
 * @param {Array<string>} usernames - Batch of GitHub usernames
 * @param {string} token - GitHub Personal Access Token
 * @returns {Promise<Object>} - Object with user profile data
 */
async function fetchUserProfiles(usernames, token) {
    const queries = usernames.map((username, i) => `
        user_${i}: user(login: "${username}") {
            login
            name
            followers {
                totalCount
            }
            following {
                totalCount
            }
        }
    `);

    const query = `query { ${queries.join(' ')} }`;
    const response = await fetchFromGitHub(query, null, token);
    
    if (response.errors) {
        console.error('GraphQL errors:', response.errors);
        throw new Error(response.errors[0].message);
    }
    
    return response.data;
}

/**
 * Fetch all following connections with an optimized approach
 * @param {Array<string>} sourceUsers - Users to check connections for
 * @param {Array<string>} targetUsers - All users in the list
 * @param {string} token - GitHub Personal Access Token
 * @returns {Promise<Object>} - Object with following connections
 */
async function fetchAllFollowingConnections(sourceUsers, targetUsers, token) {
    const connections = {};
    
    // Initialize empty arrays for each source user
    sourceUsers.forEach(username => {
        connections[username] = [];
    });
    
    // Create a map of batch: targetUsers for efficient querying
    const batchTargets = {};
    for (let i = 0; i < targetUsers.length; i += MAX_CONNECTIONS_PER_BATCH) {
        const batchIndex = Math.floor(i / MAX_CONNECTIONS_PER_BATCH);
        batchTargets[batchIndex] = targetUsers.slice(i, i + MAX_CONNECTIONS_PER_BATCH);
    }
    
    // For each source user, check if they follow users in batches
    for (const sourceUser of sourceUsers) {
        for (const [batchIndex, batchUsers] of Object.entries(batchTargets)) {
            await fetchFollowingBatch(sourceUser, batchUsers, connections, token);
        }
    }
    
    return connections;
}

/**
 * Fetch following connections for a batch of users
 * @param {string} sourceUser - User to check connections from
 * @param {Array<string>} targetUsers - Batch of users to check connections to
 * @param {Object} connections - Object to store connections
 * @param {string} token - GitHub Personal Access Token
 */
async function fetchFollowingBatch(sourceUser, targetUsers, connections, token) {
    // Create a query that checks if sourceUser follows each targetUser
    const followsQueries = targetUsers.map((targetUser, i) => `
        follows_${i}: following(first: 1, query: "${targetUser}") {
            nodes {
                login
                name
            }
        }
    `);
    
    const query = `
    query {
        user(login: "${sourceUser}") {
            ${followsQueries.join('\n')}
        }
    }`;
    
    try {
        const response = await fetchFromGitHub(query, null, token);
        
        if (response.errors) {
            console.error(`GraphQL errors for ${sourceUser}:`, response.errors);
            return;
        }
        
        if (!response.data || !response.data.user) {
            console.error(`Invalid response for ${sourceUser}:`, response.data);
            return;
        }
        
        // Process the results
        const userData = response.data.user;
        
        for (let i = 0; i < targetUsers.length; i++) {
            const followsData = userData[`follows_${i}`];
            if (followsData && followsData.nodes && followsData.nodes.length > 0) {
                const followedUser = followsData.nodes[0];
                connections[sourceUser].push(followedUser);
            }
        }
    } catch (error) {
        console.error(`Error fetching following batch for ${sourceUser}:`, error);
    }
}

/**
 * Display the analysis results in the UI
 * @param {Map} userProfiles - Map of user profile data
 * @param {Map} connections - Map of user connections
 * @param {Set} failedUsernames - Set of usernames that failed to fetch
 */
function displayResults(userProfiles, connections, failedUsernames) {
    if (userProfiles.size === 0) {
        resultDiv.textContent = 'No valid connections found.';
        return;
    }

    resultDiv.textContent = 'Analysis complete!';
    
    // Create the connection data for display
    const displayData = new Map();
    for (const [username, profile] of userProfiles.entries()) {
        // Find which users this user follows
        const following = connections.get(username) || [];
        displayData.set(profile, following);
    }
    
    // Create table
    const table = document.createElement('table');
    table.setAttribute('role', 'grid');
    table.innerHTML = createTableHeader();
    table.innerHTML += createTableBody(displayData);
    
    connectionsTableDiv.innerHTML = '';
    connectionsTableDiv.appendChild(table);
    
    // Add sorting functionality to the table
    addTableSorting(table);
    
    // Show copy and snapshot buttons
    copyResultsButton.style.display = 'inline-block';
    takeSnapshotButton.style.display = 'inline-block';
    buttonContainer.style.display = 'block';
    
    // Display failed usernames if any
    if (failedUsernames.size > 0) {
        displayFailedUsernames(failedUsernames);
    }
}

/**
 * Add sorting functionality to the table
 * @param {HTMLElement} table - The table element
 */
function addTableSorting(table) {
    const headers = table.querySelectorAll('th');
    
    headers.forEach((header, index) => {
        header.addEventListener('click', () => {
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // Sort the rows based on the column value
            const sortedRows = rows.sort((a, b) => {
                const aValue = a.querySelectorAll('td')[index].textContent;
                const bValue = b.querySelectorAll('td')[index].textContent;
                
                // Handle numeric sorting
                if (index === 2 || index === 3 || index === 4) {
                    return parseInt(aValue) - parseInt(bValue);
                }
                
                // Handle text sorting
                return aValue.localeCompare(bValue);
            });
            
            // Toggle sorting direction
            if (header.classList.contains('sorted-asc')) {
                sortedRows.reverse();
                header.classList.remove('sorted-asc');
                header.classList.add('sorted-desc');
            } else {
                header.classList.remove('sorted-desc');
                header.classList.add('sorted-asc');
            }
            
            // Reset other headers
            headers.forEach(h => {
                if (h !== header) {
                    h.classList.remove('sorted-asc', 'sorted-desc');
                }
            });
            
            // Replace tbody with sorted rows
            tbody.innerHTML = '';
            sortedRows.forEach(row => tbody.appendChild(row));
        });
    });
}

function createTableHeader() {
    let headerHTML = `
    <thead>
        <tr>
            <th>Name <span class="caret">&#9658;</span></th>
            <th>Following <span class="caret">&#9658;</span></th>
            <th>Count <span class="caret">&#9658;</span></th>
            <th>Total Followers <span class="caret">&#9658;</span></th>
            <th>Total Following <span class="caret">&#9658;</span></th>
        </tr>
    </thead>`;

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
    const headerNames = Array.from(headers).map(header => header.textContent.trim().replace(/[^a-zA-Z0-9 ]/g, ''));

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
        alert('Snapshot copied to clipboard! You can now use it in the Compare tab.');
    }, () => {
        alert('Failed to copy snapshot to clipboard. Please try again.');
    });
}

/**
 * Compare two snapshots and display the results
 */
function compareSnapshots() {
    try {
        const snapshot1 = JSON.parse(snapshot1Input.value);
        const snapshot2 = JSON.parse(snapshot2Input.value);

        const comparison = snapshot2.data.map(user2 => {
            const user1 = snapshot1.data.find(u => u.Name === user2.Name);
            const before = user1 ? parseInt(user1.Count) : 0;
            const after = parseInt(user2.Count);
            const newConnections = after - before;
            return { Name: user2.Name, Before: before, After: after, NewConnections: newConnections };
        });

        comparison.sort((a, b) => b.NewConnections - a.NewConnections);

        displayComparisonResults(comparison, snapshot1.timestamp, snapshot2.timestamp);

        // Clear the snapshot fields after displaying the result
        snapshot1Input.value = '';
        snapshot2Input.value = '';
    } catch (error) {
        alert('Error parsing snapshots. Please make sure you\'ve pasted valid snapshot data.');
        console.error(error);
    }
}

/**
 * Display the comparison results in the UI
 * @param {Array} comparison - Array of comparison results
 * @param {string} timestamp1 - Timestamp of the first snapshot
 * @param {string} timestamp2 - Timestamp of the second snapshot
 */
function displayComparisonResults(comparison, timestamp1, timestamp2) {
    const totalNewConnections = comparison.reduce((sum, user) => sum + user.NewConnections, 0);

    let resultHTML = `
        <h2>Comparison Results</h2>
        <p>Snapshot 1 Time: ${new Date(timestamp1).toLocaleString()}</p>
        <p>Snapshot 2 Time: ${new Date(timestamp2).toLocaleString()}</p>
        <p>Total New Connections: ${totalNewConnections}</p>
        <table class="comparison-table">
            <tr>
                <th>Name</th>
                <th>Before</th>
                <th>After</th>
                <th>New Connections</th>
            </tr>
    `;

    comparison.forEach(user => {
        resultHTML += `
            <tr>
                <td>${user.Name}</td>
                <td>${user.Before}</td>
                <td>${user.After}</td>
                <td>${user.NewConnections}</td>
            </tr>
        `;
    });

    resultHTML += '</table>';
    comparisonResultDiv.innerHTML = resultHTML;
}

/**
 * Reset the UI to its initial state
 */
function resetUI() {
    resultDiv.textContent = '';
    resultDiv.style.color = ''; // Reset color
    progressBar.style.width = '0%';
    connectionsTableDiv.innerHTML = '';
    failedUsernamesDiv.style.display = 'none';
    buttonContainer.style.display = 'none';
    comparisonResultDiv.innerHTML = '';
}