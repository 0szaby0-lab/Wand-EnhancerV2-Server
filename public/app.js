const API_URL = '/api';
let token = localStorage.getItem('adminToken');
let usersData = [];

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const usersTbody = document.getElementById('users-tbody');
const searchInput = document.getElementById('search-input');

// Modal Elements
const subModal = document.getElementById('sub-modal');
const notesModal = document.getElementById('notes-modal');
const closeBtns = document.querySelectorAll('.close-modal, .close-modal-btn');
let currentUserId = null;

// Initialize
if (token) {
    showDashboard();
}

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (res.ok) {
            token = data.token;
            localStorage.setItem('adminToken', token);
            showDashboard();
        } else {
            loginError.textContent = data.error;
        }
    } catch (err) {
        loginError.textContent = 'Hálózati hiba történt.';
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    token = null;
    localStorage.removeItem('adminToken');
    loginScreen.classList.add('active');
    dashboardScreen.classList.remove('active');
});

// Show Dashboard & Load Data
async function showDashboard() {
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
    await loadData();
    // Auto refresh every 30s
    setInterval(loadData, 30000);
}

// Fetch API Helper
async function fetchAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(`${API_URL}/admin${endpoint}`, options);
    if (res.status === 401 || res.status === 403) {
        logoutBtn.click();
        throw new Error('Unauthorized');
    }
    return await res.json();
}

// Load Stats & Users
async function loadData() {
    try {
        const [stats, users] = await Promise.all([
            fetchAPI('/stats'),
            fetchAPI('/users')
        ]);
        
        document.getElementById('stat-total').textContent = stats.totalUsers;
        document.getElementById('stat-active').textContent = stats.activeSubs;
        document.getElementById('stat-online').textContent = stats.onlineUsers;
        document.getElementById('stat-banned').textContent = stats.bannedUsers;
        
        usersData = users;
        renderUsers();
    } catch (err) {
        console.error(err);
    }
}

// Render Users Table
function renderUsers() {
    const searchTerm = searchInput.value.toLowerCase();
    const filtered = usersData.filter(u => 
        u.username.toLowerCase().includes(searchTerm) || 
        (u.hwid && u.hwid.toLowerCase().includes(searchTerm))
    );

    usersTbody.innerHTML = filtered.map(user => {
        let subBadge = '';
        if (user.isBanned) {
            subBadge = `<span class="badge badge-banned">Tiltva</span>`;
        } else if (user.isActive) {
            const daysLeft = Math.ceil((new Date(user.subscriptionExpires) - new Date()) / (1000 * 60 * 60 * 24));
            subBadge = `<span class="badge badge-active">Aktív (${daysLeft} nap)</span>`;
        } else {
            subBadge = `<span class="badge badge-expired">Lejárt/Nincs</span>`;
        }

        return `
            <tr>
                <td><span class="status-dot ${user.isOnline ? 'status-online' : 'status-offline'}" title="${user.isOnline ? 'Online' : 'Offline'}"></span></td>
                <td><strong>${user.username}</strong></td>
                <td>${user.currentlyPlaying ? `<span class="badge badge-active"><i class="fas fa-gamepad"></i> ${user.currentlyPlaying}</span>` : '<span class="text-muted">-</span>'}</td>
                <td><small class="text-muted" title="${user.hwid || 'Nincs'}">${user.hwid ? user.hwid.substring(0, 15) + '...' : 'Nincs'}</small></td>
                <td>${user.assignedPort}</td>
                <td>${subBadge}</td>
                <td><small>${user.lastLogin ? new Date(user.lastLogin).toLocaleString('hu-HU') : 'Soha'}</small></td>
                <td>
                    <button class="btn-action" onclick="openSubModal('${user._id}', '${user.username}', ${user.subscriptionDays})" title="Előfizetés"><i class="fas fa-calendar-alt"></i></button>
                    <button class="btn-action" onclick="resetHwid('${user._id}')" title="HWID Reset"><i class="fas fa-microchip"></i></button>
                    <button class="btn-action ${user.isBanned ? 'text-danger' : ''}" onclick="toggleBan('${user._id}', ${user.isBanned})" title="${user.isBanned ? 'Unban' : 'Ban'}"><i class="fas fa-ban"></i></button>
                    <button class="btn-action" onclick="openNotesModal('${user._id}')" title="Megjegyzés"><i class="fas fa-sticky-note"></i></button>
                    <button class="btn-action text-danger" onclick="deleteUser('${user._id}')" title="Törlés"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// Search
searchInput.addEventListener('input', renderUsers);

// Actions
async function resetHwid(id) {
    if (confirm('Biztosan törlöd a felhasználó HWID zárolását? Így más gépről is be tud lépni.')) {
        await fetchAPI(`/users/${id}/reset-hwid`, 'POST');
        loadData();
    }
}

async function toggleBan(id, isCurrentlyBanned) {
    const action = isCurrentlyBanned ? 'feloldod a tiltást' : 'letiltod';
    if (confirm(`Biztosan ${action} ezt a felhasználót?`)) {
        await fetchAPI(`/users/${id}`, 'PUT', { isBanned: !isCurrentlyBanned });
        loadData();
    }
}

async function deleteUser(id) {
    if (confirm('VIGYÁZAT! Biztosan véglegesen törlöd ezt a felhasználót?')) {
        await fetchAPI(`/users/${id}`, 'DELETE');
        loadData();
    }
}

// Modal Logic
closeBtns.forEach(btn => btn.addEventListener('click', () => {
    subModal.classList.remove('active');
    notesModal.classList.remove('active');
}));

window.openSubModal = (id, username, currentDays) => {
    currentUserId = id;
    document.getElementById('sub-username').textContent = username;
    document.getElementById('sub-days').value = currentDays || 30;
    subModal.classList.add('active');
};

document.getElementById('save-sub-btn').addEventListener('click', async () => {
    const days = document.getElementById('sub-days').value;
    await fetchAPI(`/users/${currentUserId}/subscription`, 'POST', { days: parseInt(days) });
    subModal.classList.remove('active');
    loadData();
});

window.openNotesModal = (id) => {
    currentUserId = id;
    const user = usersData.find(u => u._id === id);
    document.getElementById('user-notes').value = user.notes || '';
    notesModal.classList.add('active');
};

document.getElementById('save-notes-btn').addEventListener('click', async () => {
    const notes = document.getElementById('user-notes').value;
    await fetchAPI(`/users/${currentUserId}`, 'PUT', { notes });
    notesModal.classList.remove('active');
    loadData();
});
