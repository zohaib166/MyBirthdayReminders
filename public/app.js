// Register Service Worker for PWA capabilities
if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker Active', reg));
}

// Enable Notification Alerts & Sync Subscriptions
document.getElementById('enableNotifications').addEventListener('click', async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return alert('Permission denied');

    const res = await fetch('/api/vapid-key');
    const { publicKey } = await res.json();

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey
    });

    await fetch('/api/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription }),
        headers: { 'Content-Type': 'application/json' }
    });
    alert('Phone Alarms Configured Successfully!');
});

let editingId = null;

// Fetch and render birthdays
async function loadBirthdays() {
    const listEl = document.getElementById('bdayList');
    try {
        const res = await fetch('/api/birthdays');
        const birthdays = await res.json();
        
        if (birthdays.length === 0) {
            listEl.innerHTML = '<p>No birthdays saved yet.</p>';
            return;
        }

        listEl.innerHTML = birthdays.map(b => `
            <div class="bday-item">
                <div>
                    <strong>${b.name}</strong> <br>
                    <small>${b.full_date}</small>
                </div>
                <div class="bday-actions">
                    <button class="btn-edit" onclick="editBday(${b.id}, '${b.name.replace(/'/g, "\\'")}', '${b.full_date}')">Edit</button>
                    <button class="btn-delete" onclick="deleteBday(${b.id})">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        listEl.innerHTML = '<p>Error loading birthdays.</p>';
    }
}

// Global functions for inline onclick handlers
window.editBday = (id, name, date) => {
    editingId = id;
    document.getElementById('name').value = name;
    document.getElementById('date').value = date;
    document.getElementById('saveBtn').textContent = 'Update Birthday';
    document.getElementById('cancelBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteBday = async (id) => {
    if (!confirm('Are you sure you want to delete this birthday?')) return;
    await fetch(`/api/birthdays/${id}`, { method: 'DELETE' });
    loadBirthdays();
};

document.getElementById('cancelBtn').addEventListener('click', () => {
    editingId = null;
    document.getElementById('bdayForm').reset();
    document.getElementById('saveBtn').textContent = 'Save Birthday';
    document.getElementById('cancelBtn').style.display = 'none';
});

// Handle Birthday Form Submit
document.getElementById('bdayForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const birthDate = document.getElementById('date').value;

    const url = editingId ? `/api/birthdays/${editingId}` : '/api/birthdays';
    const method = editingId ? 'PUT' : 'POST';

    await fetch(url, {
        method,
        body: JSON.stringify({ name, birthDate }),
        headers: { 'Content-Type': 'application/json' }
    });
    
    alert(editingId ? 'Updated!' : 'Saved!');
    
    editingId = null;
    document.getElementById('bdayForm').reset();
    document.getElementById('saveBtn').textContent = 'Save Birthday';
    document.getElementById('cancelBtn').style.display = 'none';
    
    loadBirthdays();
});

// Load on start
loadBirthdays();

// Handle Settings Form Submit
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const daysBefore = parseInt(document.getElementById('daysBefore').value);
    const remindTime = document.getElementById('remindTime').value; // Keep the minute precision (e.g. HH:MM)

    await fetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ daysBefore, remindTime }),
        headers: { 'Content-Type': 'application/json' }
    });
    alert('Settings Saved!');
});